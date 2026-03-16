"""Ed25519 signature and payment verification for TVM (TON) networks.

5 verification rules for TON x402 payments:
1. Protocol: scheme and network match
2. Signature: valid Ed25519 on W5 message (signature at tail)
3. Payment intent: exactly 1 jetton transfer with correct amount/destination
4. Replay protection: seqno, validUntil, BoC hash dedup
5. Simulation: optional pre-simulation check
"""

from __future__ import annotations

import base64
import time
from dataclasses import dataclass
from typing import Any

try:
    from nacl.exceptions import BadSignatureError
    from nacl.signing import VerifyKey
    from pytoniq_core import Builder, Cell
except ImportError as e:
    raise ImportError(
        "TVM mechanism requires pytoniq-core and PyNaCl. Install with: pip install x402[tvm]"
    ) from e

from .boc import compute_boc_hash, extract_jetton_transfer, parse_external_message, parse_w5_body
from .constants import (
    INTERNAL_SIGNED_OP,
    EXTERNAL_SIGNED_OP,
    SCHEME_EXACT,
    SUPPORTED_NETWORKS,
    W5R1_CODE_HASH,
)
from .signer import FacilitatorTvmSigner
from .types import TvmPaymentPayload, VerifyResult
from .utils import normalize_address


@dataclass
class VerifyConfig:
    """Configuration for payment verification."""

    supported_networks: set[str] | None = None
    skip_simulation: bool = True
    max_valid_until_seconds: int = 600


# In-memory dedup cache for BoC hashes
_seen_boc_hashes: set[str] = set()


def verify_w5_signature(boc_b64: str, pubkey_hex: str) -> tuple[bool, str]:
    """Verify the Ed25519 signature of a W5R1 external message.

    W5R1 body layout: [signing_message_data...] [signature(512 bits at tail)]
    The signature is always the LAST 512 bits of the body cell.

    Args:
        boc_b64: Base64-encoded BoC containing the external message.
        pubkey_hex: Hex-encoded Ed25519 public key of the wallet owner.

    Returns:
        (True, "") on success, (False, reason) on failure.
    """
    try:
        body = parse_external_message(boc_b64)
    except Exception as e:
        return False, f"Failed to parse BoC: {e}"

    body_slice = body.begin_parse()

    # V5R1 body layout: [signing_message_data...] [signature(512 bits at tail)]
    # The signature is always the LAST 512 bits of the body cell.
    total_bits = body_slice.remaining_bits
    if total_bits < 512:
        return False, f"Body too short for signature: {total_bits} bits"

    signed_data_bits = total_bits - 512  # everything before the signature
    refs_count = body_slice.remaining_refs

    # Reconstruct the signing message cell (data before signature + all refs)
    builder = Builder()
    if signed_data_bits > 0:
        builder.store_bits(body_slice.load_bits(signed_data_bits))
    for _ in range(refs_count):
        builder.store_ref(body_slice.load_ref())
    signed_cell = builder.end_cell()
    signed_data = signed_cell.hash

    # Read signature from the remaining 512 bits
    signature = body_slice.load_bytes(64)

    try:
        verify_key = VerifyKey(bytes.fromhex(pubkey_hex))
    except Exception as e:
        return False, f"Invalid public key: {e}"

    try:
        verify_key.verify(signed_data, signature)
    except BadSignatureError:
        return False, "Ed25519 signature verification failed"
    except Exception as e:
        return False, f"Signature verification error: {e}"

    return True, ""


def verify_w5_code_hash(
    state_init_boc_b64: str,
    allowed_hashes: set[str] | None = None,
) -> bool:
    """Verify that a StateInit contains the expected W5R1 contract code.

    Args:
        state_init_boc_b64: Base64-encoded BoC of the StateInit.
        allowed_hashes: Optional set of allowed code hashes (base64).

    Returns:
        True if the code cell hash matches an allowed hash.
    """
    if allowed_hashes is None:
        allowed_hashes = {W5R1_CODE_HASH}

    try:
        cell = Cell.one_from_boc(base64.b64decode(state_init_boc_b64))
    except Exception:
        return False

    si_slice = cell.begin_parse()

    if si_slice.load_bit():
        si_slice.skip_bits(5)
    if si_slice.load_bit():
        si_slice.skip_bits(2)

    has_code = si_slice.load_bit()
    if not has_code:
        return False

    code_cell = si_slice.load_ref()
    code_hash_b64 = base64.b64encode(code_cell.hash).decode()

    return code_hash_b64 in allowed_hashes


def check_protocol(scheme: str, network: str, config: VerifyConfig) -> VerifyResult:
    """Rule 1: Verify scheme and network match."""
    if scheme != SCHEME_EXACT:
        return VerifyResult(ok=False, reason=f"Unsupported scheme: {scheme}")

    networks = config.supported_networks or SUPPORTED_NETWORKS
    if network not in networks:
        return VerifyResult(ok=False, reason=f"Unsupported network: {network}")

    return VerifyResult(ok=True)


def check_signature(boc_b64: str, pubkey_hex: str) -> VerifyResult:
    """Rule 2: Verify Ed25519 signature on the W5 message."""
    try:
        valid, reason = verify_w5_signature(boc_b64, pubkey_hex)
        if not valid:
            return VerifyResult(ok=False, reason=f"Invalid signature: {reason}")
        return VerifyResult(ok=True)
    except Exception as e:
        return VerifyResult(ok=False, reason=f"Signature verification error: {e}")


async def check_payment_intent(
    payload: TvmPaymentPayload,
    required_amount: str,
    required_pay_to: str,
    required_asset: str,
    provider: FacilitatorTvmSigner,
) -> VerifyResult:
    """Rule 3: Verify jetton transfer amount, destination, and asset.

    Self-relay model: expects exactly 1 jetton transfer (no relay commission).
    """
    try:
        pay_to_norm = normalize_address(required_pay_to)
        asset_norm = normalize_address(required_asset)
        token_master_norm = normalize_address(payload.token_master)
    except ValueError as e:
        return VerifyResult(ok=False, reason=f"Invalid address: {e}")

    if token_master_norm != asset_norm:
        return VerifyResult(
            ok=False,
            reason=f"Token mismatch: expected {asset_norm}, got {token_master_norm}",
        )

    if int(payload.amount) < int(required_amount):
        return VerifyResult(
            ok=False,
            reason=f"Insufficient amount: expected {required_amount}, got {payload.amount}",
        )

    # Parse the BoC to verify the actual transfer destination
    try:
        body = parse_external_message(payload.settlement_boc)
        w5_msg = parse_w5_body(body)

        # Find jetton transfers among internal messages
        found_valid_transfer = False
        jetton_transfer_count = 0
        for msg in w5_msg.internal_messages:
            body_cell = msg.get("body")
            if body_cell is None:
                continue

            transfer = extract_jetton_transfer(body_cell)
            if transfer is None:
                continue

            jetton_transfer_count += 1

            if transfer.destination:
                transfer_dest_norm = normalize_address(transfer.destination)
                if transfer_dest_norm == pay_to_norm:
                    if transfer.amount >= int(required_amount):
                        found_valid_transfer = True

        if not found_valid_transfer:
            return VerifyResult(
                ok=False,
                reason="No valid jetton transfer found matching required amount and destination",
            )

        # Self-relay model: expect exactly 1 jetton transfer (no commission transfer)
        if jetton_transfer_count > 1:
            return VerifyResult(
                ok=False,
                reason=f"Expected 1 jetton transfer, found {jetton_transfer_count}",
            )

    except Exception as e:
        return VerifyResult(ok=False, reason=f"Failed to parse payment BoC: {e}")

    return VerifyResult(ok=True)


async def check_replay(
    payload: TvmPaymentPayload,
    provider: FacilitatorTvmSigner,
) -> VerifyResult:
    """Rule 4: Check for replay attacks."""
    now = int(time.time())

    if payload.valid_until < now:
        return VerifyResult(ok=False, reason="Payment expired")

    if payload.valid_until > now + 600:
        return VerifyResult(
            ok=False,
            reason=f"validUntil too far in future: {payload.valid_until - now}s from now",
        )

    boc_hash = compute_boc_hash(payload.settlement_boc)
    if boc_hash in _seen_boc_hashes:
        return VerifyResult(ok=False, reason="Duplicate BoC (replay)")

    try:
        sender_addr = normalize_address(payload.sender)
        on_chain_seqno = await provider.get_seqno(sender_addr)

        body = parse_external_message(payload.settlement_boc)
        w5_msg = parse_w5_body(body)

        if w5_msg.seqno < on_chain_seqno:
            return VerifyResult(
                ok=False,
                reason=f"Stale seqno: BoC has {w5_msg.seqno}, chain has {on_chain_seqno}",
            )
    except Exception as e:
        return VerifyResult(ok=False, reason=f"Failed to check seqno: {e}")

    return VerifyResult(ok=True)


async def check_simulation(
    payload: TvmPaymentPayload,
    provider: FacilitatorTvmSigner,
    config: VerifyConfig,
) -> VerifyResult:
    """Rule 5: Pre-simulation check (optional)."""
    if config.skip_simulation:
        return VerifyResult(ok=True)

    # TODO: In production, use emulation API to pre-simulate
    return VerifyResult(ok=True)


async def verify_payment(
    payload: TvmPaymentPayload,
    scheme: str,
    network: str,
    required_amount: str,
    required_pay_to: str,
    required_asset: str,
    provider: FacilitatorTvmSigner,
    config: VerifyConfig | None = None,
) -> VerifyResult:
    """Run all verification rules on a payment.

    Args:
        payload: Parsed TVM payment payload.
        scheme: Payment scheme (must be "exact").
        network: Network identifier.
        required_amount: Required amount in smallest units.
        required_pay_to: Required recipient address.
        required_asset: Required token master address.
        provider: TVM provider for on-chain lookups.
        config: Optional verification config.

    Returns:
        VerifyResult - ok=True only if ALL rules pass.
    """
    cfg = config or VerifyConfig()

    result = check_protocol(scheme, network, cfg)
    if not result.ok:
        return result

    result = check_signature(payload.settlement_boc, payload.wallet_public_key)
    if not result.ok:
        return result

    result = await check_payment_intent(
        payload, required_amount, required_pay_to, required_asset, provider
    )
    if not result.ok:
        return result

    result = await check_replay(payload, provider)
    if not result.ok:
        return result

    result = await check_simulation(payload, provider, cfg)
    if not result.ok:
        return result

    # Mark BoC as seen (after all checks pass)
    boc_hash = compute_boc_hash(payload.settlement_boc)
    _seen_boc_hashes.add(boc_hash)

    return VerifyResult(ok=True)

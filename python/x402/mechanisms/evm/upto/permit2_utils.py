"""Permit2 helpers for the upto EVM payment scheme."""

from __future__ import annotations

import logging
import time
from typing import Any

logger = logging.getLogger("x402.permit2")

try:
    from eth_utils import to_checksum_address
except ImportError as e:
    raise ImportError(
        "EVM mechanism requires ethereum packages. Install with: pip install x402[evm]"
    ) from e

from ....interfaces import FacilitatorContext  # noqa: E402
from ....schemas import (  # noqa: E402
    PaymentPayload,
    PaymentRequirements,
    SettleResponse,
    VerifyResponse,
)
from ..constants import (  # noqa: E402
    BALANCE_OF_ABI,
    ERC20_ALLOWANCE_ABI,
    ERR_INSUFFICIENT_BALANCE,
    ERR_PERMIT2_ALLOWANCE_REQUIRED,
    ERR_PERMIT2_AMOUNT_MISMATCH,
    ERR_PERMIT2_DEADLINE_EXPIRED,
    ERR_PERMIT2_INVALID_SIGNATURE,
    ERR_PERMIT2_INVALID_SPENDER,
    ERR_PERMIT2_NOT_YET_VALID,
    ERR_PERMIT2_RECIPIENT_MISMATCH,
    ERR_PERMIT2_TOKEN_MISMATCH,
    ERR_TRANSACTION_FAILED,
    ERR_UPTO_FACILITATOR_MISMATCH,
    ERR_UPTO_INVALID_SCHEME,
    ERR_UPTO_NETWORK_MISMATCH,
    ERR_UPTO_SETTLEMENT_EXCEEDS_AMOUNT,
    PERMIT2_ADDRESS,
    SCHEME_UPTO,
    TX_STATUS_SUCCESS,
    UPTO_PERMIT2_WITNESS_TYPES,
    X402_UPTO_PERMIT2_PROXY_ABI,
    X402_UPTO_PERMIT2_PROXY_ADDRESS,
    X402_UPTO_PERMIT2_PROXY_SETTLE_WITH_PERMIT_ABI,
)
from ..signer import FacilitatorEvmSigner  # noqa: E402
from ..types import (  # noqa: E402
    TypedDataField,
    UptoPermit2Payload,
)
from ..utils import (  # noqa: E402
    get_evm_chain_id,
    hex_to_bytes,
    normalize_address,
)

# Reuse exact's allowance verification and settle error mapping
from ..exact.permit2_utils import (  # noqa: E402
    _verify_permit2_allowance,
)


def verify_upto_permit2(
    signer: FacilitatorEvmSigner,
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    context: FacilitatorContext | None = None,
) -> VerifyResponse:
    """Verify an upto Permit2 payment payload.

    Verification cascade:
    1. Scheme check (must be "upto")
    2. Network check
    3. Spender check (must be x402UptoPermit2Proxy)
    4. Recipient check (witness.to must match requirements.pay_to)
    5. Facilitator check (witness.facilitator must match our address)
    6. Deadline check
    7. validAfter check
    8. Amount check (permitted.amount == requirements.amount)
    9. Token check
    10. Signature verification
    11. Allowance check (with extension fallbacks)
    12. Balance check
    """
    permit2_payload = UptoPermit2Payload.from_dict(payload.payload)
    payer = permit2_payload.permit2_authorization.from_address

    # 1. Scheme check (both payload and requirements must be "upto")
    if payload.accepted.scheme != SCHEME_UPTO or requirements.scheme != SCHEME_UPTO:
        return VerifyResponse(is_valid=False, invalid_reason=ERR_UPTO_INVALID_SCHEME, payer=payer)

    # 2. Network check
    if payload.accepted.network != requirements.network:
        return VerifyResponse(is_valid=False, invalid_reason=ERR_UPTO_NETWORK_MISMATCH, payer=payer)

    chain_id = get_evm_chain_id(str(requirements.network))
    token_address = normalize_address(requirements.asset)

    # 3. Spender check
    try:
        spender_norm = normalize_address(permit2_payload.permit2_authorization.spender)
        proxy_norm = normalize_address(X402_UPTO_PERMIT2_PROXY_ADDRESS)
    except Exception:
        return VerifyResponse(
            is_valid=False, invalid_reason=ERR_PERMIT2_INVALID_SPENDER, payer=payer
        )

    if spender_norm != proxy_norm:
        return VerifyResponse(
            is_valid=False, invalid_reason=ERR_PERMIT2_INVALID_SPENDER, payer=payer
        )

    # 4. Recipient check
    try:
        witness_to = normalize_address(permit2_payload.permit2_authorization.witness.to)
        pay_to = normalize_address(requirements.pay_to)
    except Exception:
        return VerifyResponse(
            is_valid=False, invalid_reason=ERR_PERMIT2_RECIPIENT_MISMATCH, payer=payer
        )

    if witness_to != pay_to:
        return VerifyResponse(
            is_valid=False, invalid_reason=ERR_PERMIT2_RECIPIENT_MISMATCH, payer=payer
        )

    # 5. Facilitator check
    facilitator_addresses = signer.get_addresses()
    try:
        witness_facilitator = normalize_address(
            permit2_payload.permit2_authorization.witness.facilitator
        )
    except Exception:
        return VerifyResponse(
            is_valid=False, invalid_reason=ERR_UPTO_FACILITATOR_MISMATCH, payer=payer
        )

    is_facilitator_match = any(
        normalize_address(addr) == witness_facilitator for addr in facilitator_addresses
    )
    if not is_facilitator_match:
        return VerifyResponse(
            is_valid=False, invalid_reason=ERR_UPTO_FACILITATOR_MISMATCH, payer=payer
        )

    now = int(time.time())

    # 6-8. Parse numeric fields
    try:
        deadline_val = int(permit2_payload.permit2_authorization.deadline)
        valid_after_val = int(permit2_payload.permit2_authorization.witness.valid_after)
        amount_val = int(permit2_payload.permit2_authorization.permitted.amount)
    except (ValueError, TypeError):
        return VerifyResponse(
            is_valid=False, invalid_reason="invalid_permit2_payload_format", payer=payer
        )

    # 6. Deadline check (6 second buffer)
    if deadline_val < now + 6:
        return VerifyResponse(
            is_valid=False, invalid_reason=ERR_PERMIT2_DEADLINE_EXPIRED, payer=payer
        )

    # 7. validAfter check
    if valid_after_val > now:
        return VerifyResponse(
            is_valid=False, invalid_reason=ERR_PERMIT2_NOT_YET_VALID, payer=payer
        )

    # 8. Amount check (permitted.amount == requirements.amount)
    if amount_val != int(requirements.amount):
        return VerifyResponse(
            is_valid=False,
            invalid_reason=ERR_PERMIT2_AMOUNT_MISMATCH,
            payer=payer,
        )

    # 9. Token check
    try:
        permitted_token = normalize_address(
            permit2_payload.permit2_authorization.permitted.token
        )
    except Exception:
        return VerifyResponse(
            is_valid=False, invalid_reason=ERR_PERMIT2_TOKEN_MISMATCH, payer=payer
        )

    if permitted_token != token_address:
        return VerifyResponse(
            is_valid=False, invalid_reason=ERR_PERMIT2_TOKEN_MISMATCH, payer=payer
        )

    # 10. Signature verification
    if not permit2_payload.signature:
        return VerifyResponse(
            is_valid=False, invalid_reason=ERR_PERMIT2_INVALID_SIGNATURE, payer=payer
        )

    try:
        sig_bytes = hex_to_bytes(permit2_payload.signature)
        is_valid_sig = _verify_upto_permit2_signature(
            signer,
            payer,
            permit2_payload.permit2_authorization,
            chain_id,
            sig_bytes,
        )
        if not is_valid_sig:
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_PERMIT2_INVALID_SIGNATURE, payer=payer
            )
    except Exception:
        return VerifyResponse(
            is_valid=False, invalid_reason=ERR_PERMIT2_INVALID_SIGNATURE, payer=payer
        )

    # 11. Allowance check (reuses exact's implementation which handles extension fallbacks)
    allowance_result = _verify_permit2_allowance(
        signer, payload, requirements, payer, token_address, context
    )
    if allowance_result is not None:
        return allowance_result

    # 12. Balance check
    try:
        balance = signer.read_contract(token_address, BALANCE_OF_ABI, "balanceOf", payer)
        if int(balance) < int(requirements.amount):
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_INSUFFICIENT_BALANCE, payer=payer
            )
    except Exception:
        return VerifyResponse(is_valid=False, invalid_reason="balance_check_failed", payer=payer)

    return VerifyResponse(is_valid=True, payer=payer)


def settle_upto_permit2(
    signer: FacilitatorEvmSigner,
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    context: FacilitatorContext | None = None,
) -> SettleResponse:
    """Settle an upto Permit2 payment on-chain.

    The settlement amount comes from requirements.amount (set by the resource server).
    It must be <= the authorized maximum (permit2_authorization.permitted.amount).
    """
    from ....extensions.eip2612_gas_sponsoring import extract_eip2612_gas_sponsoring_info
    from ....extensions.erc20_approval_gas_sponsoring import (
        ERC20_APPROVAL_GAS_SPONSORING_KEY,
        Erc20ApprovalFacilitatorExtension,
        extract_erc20_approval_gas_sponsoring_info,
    )

    permit2_payload = UptoPermit2Payload.from_dict(payload.payload)
    payer = permit2_payload.permit2_authorization.from_address
    network = str(requirements.network)
    settlement_amount = int(requirements.amount)

    # Re-verify with permitted.amount (the authorized max), not the settlement amount
    verify_requirements = PaymentRequirements(
        scheme=requirements.scheme,
        network=requirements.network,
        asset=requirements.asset,
        amount=permit2_payload.permit2_authorization.permitted.amount,
        pay_to=requirements.pay_to,
        max_timeout_seconds=requirements.max_timeout_seconds,
        extra=requirements.extra,
    )

    verify_result = verify_upto_permit2(signer, payload, verify_requirements, context)
    if not verify_result.is_valid:
        return SettleResponse(
            success=False,
            error_reason=verify_result.invalid_reason,
            network=network,
            payer=payer,
            transaction="",
        )

    # Zero settlement — no on-chain tx needed
    if settlement_amount == 0:
        return SettleResponse(
            success=True,
            transaction="",
            network=network,
            payer=payer,
            amount="0",
        )

    # Guard: settlement amount must not exceed authorized maximum
    permitted_amount = int(permit2_payload.permit2_authorization.permitted.amount)
    if settlement_amount > permitted_amount:
        return SettleResponse(
            success=False,
            error_reason=ERR_UPTO_SETTLEMENT_EXCEEDS_AMOUNT,
            network=network,
            payer=payer,
            transaction="",
        )

    # Branch: EIP-2612 gas sponsoring (atomic settleWithPermit)
    eip2612_info = extract_eip2612_gas_sponsoring_info(payload)
    if eip2612_info is not None:
        return _settle_upto_with_eip2612(
            signer, payload, permit2_payload, eip2612_info, settlement_amount
        )

    # Branch: ERC-20 approval gas sponsoring
    erc20_info = extract_erc20_approval_gas_sponsoring_info(payload)
    if erc20_info is not None and context is not None:
        ext = context.get_extension(ERC20_APPROVAL_GAS_SPONSORING_KEY)
        if isinstance(ext, Erc20ApprovalFacilitatorExtension):
            extension_signer = ext.resolve_signer(str(payload.accepted.network))
            if extension_signer is not None:
                return _settle_upto_with_erc20_approval(
                    extension_signer, payload, permit2_payload, erc20_info, settlement_amount
                )

    # Branch: standard settle
    return _settle_upto_direct(signer, payload, permit2_payload, settlement_amount)


def _build_upto_permit2_settle_args(
    permit2_payload: UptoPermit2Payload,
    settlement_amount: int,
) -> tuple:
    """Build settle call arguments for the upto proxy.

    Returns (permit_tuple, amount, owner_addr, witness_tuple, sig_bytes).
    """
    sig_bytes = hex_to_bytes(permit2_payload.signature or "")
    permit_tuple = (
        (
            to_checksum_address(permit2_payload.permit2_authorization.permitted.token),
            int(permit2_payload.permit2_authorization.permitted.amount),
        ),
        int(permit2_payload.permit2_authorization.nonce),
        int(permit2_payload.permit2_authorization.deadline),
    )
    owner_addr = to_checksum_address(permit2_payload.permit2_authorization.from_address)
    witness_tuple = (
        to_checksum_address(permit2_payload.permit2_authorization.witness.to),
        to_checksum_address(permit2_payload.permit2_authorization.witness.facilitator),
        int(permit2_payload.permit2_authorization.witness.valid_after),
    )
    return permit_tuple, settlement_amount, owner_addr, witness_tuple, sig_bytes


def _settle_upto_direct(
    signer: FacilitatorEvmSigner,
    payload: PaymentPayload,
    permit2_payload: UptoPermit2Payload,
    settlement_amount: int,
) -> SettleResponse:
    """Standard upto Permit2 settle — allowance is already on-chain."""
    payer = permit2_payload.permit2_authorization.from_address
    network = str(payload.accepted.network)

    try:
        permit_tuple, amount, owner_addr, witness_tuple, sig_bytes = (
            _build_upto_permit2_settle_args(permit2_payload, settlement_amount)
        )

        tx_hash = signer.write_contract(
            X402_UPTO_PERMIT2_PROXY_ADDRESS,
            X402_UPTO_PERMIT2_PROXY_ABI,
            "settle",
            permit_tuple,
            amount,
            owner_addr,
            witness_tuple,
            sig_bytes,
        )

        receipt = signer.wait_for_transaction_receipt(tx_hash)
        if receipt.status != TX_STATUS_SUCCESS:
            return SettleResponse(
                success=False,
                error_reason=ERR_TRANSACTION_FAILED,
                transaction=tx_hash,
                network=network,
                payer=payer,
            )

        return SettleResponse(
            success=True,
            transaction=tx_hash,
            network=network,
            payer=payer,
            amount=str(settlement_amount),
        )

    except Exception as e:
        return _map_upto_settle_error(e, network, payer)


def _settle_upto_with_eip2612(
    signer: FacilitatorEvmSigner,
    payload: PaymentPayload,
    permit2_payload: UptoPermit2Payload,
    eip2612_info: Any,
    settlement_amount: int,
) -> SettleResponse:
    """Settle via settleWithPermit — includes the EIP-2612 permit atomically."""
    payer = permit2_payload.permit2_authorization.from_address
    network = str(payload.accepted.network)

    try:
        permit_tuple, amount, owner_addr, witness_tuple, sig_bytes = (
            _build_upto_permit2_settle_args(permit2_payload, settlement_amount)
        )

        sig_hex = eip2612_info.signature
        sig_raw = hex_to_bytes(sig_hex)
        if len(sig_raw) != 65:
            return _map_upto_settle_error(
                ValueError("EIP-2612 signature must be 65 bytes"), network, payer
            )
        r = sig_raw[:32]
        s = sig_raw[32:64]
        v = sig_raw[64]

        permit2612_tuple = (
            int(eip2612_info.amount),
            int(eip2612_info.deadline),
            r,
            s,
            v,
        )

        tx_hash = signer.write_contract(
            X402_UPTO_PERMIT2_PROXY_ADDRESS,
            X402_UPTO_PERMIT2_PROXY_SETTLE_WITH_PERMIT_ABI,
            "settleWithPermit",
            permit2612_tuple,
            permit_tuple,
            amount,
            owner_addr,
            witness_tuple,
            sig_bytes,
        )

        receipt = signer.wait_for_transaction_receipt(tx_hash)
        if receipt.status != TX_STATUS_SUCCESS:
            return SettleResponse(
                success=False,
                error_reason=ERR_TRANSACTION_FAILED,
                transaction=tx_hash,
                network=network,
                payer=payer,
            )

        return SettleResponse(
            success=True,
            transaction=tx_hash,
            network=network,
            payer=payer,
            amount=str(settlement_amount),
        )

    except Exception as e:
        return _map_upto_settle_error(e, network, payer)


def _settle_upto_with_erc20_approval(
    extension_signer: Any,
    payload: PaymentPayload,
    permit2_payload: UptoPermit2Payload,
    erc20_info: Any,
    settlement_amount: int,
) -> SettleResponse:
    """Settle via extension signer's send_transactions (approval + settle)."""
    payer = permit2_payload.permit2_authorization.from_address
    network = str(payload.accepted.network)

    try:
        permit_tuple, amount, owner_addr, witness_tuple, sig_bytes = (
            _build_upto_permit2_settle_args(permit2_payload, settlement_amount)
        )

        from ....extensions.erc20_approval_gas_sponsoring.types import WriteContractCall

        tx_hashes = extension_signer.send_transactions(
            [
                erc20_info.signed_transaction,
                WriteContractCall(
                    address=X402_UPTO_PERMIT2_PROXY_ADDRESS,
                    abi=X402_UPTO_PERMIT2_PROXY_ABI,
                    function="settle",
                    args=[permit_tuple, amount, owner_addr, witness_tuple, sig_bytes],
                ),
            ]
        )

        settle_tx_hash = tx_hashes[-1] if tx_hashes else ""
        receipt = extension_signer.wait_for_transaction_receipt(settle_tx_hash)
        if receipt.status != TX_STATUS_SUCCESS:
            return SettleResponse(
                success=False,
                error_reason=ERR_TRANSACTION_FAILED,
                transaction=settle_tx_hash,
                network=network,
                payer=payer,
            )

        return SettleResponse(
            success=True,
            transaction=settle_tx_hash,
            network=network,
            payer=payer,
            amount=str(settlement_amount),
        )

    except Exception as e:
        return _map_upto_settle_error(e, network, payer)


def _build_upto_permit2_typed_data(
    permit2_authorization,
    chain_id: int,
) -> tuple[dict[str, Any], dict[str, list[TypedDataField]], str, dict[str, Any]]:
    """Build EIP-712 typed data for upto Permit2 signature verification."""
    domain_dict: dict[str, Any] = {
        "name": "Permit2",
        "chainId": chain_id,
        "verifyingContract": PERMIT2_ADDRESS,
    }

    message = {
        "permitted": {
            "token": permit2_authorization.permitted.token,
            "amount": int(permit2_authorization.permitted.amount),
        },
        "spender": permit2_authorization.spender,
        "nonce": int(permit2_authorization.nonce),
        "deadline": int(permit2_authorization.deadline),
        "witness": {
            "to": permit2_authorization.witness.to,
            "facilitator": permit2_authorization.witness.facilitator,
            "validAfter": int(permit2_authorization.witness.valid_after),
        },
    }

    typed_fields: dict[str, list[TypedDataField]] = {
        type_name: [TypedDataField(name=f["name"], type=f["type"]) for f in fields]
        for type_name, fields in UPTO_PERMIT2_WITNESS_TYPES.items()
    }

    return domain_dict, typed_fields, "PermitWitnessTransferFrom", message


def _verify_upto_permit2_signature(
    signer: FacilitatorEvmSigner,
    payer: str,
    permit2_authorization,
    chain_id: int,
    signature: bytes,
) -> bool:
    """Verify an upto Permit2 EIP-712 signature."""
    domain_dict, typed_fields, primary_type, message = _build_upto_permit2_typed_data(
        permit2_authorization, chain_id
    )

    return signer.verify_typed_data(
        payer,
        domain_dict,  # type: ignore[arg-type]
        typed_fields,
        primary_type,
        message,
        signature,
    )


def _map_upto_settle_error(error: Exception, network: str, payer: str) -> SettleResponse:
    """Map contract revert errors to structured SettleResponse."""
    error_msg = str(error)
    error_reason = ERR_TRANSACTION_FAILED
    if "Permit2612AmountMismatch" in error_msg:
        error_reason = "permit2_2612_amount_mismatch"
    elif "AmountExceedsPermitted" in error_msg:
        error_reason = ERR_UPTO_SETTLEMENT_EXCEEDS_AMOUNT
    elif "UnauthorizedFacilitator" in error_msg:
        error_reason = ERR_UPTO_FACILITATOR_MISMATCH
    elif "InvalidDestination" in error_msg:
        error_reason = "invalid_permit2_destination"
    elif "InvalidOwner" in error_msg:
        error_reason = "invalid_permit2_owner"
    elif "PaymentTooEarly" in error_msg:
        error_reason = "permit2_payment_too_early"
    elif "InvalidSignature" in error_msg or "SignatureExpired" in error_msg:
        error_reason = ERR_PERMIT2_INVALID_SIGNATURE
    elif "InvalidNonce" in error_msg:
        error_reason = "permit2_invalid_nonce"
    elif "erc20_approval_tx_failed" in error_msg:
        error_reason = "erc20_approval_tx_failed"

    return SettleResponse(
        success=False,
        error_reason=error_reason,
        error_message=error_msg[:500],
        network=network,
        payer=payer,
        transaction="",
    )

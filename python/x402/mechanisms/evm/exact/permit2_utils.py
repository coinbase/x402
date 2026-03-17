"""Permit2 helpers for the exact EVM payment scheme."""

from __future__ import annotations

import time
from typing import Any

try:
    from eth_account import Account
    from eth_account.messages import encode_typed_data
    from eth_utils import to_checksum_address
except ImportError as e:
    raise ImportError(
        "EVM mechanism requires ethereum packages. Install with: pip install x402[evm]"
    ) from e

from ....schemas import PaymentPayload, PaymentRequirements, SettleResponse, VerifyResponse
from ..constants import (
    BALANCE_OF_ABI,
    ERC20_ALLOWANCE_ABI,
    ERR_INSUFFICIENT_BALANCE,
    ERR_NETWORK_MISMATCH,
    ERR_PERMIT2_ALLOWANCE_REQUIRED,
    ERR_PERMIT2_AMOUNT_MISMATCH,
    ERR_PERMIT2_DEADLINE_EXPIRED,
    ERR_PERMIT2_INVALID_SIGNATURE,
    ERR_PERMIT2_INVALID_SPENDER,
    ERR_PERMIT2_NOT_YET_VALID,
    ERR_PERMIT2_RECIPIENT_MISMATCH,
    ERR_PERMIT2_TOKEN_MISMATCH,
    ERR_TRANSACTION_FAILED,
    ERR_UNSUPPORTED_SCHEME,
    PERMIT2_ADDRESS,
    PERMIT2_WITNESS_TYPES,
    SCHEME_EXACT,
    TX_STATUS_SUCCESS,
    X402_EXACT_PERMIT2_PROXY_ABI,
    X402_EXACT_PERMIT2_PROXY_ADDRESS,
)
from ..signer import ClientEvmSigner, FacilitatorEvmSigner
from ..types import (
    ExactPermit2Authorization,
    ExactPermit2Payload,
    ExactPermit2TokenPermissions,
    ExactPermit2Witness,
)
from ..utils import (
    create_permit2_nonce,
    get_evm_chain_id,
    hex_to_bytes,
    normalize_address,
)


def create_permit2_payload(
    signer: ClientEvmSigner,
    requirements: PaymentRequirements,
) -> dict[str, Any]:
    """Create a signed Permit2 PermitWitnessTransferFrom payload.

    The spender is always x402ExactPermit2Proxy, which enforces that funds
    can only be sent to the witness.to address (requirements.pay_to).

    Args:
        signer: EVM signer for signing the Permit2 authorization.
        requirements: Payment requirements from server.

    Returns:
        Inner payload dict (permit2Authorization + signature).
    """
    now = int(time.time())
    nonce = create_permit2_nonce()

    # Lower time bound - allow clock skew
    valid_after = str(now - 600)
    # Upper time bound - permit2 deadline
    deadline = str(now + (requirements.max_timeout_seconds or 3600))

    permit2_authorization = ExactPermit2Authorization(
        from_address=signer.address,
        permitted=ExactPermit2TokenPermissions(
            token=normalize_address(requirements.asset),
            amount=requirements.amount,
        ),
        spender=X402_EXACT_PERMIT2_PROXY_ADDRESS,
        nonce=nonce,
        deadline=deadline,
        witness=ExactPermit2Witness(
            to=normalize_address(requirements.pay_to),
            valid_after=valid_after,
        ),
    )

    signature = _sign_permit2_authorization(signer, permit2_authorization, requirements)

    payload = ExactPermit2Payload(
        permit2_authorization=permit2_authorization,
        signature=signature,
    )
    return payload.to_dict()


def _sign_permit2_authorization(
    signer: ClientEvmSigner,
    permit2_authorization: ExactPermit2Authorization,
    requirements: PaymentRequirements,
) -> str:
    """Sign a Permit2 PermitWitnessTransferFrom using EIP-712.

    The Permit2 domain has NO version field — only name, chainId, verifyingContract.
    We pass the domain as a raw dict to support signers whose protocol expects
    TypedDataDomain (which requires version), using the dict fallback path in
    EthAccountSigner.sign_typed_data().

    Args:
        signer: EVM signer.
        permit2_authorization: The authorization to sign.
        requirements: Payment requirements (used for chain ID).

    Returns:
        Hex-encoded signature with 0x prefix.
    """
    chain_id = get_evm_chain_id(str(requirements.network))

    # Permit2 domain has NO version field
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
            "validAfter": int(permit2_authorization.witness.valid_after),
        },
    }

    # Convert PERMIT2_WITNESS_TYPES to TypedDataField-compatible format
    from ..types import TypedDataField

    typed_fields: dict[str, list[TypedDataField]] = {
        type_name: [TypedDataField(name=f["name"], type=f["type"]) for f in fields]
        for type_name, fields in PERMIT2_WITNESS_TYPES.items()
    }

    # Pass domain as dict — EthAccountSigner handles this via its `else: domain_dict = domain`
    # branch. This avoids needing TypedDataDomain which requires a version field.
    sig_bytes = signer.sign_typed_data(
        domain_dict,  # type: ignore[arg-type]
        typed_fields,
        "PermitWitnessTransferFrom",
        message,
    )
    return "0x" + sig_bytes.hex()


def verify_permit2(
    signer: FacilitatorEvmSigner,
    payload: PaymentPayload,
    requirements: PaymentRequirements,
) -> VerifyResponse:
    """Verify a Permit2 payment payload.

    Verification cascade (cheap to expensive):
    1. Scheme check
    2. Network check
    3. Spender check (must be x402ExactPermit2Proxy)
    4. Recipient check (witness.to must match requirements.pay_to)
    5. Deadline check (must not be expired)
    6. validAfter check (must not be in the future)
    7. Amount check
    8. Token check
    9. Signature verification
    10. Allowance check
    11. Balance check

    Args:
        signer: Facilitator EVM signer for on-chain reads.
        payload: Payment payload from client.
        requirements: Payment requirements.

    Returns:
        VerifyResponse with is_valid and payer.
    """
    permit2_payload = ExactPermit2Payload.from_dict(payload.payload)
    payer = permit2_payload.permit2_authorization.from_address

    # 1. Scheme check
    if payload.accepted.scheme != SCHEME_EXACT:
        return VerifyResponse(is_valid=False, invalid_reason=ERR_UNSUPPORTED_SCHEME, payer=payer)

    # 2. Network check
    if payload.accepted.network != requirements.network:
        return VerifyResponse(is_valid=False, invalid_reason=ERR_NETWORK_MISMATCH, payer=payer)

    chain_id = get_evm_chain_id(str(requirements.network))
    token_address = normalize_address(requirements.asset)

    # 3. Spender check
    try:
        spender_norm = normalize_address(permit2_payload.permit2_authorization.spender)
        proxy_norm = normalize_address(X402_EXACT_PERMIT2_PROXY_ADDRESS)
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

    now = int(time.time())

    # 5. Deadline check (6 second buffer)
    if int(permit2_payload.permit2_authorization.deadline) < now + 6:
        return VerifyResponse(
            is_valid=False, invalid_reason=ERR_PERMIT2_DEADLINE_EXPIRED, payer=payer
        )

    # 6. validAfter check
    if int(permit2_payload.permit2_authorization.witness.valid_after) > now:
        return VerifyResponse(
            is_valid=False, invalid_reason=ERR_PERMIT2_NOT_YET_VALID, payer=payer
        )

    # 7. Amount check
    if int(permit2_payload.permit2_authorization.permitted.amount) != int(requirements.amount):
        return VerifyResponse(
            is_valid=False, invalid_reason=ERR_PERMIT2_AMOUNT_MISMATCH, payer=payer
        )

    # 8. Token check
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

    # 9. Signature verification
    if not permit2_payload.signature:
        return VerifyResponse(
            is_valid=False, invalid_reason=ERR_PERMIT2_INVALID_SIGNATURE, payer=payer
        )

    try:
        sig_bytes = hex_to_bytes(permit2_payload.signature)
        is_valid_sig = _verify_permit2_signature(
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

    # 10. Allowance check
    try:
        allowance = signer.read_contract(
            token_address,
            ERC20_ALLOWANCE_ABI,
            "allowance",
            payer,
            PERMIT2_ADDRESS,
        )
        if int(allowance) < int(requirements.amount):
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_PERMIT2_ALLOWANCE_REQUIRED, payer=payer
            )
    except Exception:
        return VerifyResponse(
            is_valid=False, invalid_reason=ERR_PERMIT2_ALLOWANCE_REQUIRED, payer=payer
        )

    # 11. Balance check
    try:
        balance = signer.read_contract(token_address, BALANCE_OF_ABI, "balanceOf", payer)
        if int(balance) < int(requirements.amount):
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_INSUFFICIENT_BALANCE, payer=payer
            )
    except Exception:
        pass  # If balance check fails, proceed

    return VerifyResponse(is_valid=True, payer=payer)


def settle_permit2(
    signer: FacilitatorEvmSigner,
    payload: PaymentPayload,
    requirements: PaymentRequirements,
) -> SettleResponse:
    """Settle a Permit2 payment on-chain.

    Calls x402ExactPermit2Proxy.settle() which uses Permit2's
    permitWitnessTransferFrom to atomically transfer tokens.

    Args:
        signer: Facilitator EVM signer for on-chain writes.
        payload: Verified payment payload.
        requirements: Payment requirements.

    Returns:
        SettleResponse with success, transaction, and payer.
    """
    permit2_payload = ExactPermit2Payload.from_dict(payload.payload)
    payer = permit2_payload.permit2_authorization.from_address
    network = str(requirements.network)

    # Re-verify before settling
    verify_result = verify_permit2(signer, payload, requirements)
    if not verify_result.is_valid:
        return SettleResponse(
            success=False,
            error_reason=verify_result.invalid_reason,
            network=network,
            payer=payer,
            transaction="",
        )

    try:
        sig_bytes = hex_to_bytes(permit2_payload.signature or "")

        # Build tuple args for web3.py — matches ABI struct layout
        permit_tuple = (
            (
                to_checksum_address(permit2_payload.permit2_authorization.permitted.token),
                int(permit2_payload.permit2_authorization.permitted.amount),
            ),
            int(permit2_payload.permit2_authorization.nonce),
            int(permit2_payload.permit2_authorization.deadline),
        )
        owner_addr = to_checksum_address(payer)
        witness_tuple = (
            to_checksum_address(permit2_payload.permit2_authorization.witness.to),
            int(permit2_payload.permit2_authorization.witness.valid_after),
        )

        tx_hash = signer.write_contract(
            X402_EXACT_PERMIT2_PROXY_ADDRESS,
            X402_EXACT_PERMIT2_PROXY_ABI,
            "settle",
            permit_tuple,
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
        )

    except Exception as e:
        error_msg = str(e)
        error_reason = ERR_TRANSACTION_FAILED
        if "InvalidAmount" in error_msg:
            error_reason = "invalid_permit2_amount"
        elif "InvalidDestination" in error_msg:
            error_reason = "invalid_permit2_destination"
        elif "InvalidOwner" in error_msg:
            error_reason = "invalid_permit2_owner"
        elif "PaymentTooEarly" in error_msg:
            error_reason = "permit2_payment_too_early"
        elif "InvalidSignature" in error_msg or "SignatureExpired" in error_msg:
            error_reason = ERR_PERMIT2_INVALID_SIGNATURE

        return SettleResponse(
            success=False,
            error_reason=error_reason,
            error_message=error_msg[:500],
            network=network,
            payer=payer,
            transaction="",
        )


def _verify_permit2_signature(
    signer: FacilitatorEvmSigner,
    payer: str,
    permit2_authorization: ExactPermit2Authorization,
    chain_id: int,
    signature: bytes,
) -> bool:
    """Verify a Permit2 EIP-712 signature.

    Uses eth_account directly with a domain dict (no version field) to avoid
    TypedDataDomain protocol which requires version.

    Args:
        signer: Facilitator signer (unused for EOA verify, used for EIP-1271).
        payer: Expected signer address.
        permit2_authorization: The authorization that was signed.
        chain_id: Chain ID.
        signature: Signature bytes.

    Returns:
        True if signature is valid.
    """
    # Permit2 domain — no version field
    domain_dict: dict[str, Any] = {
        "name": "Permit2",
        "chainId": chain_id,
        "verifyingContract": PERMIT2_ADDRESS,
    }

    # Build full typed data message
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
            "validAfter": int(permit2_authorization.witness.valid_after),
        },
    }

    # EIP712Domain without version
    domain_types = [
        {"name": "name", "type": "string"},
        {"name": "chainId", "type": "uint256"},
        {"name": "verifyingContract", "type": "address"},
    ]

    typed_data = {
        "types": {
            "EIP712Domain": domain_types,
            **PERMIT2_WITNESS_TYPES,
        },
        "primaryType": "PermitWitnessTransferFrom",
        "domain": domain_dict,
        "message": message,
    }

    try:
        recovered = Account.recover_message(
            encode_typed_data(full_message=typed_data),
            signature=signature,
        )
        return recovered.lower() == payer.lower()
    except Exception:
        return False

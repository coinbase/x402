"""ERC-3009 helpers for the upto EVM payment scheme."""

from __future__ import annotations

import json
import time
from typing import Any

try:
    from eth_abi import encode
    from eth_utils import keccak
except ImportError as e:
    raise ImportError(
        "EVM mechanism requires ethereum packages. Install with: pip install x402[evm]"
    ) from e

from ....interfaces import FacilitatorContext
from ....pending_settlement_store import PendingSettlementStore
from ....schemas import PaymentPayload, PaymentRequirements, SettleResponse, VerifyResponse
from ..asset_cache import start_asset_contract_check
from ..constants import (
    AUTHORIZATION_STATE_ABI,
    BALANCE_OF_ABI,
    DEFAULT_VALIDITY_PERIOD,
    ERR_SETTLEMENT_PENDING,
    ERR_UPTO_EIP3009_AMOUNT_MISMATCH,
    ERR_UPTO_EIP3009_INSUFFICIENT_BALANCE,
    ERR_UPTO_EIP3009_INVALID_SIGNATURE,
    ERR_UPTO_EIP3009_MISSING_DOMAIN,
    ERR_UPTO_EIP3009_NONCE_ALREADY_USED,
    ERR_UPTO_EIP3009_NONCE_MISMATCH,
    ERR_UPTO_EIP3009_RECEIVER_MISMATCH,
    ERR_UPTO_EIP3009_RECIPIENT_MISMATCH,
    ERR_UPTO_EIP3009_SETTLER_MISMATCH,
    ERR_UPTO_EIP3009_SIMULATION_FAILED,
    ERR_UPTO_EIP3009_VALID_AFTER,
    ERR_UPTO_EIP3009_VALID_BEFORE,
    ERR_UPTO_FAILED_TO_GET_NETWORK_CONFIG,
    ERR_UPTO_INVALID_PAYLOAD,
    ERR_UPTO_INVALID_SCHEME,
    ERR_UPTO_NETWORK_MISMATCH,
    ERR_UPTO_PENDING_MISMATCH,
    ERR_UPTO_SETTLEMENT_EXCEEDS_AMOUNT,
    ERR_UPTO_TRANSACTION_FAILED,
    SCHEME_UPTO,
    UPTO_EIP3009_NONCE_TYPEHASH,
    X402_UPTO_EIP3009_PROXY_ABI,
    X402_UPTO_EIP3009_PROXY_ADDRESS,
)
from ..data_suffix import resolve_data_suffix
from ..settle_receipt import wait_for_receipt_and_build_response
from ..signer import ClientEvmSigner, FacilitatorEvmSigner
from ..types import (
    RECEIVE_AUTHORIZATION_TYPES,
    TypedDataDomain,
    TypedDataField,
    UptoEIP3009Authorization,
    UptoEIP3009Payload,
    UptoEIP3009PaymentInfo,
)
from ..utils import (
    create_nonce,
    get_evm_chain_id,
    hex_to_bytes,
    is_valid_tx_hash,
    normalize_address,
)
from ..verify import verify_typed_data_strict


def create_upto_eip3009_nonce(pay_to: str, settler: str, salt: str) -> str:
    """Compute keccak256(abi.encode(typehash, payTo, settler, salt))."""
    salt_bytes = hex_to_bytes(salt)
    typehash = hex_to_bytes(UPTO_EIP3009_NONCE_TYPEHASH)
    if len(salt_bytes) != 32:
        raise ValueError(f"invalid salt length: got {len(salt_bytes)} bytes, want 32")
    encoded = encode(
        ["bytes32", "address", "address", "bytes32"],
        [typehash, normalize_address(pay_to), normalize_address(settler), salt_bytes],
    )
    return "0x" + keccak(encoded).hex()


def build_receive_authorization_message(
    authorization: UptoEIP3009Authorization,
) -> dict[str, Any]:
    """Build the strongly typed ReceiveWithAuthorization message."""
    nonce = hex_to_bytes(authorization.nonce)
    if len(nonce) != 32:
        raise ValueError(f"invalid nonce length: got {len(nonce)} bytes, want 32")
    value = int(authorization.value)
    valid_after = int(authorization.valid_after)
    valid_before = int(authorization.valid_before)
    if min(value, valid_after, valid_before) < 0:
        raise ValueError("authorization numeric fields must be non-negative")
    return {
        "from": normalize_address(authorization.from_address),
        "to": normalize_address(authorization.to),
        "value": value,
        "validAfter": valid_after,
        "validBefore": valid_before,
        "nonce": nonce,
    }


def create_upto_eip3009_payload(
    signer: ClientEvmSigner,
    requirements: PaymentRequirements,
) -> dict[str, Any]:
    """Create an explicit upto ReceiveWithAuthorization payload."""
    extra = requirements.extra or {}
    name = extra.get("name")
    version = extra.get("version")
    settler_address = extra.get("settlerAddress")
    if not isinstance(name, str) or not name or not isinstance(version, str) or not version:
        raise ValueError(
            "EIP-712 domain parameters (name, version) are required in payment requirements "
            f"for asset {requirements.asset}"
        )
    if not isinstance(settler_address, str) or not settler_address:
        raise ValueError(
            "upto eip3009 requires settlerAddress in paymentRequirements.extra. "
            "Ensure the server is configured with an upto facilitator that provides get_extra()."
        )

    valid_after = "0"
    timeout = requirements.max_timeout_seconds or DEFAULT_VALIDITY_PERIOD
    valid_before = str(int(time.time()) + timeout)
    if int(valid_before) <= int(valid_after):
        raise ValueError(
            f"Invalid time window: validBefore ({valid_before}) must be after "
            f"validAfter ({valid_after})."
        )

    pay_to = normalize_address(requirements.pay_to)
    settler = normalize_address(settler_address)
    salt = create_nonce()
    authorization = UptoEIP3009Authorization(
        from_address=normalize_address(signer.address),
        to=X402_UPTO_EIP3009_PROXY_ADDRESS,
        value=requirements.amount,
        valid_after=valid_after,
        valid_before=valid_before,
        nonce=create_upto_eip3009_nonce(pay_to, settler, salt),
    )
    signature = signer.sign_typed_data(
        TypedDataDomain(
            name=name,
            version=version,
            chain_id=get_evm_chain_id(str(requirements.network)),
            verifying_contract=normalize_address(requirements.asset),
        ),
        {
            type_name: [TypedDataField(name=field["name"], type=field["type"]) for field in fields]
            for type_name, fields in RECEIVE_AUTHORIZATION_TYPES.items()
        },
        "ReceiveWithAuthorization",
        build_receive_authorization_message(authorization),
    )
    return UptoEIP3009Payload(
        signature="0x" + signature.hex(),
        authorization=authorization,
        payment_info=UptoEIP3009PaymentInfo(pay_to=pay_to, settler=settler, salt=salt),
    ).to_dict()


def build_upto_eip3009_settle_args(
    requirements: PaymentRequirements,
    eip3009_payload: UptoEIP3009Payload,
) -> tuple[str, int, tuple[Any, ...], tuple[Any, ...], bytes]:
    """Build canonical x402UptoERC3009Proxy settle arguments."""
    message = build_receive_authorization_message(eip3009_payload.authorization)
    salt = hex_to_bytes(eip3009_payload.payment_info.salt)
    signature = hex_to_bytes(eip3009_payload.signature)
    amount = int(requirements.amount)
    if amount < 0:
        raise ValueError("settlement amount must be non-negative")
    if len(salt) != 32:
        raise ValueError(f"invalid salt length: got {len(salt)} bytes, want 32")
    if not signature:
        raise ValueError("invalid signature")
    authorization = (
        message["from"],
        message["to"],
        message["value"],
        message["validAfter"],
        message["validBefore"],
        message["nonce"],
    )
    payment_info = (
        normalize_address(eip3009_payload.payment_info.pay_to),
        normalize_address(eip3009_payload.payment_info.settler),
        salt,
    )
    return (
        normalize_address(requirements.asset),
        amount,
        authorization,
        payment_info,
        signature,
    )


def _invalid(reason: str, payer: str) -> VerifyResponse:
    return VerifyResponse(is_valid=False, invalid_reason=reason, payer=payer)


def verify_upto_eip3009(
    signer: FacilitatorEvmSigner,
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    eip3009_payload: UptoEIP3009Payload,
    simulate: bool = True,
) -> VerifyResponse:
    """Verify an upto ReceiveWithAuthorization payload and maximum settlement."""
    authorization = eip3009_payload.authorization
    payer = authorization.from_address
    if payload.accepted.scheme != SCHEME_UPTO or requirements.scheme != SCHEME_UPTO:
        return _invalid(ERR_UPTO_INVALID_SCHEME, payer)
    if payload.accepted.network != requirements.network:
        return _invalid(ERR_UPTO_NETWORK_MISMATCH, payer)

    extra = requirements.extra
    if not isinstance(extra, dict) or extra.get("assetTransferMethod") != "eip3009":
        return _invalid(ERR_UPTO_INVALID_PAYLOAD, payer)
    name = extra.get("name")
    version = extra.get("version")
    if not isinstance(name, str) or not name or not isinstance(version, str) or not version:
        return _invalid(ERR_UPTO_EIP3009_MISSING_DOMAIN, payer)

    try:
        maximum = int(authorization.value)
        required_maximum = int(requirements.amount)
        receiver = normalize_address(authorization.to)
        pay_to = normalize_address(eip3009_payload.payment_info.pay_to)
        required_pay_to = normalize_address(requirements.pay_to)
        settler = normalize_address(eip3009_payload.payment_info.settler)
    except (AttributeError, TypeError, ValueError):
        return _invalid(ERR_UPTO_INVALID_PAYLOAD, payer)
    if maximum < 0 or required_maximum < 0:
        return _invalid(ERR_UPTO_INVALID_PAYLOAD, payer)
    if receiver != normalize_address(X402_UPTO_EIP3009_PROXY_ADDRESS):
        return _invalid(ERR_UPTO_EIP3009_RECEIVER_MISMATCH, payer)
    if maximum != required_maximum:
        return _invalid(ERR_UPTO_EIP3009_AMOUNT_MISMATCH, payer)
    if pay_to != required_pay_to:
        return _invalid(ERR_UPTO_EIP3009_RECIPIENT_MISMATCH, payer)

    required_settler = extra.get("settlerAddress")
    try:
        signer_addresses = {normalize_address(address) for address in signer.get_addresses()}
        required_settler_address = (
            normalize_address(required_settler) if isinstance(required_settler, str) else ""
        )
    except (AttributeError, TypeError, ValueError):
        return _invalid(ERR_UPTO_EIP3009_SETTLER_MISMATCH, payer)
    if required_settler_address != settler or settler not in signer_addresses:
        return _invalid(ERR_UPTO_EIP3009_SETTLER_MISMATCH, payer)

    try:
        expected_nonce = create_upto_eip3009_nonce(
            eip3009_payload.payment_info.pay_to,
            eip3009_payload.payment_info.settler,
            eip3009_payload.payment_info.salt,
        )
        valid_after = int(authorization.valid_after)
        valid_before = int(authorization.valid_before)
    except (TypeError, ValueError):
        return _invalid(ERR_UPTO_INVALID_PAYLOAD, payer)
    if not isinstance(authorization.nonce, str):
        return _invalid(ERR_UPTO_INVALID_PAYLOAD, payer)
    if authorization.nonce.lower() != expected_nonce.lower():
        return _invalid(ERR_UPTO_EIP3009_NONCE_MISMATCH, payer)
    now = int(time.time())
    if valid_before < now + 6:
        return _invalid(ERR_UPTO_EIP3009_VALID_BEFORE, payer)
    if valid_after > now:
        return _invalid(ERR_UPTO_EIP3009_VALID_AFTER, payer)

    try:
        token = normalize_address(requirements.asset)
        normalized_payer = normalize_address(payer)
        message = build_receive_authorization_message(authorization)
        signature = hex_to_bytes(eip3009_payload.signature)
        if not signature:
            return _invalid(ERR_UPTO_EIP3009_INVALID_SIGNATURE, payer)
    except (AttributeError, TypeError, ValueError):
        return _invalid(ERR_UPTO_INVALID_PAYLOAD, payer)
    try:
        chain_id = get_evm_chain_id(str(requirements.network))
    except Exception:
        return _invalid(ERR_UPTO_FAILED_TO_GET_NETWORK_CONFIG, payer)

    asset_check = start_asset_contract_check(signer, str(requirements.network), token)
    try:
        signature_valid = verify_typed_data_strict(
            signer,
            normalized_payer,
            TypedDataDomain(
                name=name,
                version=version,
                chain_id=chain_id,
                verifying_contract=token,
            ),
            {
                type_name: [
                    TypedDataField(name=field["name"], type=field["type"]) for field in fields
                ]
                for type_name, fields in RECEIVE_AUTHORIZATION_TYPES.items()
            },
            "ReceiveWithAuthorization",
            message,
            signature,
        )
        asset_reason = asset_check.await_result()
        if asset_reason:
            return _invalid(asset_reason, payer)
        if not signature_valid:
            return _invalid(ERR_UPTO_EIP3009_INVALID_SIGNATURE, payer)
        balance = signer.read_contract(token, BALANCE_OF_ABI, "balanceOf", normalized_payer)
        if int(balance) < maximum:
            return _invalid(ERR_UPTO_EIP3009_INSUFFICIENT_BALANCE, payer)
        authorization_used = signer.read_contract(
            token,
            AUTHORIZATION_STATE_ABI,
            "authorizationState",
            normalized_payer,
            hex_to_bytes(authorization.nonce),
        )
        if authorization_used is not False:
            return _invalid(ERR_UPTO_EIP3009_NONCE_ALREADY_USED, payer)
    except Exception:
        return _invalid(ERR_UPTO_EIP3009_SIMULATION_FAILED, payer)

    if simulate:
        try:
            _simulate_upto_eip3009_settle(signer, requirements, eip3009_payload)
        except Exception:
            return _invalid(ERR_UPTO_EIP3009_SIMULATION_FAILED, payer)
    return VerifyResponse(is_valid=True, payer=payer)


def _simulate_upto_eip3009_settle(
    signer: FacilitatorEvmSigner,
    requirements: PaymentRequirements,
    eip3009_payload: UptoEIP3009Payload,
) -> None:
    """Simulate proxy settlement from the selected settler."""
    settle_args = build_upto_eip3009_settle_args(requirements, eip3009_payload)
    settler = normalize_address(eip3009_payload.payment_info.settler)
    read_contract_from = getattr(signer, "read_contract_from", None)
    if callable(read_contract_from):
        read_contract_from(
            settler,
            X402_UPTO_EIP3009_PROXY_ADDRESS,
            X402_UPTO_EIP3009_PROXY_ABI,
            "settle",
            *settle_args,
        )
        return

    signer_addresses = signer.get_addresses()
    if len(signer_addresses) != 1 or normalize_address(signer_addresses[0]) != settler:
        raise ValueError("signer cannot simulate from selected settler")
    signer.read_contract(
        X402_UPTO_EIP3009_PROXY_ADDRESS,
        X402_UPTO_EIP3009_PROXY_ABI,
        "settle",
        *settle_args,
    )


def _build_pending_fingerprint(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    eip3009_payload: UptoEIP3009Payload,
) -> dict[str, str]:
    if payload.accepted.network != requirements.network:
        raise ValueError("pending settlement network mismatch")
    metadata_values = (
        requirements.amount,
        eip3009_payload.authorization.from_address,
        requirements.asset,
        requirements.pay_to,
        eip3009_payload.authorization.nonce,
    )
    if not all(isinstance(value, str) for value in metadata_values):
        raise ValueError("pending settlement metadata must be string encoded")
    return {
        "network": str(requirements.network),
        "amount": requirements.amount,
        "payer": eip3009_payload.authorization.from_address,
        "asset": requirements.asset,
        "payTo": eip3009_payload.payment_info.pay_to,
        "requiredPayTo": requirements.pay_to,
        "nonce": eip3009_payload.authorization.nonce,
    }


def _build_pending_record(tx_hash: str, fingerprint: dict[str, str]) -> dict[str, Any]:
    return {"txHash": tx_hash, "fingerprint": fingerprint}


def _encode_pending_record(record: dict[str, Any]) -> str:
    return json.dumps(record, sort_keys=True, separators=(",", ":"))


def _pending_mismatch_response(
    network: str, payer: str, message: str | None = None
) -> SettleResponse:
    return SettleResponse(
        success=False,
        error_reason=ERR_UPTO_PENDING_MISMATCH,
        error_message=message,
        network=network,
        payer=payer,
        transaction="",
    )


def _await_upto_eip3009_settlement(
    signer: FacilitatorEvmSigner,
    tx_hash: str,
    network: str,
    payer: str,
    amount: str,
    signature: str,
    pending_store: PendingSettlementStore | None,
    record_persisted: bool,
    persistence_error: Exception | None = None,
) -> SettleResponse:
    response = wait_for_receipt_and_build_response(
        signer,
        tx_hash,
        network,
        payer,
        failed_reason=ERR_UPTO_TRANSACTION_FAILED,
        amount=amount,
    )
    if response.error_reason == ERR_SETTLEMENT_PENDING:
        if pending_store is None:
            return SettleResponse(
                success=False,
                error_reason=ERR_UPTO_TRANSACTION_FAILED,
                error_message=(
                    "settlement_pending: manual reconciliation required because no pending "
                    "settlement store was configured"
                ),
                network=network,
                payer=payer,
                transaction=tx_hash,
                amount=amount,
            )
        if persistence_error is None:
            return response
        receipt_message = (
            f"; receipt error: {response.error_message}" if response.error_message else ""
        )
        return SettleResponse(
            success=False,
            error_reason=ERR_UPTO_TRANSACTION_FAILED,
            error_message=(
                "settlement_pending: manual reconciliation required because the atomic pending "
                f"record could not be persisted: {persistence_error}{receipt_message}"
            ),
            network=network,
            payer=payer,
            transaction=tx_hash,
        )

    if pending_store is not None and record_persisted:
        try:
            pending_store.delete(signature)
        except Exception:
            pass
    return response


def settle_upto_eip3009(
    signer: FacilitatorEvmSigner,
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    eip3009_payload: UptoEIP3009Payload,
    context: FacilitatorContext | None = None,
    pending_store: PendingSettlementStore | None = None,
) -> SettleResponse:
    """Settle a nonzero actual amount through x402UptoERC3009Proxy."""
    payer = eip3009_payload.authorization.from_address
    network = str(payload.accepted.network)
    signature = eip3009_payload.signature
    try:
        actual_amount = int(requirements.amount)
        maximum = int(eip3009_payload.authorization.value)
    except (TypeError, ValueError):
        return SettleResponse(
            success=False,
            error_reason=ERR_UPTO_INVALID_PAYLOAD,
            network=network,
            payer=payer,
            transaction="",
        )

    if pending_store is not None:
        try:
            encoded_record = pending_store.get(signature)
        except Exception as e:
            return _pending_mismatch_response(
                network, payer, f"failed to read pending settlement record: {e}"
            )
        if encoded_record is not None:
            try:
                stored_record = json.loads(encoded_record)
                expected_fingerprint = _build_pending_fingerprint(
                    payload, requirements, eip3009_payload
                )
                cached_tx = stored_record["txHash"]
                expected_record = _build_pending_record(cached_tx, expected_fingerprint)
            except (AttributeError, KeyError, TypeError, ValueError):
                return _pending_mismatch_response(network, payer, "malformed pending record")
            if not is_valid_tx_hash(cached_tx) or stored_record != expected_record:
                return _pending_mismatch_response(network, payer, "pending record mismatch")

            return _await_upto_eip3009_settlement(
                signer,
                cached_tx,
                network,
                payer,
                str(actual_amount),
                signature,
                pending_store,
                record_persisted=True,
            )

    verify_requirements = PaymentRequirements(
        scheme=requirements.scheme,
        network=requirements.network,
        asset=requirements.asset,
        amount=eip3009_payload.authorization.value,
        pay_to=requirements.pay_to,
        max_timeout_seconds=requirements.max_timeout_seconds,
        extra=requirements.extra,
    )
    verify_result = verify_upto_eip3009(
        signer,
        payload,
        verify_requirements,
        eip3009_payload,
        simulate=False,
    )
    if not verify_result.is_valid:
        return SettleResponse(
            success=False,
            error_reason=verify_result.invalid_reason,
            network=network,
            payer=payer,
            transaction="",
        )
    if actual_amount < 0 or actual_amount > maximum:
        return SettleResponse(
            success=False,
            error_reason=ERR_UPTO_SETTLEMENT_EXCEEDS_AMOUNT,
            network=network,
            payer=payer,
            transaction="",
        )
    if actual_amount == 0:
        return SettleResponse(
            success=True, transaction="", network=network, payer=payer, amount="0"
        )

    try:
        _simulate_upto_eip3009_settle(signer, requirements, eip3009_payload)
    except Exception:
        return SettleResponse(
            success=False,
            error_reason=ERR_UPTO_EIP3009_SIMULATION_FAILED,
            network=network,
            payer=payer,
            transaction="",
        )

    try:
        data_suffix = resolve_data_suffix(context, payload, requirements)
        settle_args = build_upto_eip3009_settle_args(requirements, eip3009_payload)
        pending_fingerprint = _build_pending_fingerprint(payload, requirements, eip3009_payload)
        settler = normalize_address(eip3009_payload.payment_info.settler)
        write_contract_from = getattr(signer, "write_contract_from", None)
        if callable(write_contract_from):
            tx_hash = write_contract_from(
                settler,
                X402_UPTO_EIP3009_PROXY_ADDRESS,
                X402_UPTO_EIP3009_PROXY_ABI,
                "settle",
                *settle_args,
                data_suffix=data_suffix,
            )
        else:
            signer_addresses = signer.get_addresses()
            if len(signer_addresses) != 1 or normalize_address(signer_addresses[0]) != settler:
                raise ValueError("signer cannot write from selected settler")
            tx_hash = signer.write_contract(
                X402_UPTO_EIP3009_PROXY_ADDRESS,
                X402_UPTO_EIP3009_PROXY_ABI,
                "settle",
                *settle_args,
                data_suffix=data_suffix,
            )
        if not is_valid_tx_hash(tx_hash):
            raise ValueError("signer returned an invalid settlement transaction hash")
    except Exception as e:
        return SettleResponse(
            success=False,
            error_reason=ERR_UPTO_TRANSACTION_FAILED,
            error_message=str(e),
            network=network,
            payer=payer,
            transaction="",
        )

    persistence_error: Exception | None = None
    record_persisted = False
    if pending_store is not None:
        try:
            pending_store.set(
                signature,
                _encode_pending_record(_build_pending_record(tx_hash, pending_fingerprint)),
            )
            record_persisted = True
        except Exception as e:
            persistence_error = e

    return _await_upto_eip3009_settlement(
        signer,
        tx_hash,
        network,
        payer,
        str(actual_amount),
        signature,
        pending_store,
        record_persisted,
        persistence_error,
    )

"""Shared utilities for Stellar x402 mechanisms."""

from dataclasses import dataclass, field

from stellar_sdk import TransactionEnvelope
from stellar_sdk.xdr import (
    SorobanAuthorizationEntry,
    SorobanCredentials,
    SorobanCredentialsType,
    SCAddress,
    SCAddressType,
)


@dataclass
class ContractSigners:
    """Analysis result of transaction auth entry signers."""

    already_signed: list[str] = field(default_factory=list)
    pending_signature: list[str] = field(default_factory=list)


def stellar_address_from_sc_address(sc_address: SCAddress) -> str:
    """Convert an SCAddress XDR object to a Stellar address string."""
    from stellar_sdk import Keypair, StrKey

    if sc_address.type == SCAddressType.SC_ADDRESS_TYPE_ACCOUNT:
        account_id = sc_address.account_id
        public_key = account_id.account_id.ed25519.uint256
        return Keypair.from_raw_ed25519_public_key(public_key).public_key
    elif sc_address.type == SCAddressType.SC_ADDRESS_TYPE_CONTRACT:
        contract_hash = sc_address.contract_id.hash
        return StrKey.encode_contract(contract_hash)
    else:
        raise ValueError(f"Unknown SCAddress type: {sc_address.type}")


def gather_auth_entry_signature_status(
    envelope: TransactionEnvelope,
) -> ContractSigners:
    """Inspect auth entries in a transaction and return signer status.

    Categorizes each auth entry's credential as already-signed or pending,
    based on whether the signature field is scvVoid or has content.
    """
    result = ContractSigners()

    tx = envelope.transaction
    if not tx.operations or len(tx.operations) != 1:
        raise ValueError(
            f"Expected exactly 1 operation, got {len(tx.operations) if tx.operations else 0}"
        )

    operation = tx.operations[0]
    invoke_xdr = operation.body.invoke_host_function_op
    if invoke_xdr is None:
        raise ValueError("Expected InvokeHostFunction operation")

    auth_entries = invoke_xdr.auth or []
    seen_signed: set[str] = set()
    seen_pending: set[str] = set()

    for entry in auth_entries:
        credentials = entry.credentials
        if credentials.type == SorobanCredentialsType.SOROBAN_CREDENTIALS_SOURCE_ACCOUNT:
            continue

        if credentials.type == SorobanCredentialsType.SOROBAN_CREDENTIALS_ADDRESS:
            addr_creds = credentials.address
            address = stellar_address_from_sc_address(addr_creds.address)
            signature = addr_creds.signature

            is_signed = signature.type.name != "SCV_VOID"

            if is_signed:
                if address not in seen_signed:
                    result.already_signed.append(address)
                    seen_signed.add(address)
            else:
                if address not in seen_pending:
                    result.pending_signature.append(address)
                    seen_pending.add(address)

    return result

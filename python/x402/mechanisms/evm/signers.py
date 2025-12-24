"""EVM signer implementations for common wallet libraries.

Provides ready-to-use signer implementations for popular Python Ethereum
libraries like eth_account.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from .types import TypedDataDomain, TypedDataField

if TYPE_CHECKING:
    from eth_account.signers.local import LocalAccount


class EthAccountSigner:
    """Client-side EVM signer using eth_account library.

    Implements the ClientEvmSigner protocol for use with eth_account's
    LocalAccount (from private key or mnemonic).

    Example:
        ```python
        from eth_account import Account
        from x402.mechanisms.evm.signers import EthAccountSigner

        # From private key
        account = Account.from_key("0x...")
        signer = EthAccountSigner(account)

        # Use with x402 client
        from x402 import x402Client
        from x402.mechanisms.evm.exact import register_exact_evm_client

        client = x402Client()
        register_exact_evm_client(client, signer)
        ```

    Args:
        account: eth_account LocalAccount instance.
    """

    def __init__(self, account: "LocalAccount") -> None:
        """Initialize signer with eth_account LocalAccount.

        Args:
            account: eth_account LocalAccount instance (from Account.from_key,
                Account.from_mnemonic, etc.).
        """
        self._account = account

    @property
    def address(self) -> str:
        """The signer's Ethereum address (checksummed).

        Returns:
            Checksummed Ethereum address (0x...).
        """
        return self._account.address

    def sign_typed_data(
        self,
        domain: TypedDataDomain,
        types: dict[str, list[TypedDataField]],
        primary_type: str,
        message: dict[str, Any],
    ) -> bytes:
        """Sign EIP-712 typed data.

        Args:
            domain: EIP-712 domain separator.
            types: Type definitions (dict of type name to list of TypedDataField).
            primary_type: Primary type name (unused, inferred by eth_account).
            message: Message data.

        Returns:
            65-byte ECDSA signature (r, s, v).
        """
        # Convert TypedDataField objects to dicts for eth_account
        types_dict: dict[str, list[dict[str, str]]] = {}
        for type_name, fields in types.items():
            types_dict[type_name] = [
                {"name": f.name, "type": f.type} if isinstance(f, TypedDataField) else f
                for f in fields
            ]

        # Convert TypedDataDomain to dict if needed
        domain_dict: dict[str, Any]
        if isinstance(domain, TypedDataDomain):
            domain_dict = {
                "name": domain.name,
                "version": domain.version,
                "chainId": domain.chain_id,
                "verifyingContract": domain.verifying_contract,
            }
        else:
            domain_dict = domain

        # Sign typed data using eth_account
        signed = self._account.sign_typed_data(
            domain_data=domain_dict,
            message_types=types_dict,
            message_data=message,
        )
        return bytes(signed.signature)

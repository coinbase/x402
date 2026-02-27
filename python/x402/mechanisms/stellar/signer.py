"""Signer protocols for Stellar x402 mechanisms."""

from typing import Protocol


class ClientStellarSigner(Protocol):
    """Protocol for client-side Stellar signing."""

    @property
    def address(self) -> str:
        """The client's Stellar public key (G-account)."""
        ...

    async def sign_auth_entry(
        self,
        entry_xdr: str,
        *,
        network_passphrase: str,
    ) -> str:
        """Sign a Soroban authorization entry.

        Args:
            entry_xdr: Base64 XDR of the auth entry to sign.
            network_passphrase: Network passphrase for signing context.

        Returns:
            Base64 XDR of the signed auth entry.
        """
        ...


class FacilitatorStellarSigner(Protocol):
    """Protocol for facilitator-side Stellar signing and submission."""

    @property
    def address(self) -> str:
        """The facilitator's Stellar public key (G-account)."""
        ...

    def sign_transaction(
        self,
        tx_xdr: str,
        *,
        network_passphrase: str,
    ) -> str:
        """Sign a Stellar transaction.

        Args:
            tx_xdr: Base64 XDR of the transaction to sign.
            network_passphrase: Network passphrase for signing context.

        Returns:
            Base64 XDR of the signed transaction.
        """
        ...

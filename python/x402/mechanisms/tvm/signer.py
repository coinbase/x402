"""TVM signer protocol definitions."""

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class ClientTvmSigner(Protocol):
    """Client-side TVM signer for payment authorizations.

    Implement this protocol to integrate with your TON wallet provider.
    """

    @property
    def address(self) -> str:
        """The signer's TON wallet address (raw format 0:hex).

        Returns:
            Raw TON address string.
        """
        ...

    @property
    def public_key(self) -> str:
        """The signer's Ed25519 public key (hex-encoded).

        Returns:
            Hex-encoded public key string.
        """
        ...

    async def sign_transfer(
        self,
        seqno: int,
        valid_until: int,
        messages: list[dict[str, Any]],
    ) -> str:
        """Sign a W5 transfer with the given messages.

        Args:
            seqno: Current wallet seqno.
            valid_until: Unix timestamp for transfer validity.
            messages: List of message dicts from facilitator /prepare.

        Returns:
            Base64-encoded signed external message BoC.
        """
        ...


@runtime_checkable
class FacilitatorTvmSigner(Protocol):
    """Facilitator-side TVM signer for verification and settlement.

    Implements read-only blockchain methods and BoC broadcast.
    No gasless methods - the facilitator handles relay internally.
    """

    async def get_seqno(self, address: str) -> int:
        """Get current seqno for a wallet address.

        Args:
            address: Raw address (0:hex).

        Returns:
            Current seqno value.
        """
        ...

    async def get_jetton_wallet(self, master: str, owner: str) -> str:
        """Resolve jetton wallet address for an owner.

        Args:
            master: Jetton master contract address (raw).
            owner: Owner wallet address (raw).

        Returns:
            Jetton wallet address (raw).
        """
        ...

    async def get_account_state(self, address: str) -> dict[str, Any]:
        """Get account state including balance and status.

        Args:
            address: Raw address (0:hex).

        Returns:
            Dict with 'balance', 'status', 'code_hash' fields.
        """
        ...

    async def get_transaction(self, tx_hash: str) -> dict[str, Any] | None:
        """Get transaction by hash.

        Args:
            tx_hash: Transaction hash (hex).

        Returns:
            Transaction dict or None if not found.
        """
        ...

    async def send_boc(self, boc: str) -> bool:
        """Broadcast a signed BoC to the network.

        Args:
            boc: Base64-encoded BoC.

        Returns:
            True on success.
        """
        ...

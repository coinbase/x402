"""Solana wallet utilities for x402 payments."""

from typing import Union
import base58
from solders.keypair import Keypair as SoldersKeypair
from solders.pubkey import Pubkey


class Keypair:
    """Wrapper around Solders Keypair for easier usage."""

    def __init__(self, keypair: SoldersKeypair):
        self._keypair = keypair

    @property
    def keypair(self) -> SoldersKeypair:
        """Get the underlying Solders keypair."""
        return self._keypair

    @property
    def pubkey(self) -> Pubkey:
        """Get the public key."""
        return self._keypair.pubkey()

    @property
    def address(self) -> str:
        """Get the base58-encoded address."""
        return str(self.pubkey)

    def __str__(self) -> str:
        return self.address

    def __repr__(self) -> str:
        return f"Keypair({self.address})"


def create_keypair_from_base58(private_key: str) -> Keypair:
    """
    Create a Keypair from a base58-encoded private key.

    Args:
        private_key: Base58-encoded private key (64 bytes)

    Returns:
        Keypair instance

    Example:
        >>> keypair = create_keypair_from_base58("5RckguVN9vZp8nsKaVz3...")
        >>> print(keypair.address)
    """
    try:
        secret_bytes = base58.b58decode(private_key)
        solders_keypair = SoldersKeypair.from_bytes(secret_bytes)
        return Keypair(solders_keypair)
    except Exception as e:
        raise ValueError(f"Invalid base58 private key: {e}")


def create_keypair_from_bytes(secret_bytes: bytes) -> Keypair:
    """
    Create a Keypair from raw secret bytes.

    Args:
        secret_bytes: 64-byte secret key

    Returns:
        Keypair instance
    """
    solders_keypair = SoldersKeypair.from_bytes(secret_bytes)
    return Keypair(solders_keypair)


def generate_keypair() -> Keypair:
    """
    Generate a new random keypair.

    Returns:
        Keypair instance
    """
    solders_keypair = SoldersKeypair()
    return Keypair(solders_keypair)


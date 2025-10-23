"""Solana RPC client utilities for x402 payments."""

from typing import Optional
from solana.rpc.api import Client
from x402.networks import SUPPORTED_SVM_NETWORKS


# Default RPC URLs
DEVNET_RPC_URL = "https://api.devnet.solana.com"
MAINNET_RPC_URL = "https://api.mainnet-beta.solana.com"


def get_rpc_url(network: str, custom_url: Optional[str] = None) -> str:
    """
    Get the RPC URL for a given Solana network.

    Args:
        network: Network name ("solana" or "solana-devnet")
        custom_url: Optional custom RPC URL to use instead of default

    Returns:
        RPC URL string

    Raises:
        ValueError: If network is not supported
    """
    if custom_url:
        return custom_url

    if network not in SUPPORTED_SVM_NETWORKS:
        raise ValueError(f"Unsupported SVM network: {network}")

    return DEVNET_RPC_URL if network == "solana-devnet" else MAINNET_RPC_URL


def get_rpc_client(network: str, custom_url: Optional[str] = None) -> Client:
    """
    Create a Solana RPC client for the given network.

    Args:
        network: Network name ("solana" or "solana-devnet")
        custom_url: Optional custom RPC URL to use instead of default

    Returns:
        Solana RPC Client instance

    Example:
        >>> client = get_rpc_client("solana-devnet")
        >>> balance = client.get_balance(pubkey)
    """
    url = get_rpc_url(network, custom_url)
    return Client(url)


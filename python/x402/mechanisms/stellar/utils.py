"""Utility functions for Stellar x402 mechanisms."""

import math
import re

from stellar_sdk import SorobanServer

from .constants import (
    DEFAULT_ESTIMATED_LEDGER_SECONDS,
    DEFAULT_TESTNET_RPC_URL,
    RPC_LEDGERS_SAMPLE_SIZE,
    STELLAR_ASSET_ADDRESS_REGEX,
    STELLAR_DESTINATION_ADDRESS_REGEX,
    STELLAR_NETWORK_TO_PASSPHRASE,
    STELLAR_PUBNET_CAIP2,
    STELLAR_TESTNET_CAIP2,
)


def is_stellar_network(network: str) -> bool:
    """Check if a CAIP-2 identifier is a Stellar network."""
    return network in STELLAR_NETWORK_TO_PASSPHRASE


def get_network_passphrase(network: str) -> str:
    """Get the Stellar network passphrase for a CAIP-2 identifier."""
    passphrase = STELLAR_NETWORK_TO_PASSPHRASE.get(network)
    if not passphrase:
        raise ValueError(f"Unknown Stellar network: {network}")
    return passphrase


def get_rpc_url(network: str, custom_url: str | None = None) -> str:
    """Get the RPC URL for a Stellar network."""
    if custom_url:
        return custom_url
    if network == STELLAR_TESTNET_CAIP2:
        return DEFAULT_TESTNET_RPC_URL
    if network == STELLAR_PUBNET_CAIP2:
        raise ValueError("Mainnet RPC URL must be provided via rpc_url config")
    raise ValueError(f"Unknown Stellar network: {network}")


def get_rpc_client(network: str, custom_url: str | None = None) -> SorobanServer:
    """Create a SorobanServer RPC client for the given network."""
    url = get_rpc_url(network, custom_url)
    return SorobanServer(url)


def validate_stellar_asset_address(address: str) -> bool:
    """Validate a Stellar asset/contract address (C-account only)."""
    return bool(re.match(STELLAR_ASSET_ADDRESS_REGEX, address))


def validate_stellar_destination_address(address: str) -> bool:
    """Validate a Stellar destination address (G, C, or M-account)."""
    return bool(re.match(STELLAR_DESTINATION_ADDRESS_REGEX, address))


async def get_estimated_ledger_close_time(
    server: SorobanServer,
) -> float:
    """Estimate the average ledger close time from recent ledgers.

    Falls back to DEFAULT_ESTIMATED_LEDGER_SECONDS if unable to calculate.
    """
    try:
        latest = server.get_latest_ledger()
        start_ledger = max(1, latest.sequence - RPC_LEDGERS_SAMPLE_SIZE)

        ledgers_response = server.get_ledgers(
            start_ledger=start_ledger,
            limit=RPC_LEDGERS_SAMPLE_SIZE,
        )

        ledgers = ledgers_response.ledgers
        if not ledgers or len(ledgers) < 2:
            return DEFAULT_ESTIMATED_LEDGER_SECONDS

        close_times = [int(ledger.closed_at_timestamp) for ledger in ledgers if hasattr(ledger, "closed_at_timestamp")]
        if len(close_times) < 2:
            return DEFAULT_ESTIMATED_LEDGER_SECONDS

        total_seconds = (close_times[-1] - close_times[0]) / 1000  # ms to s
        num_intervals = len(close_times) - 1
        avg = total_seconds / num_intervals

        return avg if avg > 0 else DEFAULT_ESTIMATED_LEDGER_SECONDS
    except Exception:
        return DEFAULT_ESTIMATED_LEDGER_SECONDS


def calculate_max_ledger(
    current_ledger: int,
    max_timeout_seconds: int,
    estimated_ledger_seconds: float = DEFAULT_ESTIMATED_LEDGER_SECONDS,
) -> int:
    """Calculate the max valid ledger from timeout seconds."""
    return current_ledger + math.ceil(max_timeout_seconds / estimated_ledger_seconds)

"""EVM utility functions for address, amount, and nonce handling."""

import os
import re
from datetime import datetime, timedelta
from decimal import Decimal

try:
    from eth_utils import to_checksum_address
except ImportError as e:
    raise ImportError(
        "EVM mechanism requires ethereum packages. Install with: pip install x402[evm]"
    ) from e

from .constants import (
    DEFAULT_VALIDITY_BUFFER,
    DEFAULT_VALIDITY_PERIOD,
    NETWORK_ALIASES,
    NETWORK_CONFIGS,
    V1_NETWORK_CHAIN_IDS,
    AssetInfo,
    NetworkConfig,
)


def get_evm_chain_id(network: str) -> int:
    """Extract chain ID from network string.

    Handles both CAIP-2 format (eip155:8453) and legacy names (base-sepolia).

    Args:
        network: Network identifier.

    Returns:
        Numeric chain ID.

    Raises:
        ValueError: If network format is unrecognized.
    """
    # Handle CAIP-2 format
    if network.startswith("eip155:"):
        try:
            return int(network.split(":")[1])
        except (IndexError, ValueError) as e:
            raise ValueError(f"Invalid CAIP-2 network format: {network}") from e

    # Check aliases
    if network in NETWORK_ALIASES:
        caip2 = NETWORK_ALIASES[network]
        return int(caip2.split(":")[1])

    # Check V1 legacy names
    if network in V1_NETWORK_CHAIN_IDS:
        return V1_NETWORK_CHAIN_IDS[network]

    raise ValueError(f"Unknown network: {network}")


def get_network_config(network: str) -> NetworkConfig:
    """Get configuration for a network.

    Args:
        network: Network identifier (CAIP-2 or legacy name).

    Returns:
        Network configuration.

    Raises:
        ValueError: If network is not configured.
    """
    # Normalize to CAIP-2
    if network in NETWORK_ALIASES:
        network = NETWORK_ALIASES[network]
    elif not network.startswith("eip155:"):
        # Try to convert legacy name
        if network in V1_NETWORK_CHAIN_IDS:
            network = f"eip155:{V1_NETWORK_CHAIN_IDS[network]}"

    if network in NETWORK_CONFIGS:
        return NETWORK_CONFIGS[network]

    raise ValueError(f"No configuration for network: {network}")


def get_asset_info(network: str, asset_symbol_or_address: str) -> AssetInfo:
    """Get asset info by symbol or address.

    Args:
        network: Network identifier.
        asset_symbol_or_address: Asset symbol (e.g., "USDC") or address.

    Returns:
        Asset information.

    Raises:
        ValueError: If asset is not found.
    """
    config = get_network_config(network)

    # Check if it's an address
    if asset_symbol_or_address.startswith("0x"):
        # Search by address
        for asset in config["supported_assets"].values():
            if asset["address"].lower() == asset_symbol_or_address.lower():
                return asset
        # Return default with provided address if not found
        return {
            "address": asset_symbol_or_address,
            "name": config["default_asset"]["name"],
            "version": config["default_asset"]["version"],
            "decimals": config["default_asset"]["decimals"],
        }

    # Search by symbol
    symbol = asset_symbol_or_address.upper()
    if symbol in config["supported_assets"]:
        return config["supported_assets"][symbol]

    raise ValueError(f"Asset {asset_symbol_or_address} not found on {network}")


def is_valid_network(network: str) -> bool:
    """Check if network is supported.

    Args:
        network: Network identifier.

    Returns:
        True if network is supported.
    """
    try:
        get_network_config(network)
        return True
    except ValueError:
        return False


def create_nonce() -> str:
    """Generate random 32-byte nonce as hex string (0x...).

    Returns:
        Hex string with 0x prefix.
    """
    return "0x" + os.urandom(32).hex()


def normalize_address(address: str) -> str:
    """Normalize Ethereum address to checksummed format.

    Uses EIP-55 checksum algorithm.

    Args:
        address: Ethereum address (with or without 0x prefix).

    Returns:
        Checksummed address.

    Raises:
        ValueError: If address is invalid.
    """
    # Remove prefix and lowercase
    addr = address.lower().removeprefix("0x")

    if len(addr) != 40:
        raise ValueError(f"Invalid address length: {len(addr)}")

    try:
        int(addr, 16)
    except ValueError as e:
        raise ValueError(f"Invalid hex in address: {address}") from e

    # Simple checksum - use keccak256 of lowercase address
    # For full EIP-55, would need keccak256 hash
    # This is a simplified version
    return to_checksum_address("0x" + addr)


def is_valid_address(address: str) -> bool:
    """Check if string is valid Ethereum address.

    Args:
        address: String to check.

    Returns:
        True if valid Ethereum address.
    """
    addr = address.lower().removeprefix("0x")
    if len(addr) != 40:
        return False
    try:
        int(addr, 16)
        return True
    except ValueError:
        return False


def parse_amount(amount: str, decimals: int) -> int:
    """Convert decimal string to smallest unit (wei).

    Args:
        amount: Decimal string (e.g., "1.50").
        decimals: Token decimals.

    Returns:
        Amount in smallest unit.
    """
    d = Decimal(amount)
    multiplier = Decimal(10**decimals)
    return int(d * multiplier)


def format_amount(amount: int, decimals: int) -> str:
    """Convert smallest unit to decimal string.

    Args:
        amount: Amount in smallest unit.
        decimals: Token decimals.

    Returns:
        Decimal string.
    """
    d = Decimal(amount)
    divisor = Decimal(10**decimals)
    return str(d / divisor)


def create_validity_window(
    duration: timedelta | None = None,
    buffer: int = DEFAULT_VALIDITY_BUFFER,
) -> tuple[int, int]:
    """Create valid_after/valid_before timestamps.

    Args:
        duration: How long authorization is valid (default: 1 hour).
        buffer: Seconds before now for valid_after (clock skew).

    Returns:
        (valid_after, valid_before) as Unix timestamps.
    """
    if duration is None:
        duration = timedelta(seconds=DEFAULT_VALIDITY_PERIOD)

    now = int(datetime.now().timestamp())
    valid_after = now - buffer
    valid_before = now + int(duration.total_seconds())
    return (valid_after, valid_before)


def hex_to_bytes(hex_str: str) -> bytes:
    """Convert hex string to bytes (handles 0x prefix).

    Args:
        hex_str: Hex string with optional 0x prefix.

    Returns:
        Bytes.
    """
    return bytes.fromhex(hex_str.removeprefix("0x"))


def bytes_to_hex(data: bytes) -> str:
    """Convert bytes to hex string with 0x prefix.

    Args:
        data: Bytes to convert.

    Returns:
        Hex string with 0x prefix.
    """
    return "0x" + data.hex()


def parse_money_to_decimal(money: str | float | int) -> float:
    """Parse Money to decimal.

    Handles formats like "$1.50", "1.50", 1.50.

    Args:
        money: Money value in various formats.

    Returns:
        Decimal amount as float.
    """
    if isinstance(money, int | float):
        return float(money)

    # Clean string
    clean = money.strip()
    clean = clean.lstrip("$")
    clean = re.sub(r"\s*(USD|USDC|usd|usdc)\s*$", "", clean)
    clean = clean.strip()

    return float(clean)

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
    NETWORK_CONFIGS,
    AssetInfo,
    NetworkConfig,
)


def get_evm_chain_id(network: str) -> int:
    """Extract chain ID from a CAIP-2 network identifier (eip155:CHAIN_ID).

    Args:
        network: Network identifier in CAIP-2 format (e.g., "eip155:8453").

    Returns:
        Numeric chain ID.

    Raises:
        ValueError: If network format is invalid.
    """
    if network.startswith("eip155:"):
        try:
            return int(network.split(":")[1])
        except (IndexError, ValueError) as e:
            raise ValueError(f"Invalid CAIP-2 network format: {network}") from e

    raise ValueError(f"Unsupported network format: {network} (expected eip155:CHAIN_ID)")


def get_network_config(network: str) -> NetworkConfig:
    """Get configuration for a CAIP-2 network identifier (eip155:CHAIN_ID).

    Returns a full config for known networks, or a minimal config (chain_id only)
    for any valid but unknown eip155 network.

    Args:
        network: Network identifier in CAIP-2 format.

    Returns:
        Network configuration.

    Raises:
        ValueError: If the network format is invalid or not an eip155 network.
    """
    if network in NETWORK_CONFIGS:
        return NETWORK_CONFIGS[network]

    if network.startswith("eip155:"):
        try:
            chain_id = int(network.split(":")[1])
            return {"chain_id": chain_id}
        except (IndexError, ValueError) as e:
            raise ValueError(f"Invalid CAIP-2 network format: {network}") from e

    raise ValueError(f"Unsupported network format: {network} (expected eip155:CHAIN_ID)")


def get_asset_info(network: str, asset_address: str) -> AssetInfo:
    """Get asset info by address.

    Returns the full default asset info if the address matches the network's default asset.

    Args:
        network: Network identifier in CAIP-2 format.
        asset_address: Asset contract address (0x...).

    Returns:
        Asset information.

    Raises:
        ValueError: If the address does not match any registered asset for the network.
    """
    config = get_network_config(network)
    default = config.get("default_asset")

    if default and default["address"].lower() == asset_address.lower():
        return default

    raise ValueError(f"Token {asset_address} is not a registered asset for network {network}.")


def is_valid_network(network: str) -> bool:
    """Check if network is a valid eip155 network identifier.

    Args:
        network: Network identifier.

    Returns:
        True if the network is a valid eip155:CHAIN_ID format.
    """
    if not network.startswith("eip155:"):
        return False
    try:
        int(network.split(":")[1])
        return True
    except (IndexError, ValueError):
        return False


def create_nonce() -> str:
    """Generate random 32-byte nonce as hex string (0x...).

    Returns:
        Hex string with 0x prefix.
    """
    return "0x" + os.urandom(32).hex()


def create_permit2_nonce() -> str:
    """Generate random uint256 nonce as decimal string for Permit2.

    Permit2 uses uint256 nonces (not bytes32), so the nonce is returned
    as a decimal string rather than a hex string.

    Returns:
        Decimal string representation of a random uint256.
    """
    return str(int.from_bytes(os.urandom(32), "big"))


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


def number_to_decimal_string(n: float | int) -> str:
    """Convert a number to a plain decimal string, expanding scientific notation.

    Mirrors the TypeScript ``numberToDecimalString`` utility added in the
    nanopayment precision fix. Python's ``float`` shares the same scientific-
    notation stringification problem as JavaScript (e.g. ``str(1e-7)`` yields
    ``'1e-07'`` instead of ``'0.0000001'``).

    Args:
        n: The number to convert.

    Returns:
        A plain decimal string with no scientific notation (e.g. ``'0.0000001'``).

    Examples:
        >>> number_to_decimal_string(1e-7)
        '0.0000001'
        >>> number_to_decimal_string(4.02)
        '4.02'
    """
    s = str(n)
    if "e" not in s.lower():
        return s
    # Use Decimal to expand the scientific notation without float round-tripping
    return format(Decimal(s), "f")


def convert_to_token_amount(decimal_amount: str, decimals: int) -> str:
    """Convert a plain decimal string to token smallest units.

    Mirrors the TypeScript ``convertToTokenAmount`` utility.  Accepts only
    plain decimal strings — scientific notation strings are rejected.  Raises
    a ``ValueError`` when the non-zero amount is too small to be represented
    with the given decimal precision (i.e. it would silently round to zero),
    preventing silent fund-loss bugs for nanopayments.

    Args:
        decimal_amount: The decimal amount as a plain string (e.g. ``'0.10'``).
            Must not use scientific notation.
        decimals: The number of decimals for the token (e.g. 6 for USDC).

    Returns:
        The amount in smallest units as a string.

    Raises:
        ValueError: If *decimal_amount* uses scientific notation, is not a
            valid number, or is non-zero but too small to represent at the
            requested precision.

    Examples:
        >>> convert_to_token_amount('0.10', 6)
        '100000'
        >>> convert_to_token_amount('0.000001', 6)
        '1'
    """
    if re.search(r"[eE]", decimal_amount):
        raise ValueError(
            f"Invalid amount: {decimal_amount!r} — use decimal notation, not scientific notation"
        )
    try:
        d = Decimal(decimal_amount)
    except Exception as exc:
        raise ValueError(f"Invalid amount: {decimal_amount!r}") from exc

    token_amount_dec = d * Decimal(10**decimals)
    token_amount = int(token_amount_dec)
    if token_amount == 0 and d != 0:
        raise ValueError(
            f"Amount {decimal_amount!r} is too small to represent with {decimals} decimal places"
        )
    return str(token_amount)


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

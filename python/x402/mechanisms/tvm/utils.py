"""TON address normalization and conversion utilities."""

from __future__ import annotations

import base64
import struct


def normalize_address(address: str) -> str:
    """Normalize any TON address format to raw format (0:hex).

    Accepts:
    - Raw: "0:b113a994..."
    - Friendly: "EQ..." or "UQ..." (base64url encoded)

    Returns:
        Raw address string like "0:b113a994..."

    Raises:
        ValueError: If address format is invalid.
    """
    address = address.strip()

    if ":" in address:
        return _validate_raw(address)

    if len(address) == 48 and (
        address.startswith("EQ")
        or address.startswith("UQ")
        or address.startswith("Ef")
        or address.startswith("Uf")
        or address.startswith("kQ")
        or address.startswith("0Q")
    ):
        return friendly_to_raw(address)

    raise ValueError(f"Unrecognized TON address format: {address}")


def _validate_raw(address: str) -> str:
    """Validate and normalize a raw address."""
    parts = address.split(":")
    if len(parts) != 2:
        raise ValueError(f"Invalid raw address: {address}")

    workchain = int(parts[0])
    hex_part = parts[1].lower()

    if len(hex_part) != 64:
        raise ValueError(f"Invalid address hash length: {len(hex_part)}, expected 64")

    try:
        bytes.fromhex(hex_part)
    except ValueError as e:
        raise ValueError(f"Invalid hex in address: {e}") from e

    return f"{workchain}:{hex_part}"


def friendly_to_raw(address: str) -> str:
    """Convert friendly address (EQ.../UQ...) to raw format (0:hex).

    Returns:
        Raw address string.

    Raises:
        ValueError: If address is invalid.
    """
    try:
        padded = address + "=" * (4 - len(address) % 4) if len(address) % 4 else address
        raw_bytes = base64.urlsafe_b64decode(padded)
    except Exception as e:
        raise ValueError(f"Failed to decode friendly address: {e}") from e

    if len(raw_bytes) != 36:
        raise ValueError(f"Invalid friendly address length: {len(raw_bytes)}, expected 36")

    # Verify CRC16
    data = raw_bytes[:34]
    expected_crc = struct.unpack(">H", raw_bytes[34:36])[0]
    actual_crc = _crc16(data)
    if expected_crc != actual_crc:
        raise ValueError(f"CRC16 mismatch: expected {expected_crc}, got {actual_crc}")

    workchain = struct.unpack("b", raw_bytes[1:2])[0]
    hash_bytes = raw_bytes[2:34]

    return f"{workchain}:{hash_bytes.hex()}"


def raw_to_friendly(address: str, bounceable: bool = True, testnet: bool = False) -> str:
    """Convert raw address (0:hex) to friendly format.

    Args:
        address: Raw address string.
        bounceable: If True, use bounceable format (EQ...). Default True.
        testnet: If True, set testnet flag. Default False.

    Returns:
        Base64url-encoded friendly address string.
    """
    parts = address.split(":")
    workchain = int(parts[0])
    hash_bytes = bytes.fromhex(parts[1])

    tag = 0x11 if bounceable else 0x51
    if testnet:
        tag |= 0x80

    data = struct.pack("b", tag) + struct.pack("b", workchain) + hash_bytes
    crc = _crc16(data)
    full = data + struct.pack(">H", crc)

    return base64.urlsafe_b64encode(full).decode().rstrip("=")


def is_valid_address(address: str) -> bool:
    """Check if string is a valid TON address.

    Args:
        address: String to check.

    Returns:
        True if valid TON address.
    """
    try:
        normalize_address(address)
        return True
    except (ValueError, Exception):
        return False


def is_valid_network(network: str) -> bool:
    """Check if network is a valid TVM network identifier.

    Args:
        network: Network identifier.

    Returns:
        True if valid tvm:GLOBAL_ID format.
    """
    if not network.startswith("tvm:"):
        return False
    try:
        int(network.split(":")[1])
        return True
    except (IndexError, ValueError):
        return False


def _crc16(data: bytes) -> int:
    """CRC16-CCITT (XModem) used by TON addresses."""
    crc = 0
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = (crc << 1) ^ 0x1021
            else:
                crc <<= 1
            crc &= 0xFFFF
    return crc

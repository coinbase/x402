"""V1 legacy network utilities for EVM mechanisms."""

from ..constants import NETWORK_CONFIGS, AssetInfo
from .constants import NETWORK_ALIASES, V1_NETWORK_CHAIN_IDS


def get_evm_chain_id(network: str) -> int:
    """Extract chain ID from a v1 legacy network name.

    Args:
        network: V1 network name (e.g., "base-sepolia", "polygon").

    Returns:
        Numeric chain ID.

    Raises:
        ValueError: If network is not a known v1 network.
    """
    if network in NETWORK_ALIASES:
        caip2 = NETWORK_ALIASES[network]
        return int(caip2.split(":")[1])

    if network in V1_NETWORK_CHAIN_IDS:
        return V1_NETWORK_CHAIN_IDS[network]

    raise ValueError(f"Unknown v1 network: {network}")


def get_asset_info(network: str, asset_symbol_or_address: str) -> AssetInfo:
    """Get asset info for a v1 network.

    Normalizes the v1 network name to CAIP-2 and looks up in shared NETWORK_CONFIGS.

    Args:
        network: V1 network name.
        asset_symbol_or_address: Asset symbol (e.g., "USDC") or address.

    Returns:
        Asset information.

    Raises:
        ValueError: If asset is not found.
    """
    caip2_network = _normalize_to_caip2(network)

    if caip2_network not in NETWORK_CONFIGS:
        raise ValueError(f"No configuration for v1 network: {network}")

    config = NETWORK_CONFIGS[caip2_network]

    if asset_symbol_or_address.startswith("0x"):
        for asset in config["supported_assets"].values():
            if asset["address"].lower() == asset_symbol_or_address.lower():
                return asset
        return {
            "address": asset_symbol_or_address,
            "name": config["default_asset"]["name"],
            "version": config["default_asset"]["version"],
            "decimals": config["default_asset"]["decimals"],
        }

    symbol = asset_symbol_or_address.upper()
    if symbol and symbol in config["supported_assets"]:
        return config["supported_assets"][symbol]

    return config["default_asset"]


def _normalize_to_caip2(network: str) -> str:
    """Convert a v1 network name to CAIP-2 format."""
    if network in NETWORK_ALIASES:
        return NETWORK_ALIASES[network]

    if network in V1_NETWORK_CHAIN_IDS:
        return f"eip155:{V1_NETWORK_CHAIN_IDS[network]}"

    raise ValueError(f"Unknown v1 network: {network}")

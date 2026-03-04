"""Constants for Hypercore L1."""

from typing import TypedDict

SCHEME_EXACT = "exact"
NETWORK_MAINNET = "hypercore:mainnet"
NETWORK_TESTNET = "hypercore:testnet"

HYPERLIQUID_API_MAINNET = "https://api.hyperliquid.xyz"
HYPERLIQUID_API_TESTNET = "https://api.hyperliquid-testnet.xyz"


class AssetInfo(TypedDict):
    """Information about an asset."""

    token: str
    name: str
    decimals: int


class NetworkConfig(TypedDict):
    """Configuration for a Hypercore network."""

    default_asset: AssetInfo


NETWORK_CONFIGS: dict[str, NetworkConfig] = {
    NETWORK_MAINNET: {
        "default_asset": {
            "token": "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
            "name": "USDH",
            "decimals": 8,
        }
    },
    NETWORK_TESTNET: {
        "default_asset": {
            "token": "USDH:0x471fd4480bb9943a1fe080ab0d4ff36c",
            "name": "USDH",
            "decimals": 8,
        }
    },
}

NETWORK_API_URLS: dict[str, str] = {
    NETWORK_MAINNET: HYPERLIQUID_API_MAINNET,
    NETWORK_TESTNET: HYPERLIQUID_API_TESTNET,
}

MAX_NONCE_AGE_SECONDS = 3600
TX_HASH_MAX_RETRIES = 2
TX_HASH_RETRY_DELAY = 0.5
TX_HASH_LOOKBACK_WINDOW = 5.0

ERR_INVALID_NETWORK = "invalid_network"
ERR_INVALID_ACTION_TYPE = "invalid_action_type"
ERR_DESTINATION_MISMATCH = "destination_mismatch"
ERR_INSUFFICIENT_AMOUNT = "insufficient_amount"
ERR_TOKEN_MISMATCH = "token_mismatch"
ERR_NONCE_TOO_OLD = "nonce_too_old"
ERR_INVALID_SIGNATURE = "invalid_signature_structure"
ERR_SETTLEMENT_FAILED = "settlement_failed"

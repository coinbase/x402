from typing import Literal


SupportedNetworks = Literal[
    "base",
    "base-sepolia",
    "avalanche-fuji",
    "avalanche",
    "solana",
    "solana-devnet",
]

EVM_NETWORK_TO_CHAIN_ID = {
    "base-sepolia": 84532,
    "base": 8453,
    "avalanche-fuji": 43113,
    "avalanche": 43114,
}

SVM_NETWORK_TO_CHAIN_ID = {
    "solana-devnet": 103,
    "solana": 101,
}

SUPPORTED_EVM_NETWORKS = ["base", "base-sepolia", "avalanche-fuji", "avalanche"]
SUPPORTED_SVM_NETWORKS = ["solana", "solana-devnet"]

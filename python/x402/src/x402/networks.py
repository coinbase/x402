from typing import Literal


SupportedNetworks = Literal[
    "base", "base-sepolia", "arc-testnet", "avalanche-fuji", "avalanche"
]

EVM_NETWORK_TO_CHAIN_ID = {
    "arc-testnet": 5042002,
    "base-sepolia": 84532,
    "base": 8453,
    "avalanche-fuji": 43113,
    "avalanche": 43114,
}

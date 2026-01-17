from typing import Literal


SupportedNetworks = Literal["base", "base-sepolia", "avalanche-fuji", "avalanche", "polygon-amoy"]

EVM_NETWORK_TO_CHAIN_ID = {
    "base-sepolia": 84532,
    "base": 8453,
    "avalanche-fuji": 43113,
    "avalanche": 43114,
    "polygon-amoy": 80002,
}

from typing import Literal


SupportedNetworks = Literal["base", "kairos-testnet", "avalanche-fuji", "avalanche"]

EVM_NETWORK_TO_CHAIN_ID = {
    "kairos-testnet": 84532,
    "base": 8453,
    "avalanche-fuji": 43113,
    "avalanche": 43114,
}

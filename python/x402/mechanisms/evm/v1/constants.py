"""V1 legacy network constants for EVM mechanisms."""

# Network aliases (legacy names to CAIP-2)
NETWORK_ALIASES: dict[str, str] = {
    "base": "eip155:8453",
    "base-mainnet": "eip155:8453",
    "base-sepolia": "eip155:84532",
    "ethereum": "eip155:1",
    "mainnet": "eip155:1",
    "polygon": "eip155:137",
    "avalanche": "eip155:43114",
    "megaeth": "eip155:4326",
    "monad": "eip155:143",
}

# V1 supported networks (legacy name-based)
V1_NETWORKS = [
    "abstract",
    "abstract-testnet",
    "base-sepolia",
    "base",
    "avalanche-fuji",
    "avalanche",
    "iotex",
    "sei",
    "sei-testnet",
    "polygon",
    "polygon-amoy",
    "peaq",
    "story",
    "educhain",
    "skale-base-sepolia",
    "megaeth",
    "monad",
]

# V1 network name to chain ID mapping
V1_NETWORK_CHAIN_IDS: dict[str, int] = {
    "base": 8453,
    "base-sepolia": 84532,
    "ethereum": 1,
    "polygon": 137,
    "polygon-amoy": 80002,
    "avalanche": 43114,
    "avalanche-fuji": 43113,
    "abstract": 2741,
    "abstract-testnet": 11124,
    "iotex": 4689,
    "sei": 1329,
    "sei-testnet": 713715,
    "peaq": 3338,
    "story": 1513,
    "educhain": 656476,
    "skale-base-sepolia": 1444673419,
    "megaeth": 4326,
    "monad": 143,
}

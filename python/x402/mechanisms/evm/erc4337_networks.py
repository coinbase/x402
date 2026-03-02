"""ERC-4337 network registry for x402 EVM mechanism."""

from dataclasses import dataclass


@dataclass
class ERC4337ChainInfo:
    """Information about an ERC-4337 supported chain."""

    chain_id: int
    name: str
    v1_name: str
    caip2: str
    rpc_url: str
    block_explorer_url: str
    usdc_address: str
    safe_transaction_service_url: str | None
    testnet: bool


ERC4337_SUPPORTED_CHAINS: dict[int, ERC4337ChainInfo] = {
    8453: ERC4337ChainInfo(
        chain_id=8453,
        name="Base",
        v1_name="base",
        caip2="eip155:8453",
        rpc_url="https://mainnet.base.org",
        block_explorer_url="https://basescan.org",
        usdc_address="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        safe_transaction_service_url="https://safe-transaction-base.safe.global",
        testnet=False,
    ),
    84532: ERC4337ChainInfo(
        chain_id=84532,
        name="Base Sepolia",
        v1_name="base-sepolia",
        caip2="eip155:84532",
        rpc_url="https://sepolia.base.org",
        block_explorer_url="https://sepolia.basescan.org",
        usdc_address="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        safe_transaction_service_url="https://safe-transaction-base-sepolia.safe.global",
        testnet=True,
    ),
    10: ERC4337ChainInfo(
        chain_id=10,
        name="Optimism",
        v1_name="optimism",
        caip2="eip155:10",
        rpc_url="https://mainnet.optimism.io",
        block_explorer_url="https://optimistic.etherscan.io",
        usdc_address="0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
        safe_transaction_service_url="https://safe-transaction-optimism.safe.global",
        testnet=False,
    ),
    11155420: ERC4337ChainInfo(
        chain_id=11155420,
        name="Optimism Sepolia",
        v1_name="optimism-sepolia",
        caip2="eip155:11155420",
        rpc_url="https://sepolia.optimism.io",
        block_explorer_url="https://sepolia-optimistic.etherscan.io",
        usdc_address="0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
        safe_transaction_service_url=None,
        testnet=True,
    ),
    42161: ERC4337ChainInfo(
        chain_id=42161,
        name="Arbitrum One",
        v1_name="arbitrum",
        caip2="eip155:42161",
        rpc_url="https://arb1.arbitrum.io/rpc",
        block_explorer_url="https://arbiscan.io",
        usdc_address="0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        safe_transaction_service_url="https://safe-transaction-arbitrum.safe.global",
        testnet=False,
    ),
    421614: ERC4337ChainInfo(
        chain_id=421614,
        name="Arbitrum Sepolia",
        v1_name="arbitrum-sepolia",
        caip2="eip155:421614",
        rpc_url="https://sepolia-rollup.arbitrum.io/rpc",
        block_explorer_url="https://sepolia.arbiscan.io",
        usdc_address="0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
        safe_transaction_service_url=None,
        testnet=True,
    ),
}

# V1 name index for reverse lookup
_V1_NAME_INDEX: dict[str, ERC4337ChainInfo] = {
    chain.v1_name: chain for chain in ERC4337_SUPPORTED_CHAINS.values()
}


def get_erc4337_chain(chain_id: int) -> ERC4337ChainInfo | None:
    """Get chain info by chain ID.

    Args:
        chain_id: The numeric chain ID.

    Returns:
        The chain info or None if not found.
    """
    return ERC4337_SUPPORTED_CHAINS.get(chain_id)


def is_erc4337_supported(chain_id: int) -> bool:
    """Check if a chain ID is in the ERC-4337 supported chains registry.

    Args:
        chain_id: The numeric chain ID.

    Returns:
        Whether the chain is supported.
    """
    return chain_id in ERC4337_SUPPORTED_CHAINS


def resolve_erc4337_chain_id(network: str) -> int:
    """Resolve a network input to a numeric chain ID.

    Handles CAIP-2 format (eip155:chainId), v1 names, and numeric strings.

    Args:
        network: The network identifier to resolve.

    Returns:
        The numeric chain ID.

    Raises:
        ValueError: If the network cannot be resolved.
    """
    # Try CAIP-2 format
    if network.startswith("eip155:"):
        parts = network.split(":", 1)
        if len(parts) != 2:
            raise ValueError(f"Invalid CAIP-2 identifier: {network}")
        try:
            return int(parts[1])
        except ValueError:
            raise ValueError(f"Invalid CAIP-2 chain ID: {network}") from None

    # Try v1 name
    if network in _V1_NAME_INDEX:
        return _V1_NAME_INDEX[network].chain_id

    # Try numeric
    try:
        return int(network)
    except ValueError:
        raise ValueError(
            f"Unknown network: {network}. Expected CAIP-2 (eip155:chainId), "
            f"a known v1 name, or a numeric chain ID."
        ) from None


def get_supported_chains() -> list[ERC4337ChainInfo]:
    """Return all supported chains."""
    return list(ERC4337_SUPPORTED_CHAINS.values())


def get_mainnets() -> list[ERC4337ChainInfo]:
    """Return all supported mainnet chains."""
    return [c for c in ERC4337_SUPPORTED_CHAINS.values() if not c.testnet]


def get_testnets() -> list[ERC4337ChainInfo]:
    """Return all supported testnet chains."""
    return [c for c in ERC4337_SUPPORTED_CHAINS.values() if c.testnet]

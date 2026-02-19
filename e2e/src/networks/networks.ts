/**
 * Network configuration for E2E tests
 * 
 * This is the single source of truth for all network configs.
 * Use getNetworkSet() to get configs for testnet or mainnet mode.
 */

export type NetworkMode = 'testnet' | 'mainnet';
export type ProtocolFamily = 'evm' | 'svm' | 'stellar';

export type NetworkConfig = {
  name: string;
  caip2: `${string}:${string}`;
  rpcUrl: string;
};

export type NetworkSet = {
  evm: NetworkConfig;
  svm: NetworkConfig;
  stellar: NetworkConfig;
};

/**
 * All supported networks, organized by mode and protocol family
 */
const NETWORK_SETS: Record<NetworkMode, NetworkSet> = {
  testnet: {
    evm: {
      name: 'Base Sepolia',
      caip2: 'eip155:84532',
      rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    },
    svm: {
      name: 'Solana Devnet',
      caip2: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
      rpcUrl: process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com',
    },
    stellar: {
      name: 'Stellar Testnet',
      caip2: 'stellar:testnet',
      rpcUrl: process.env.STELLAR_TESTNET_RPC_URL || 'https://soroban-testnet.stellar.org',
    },
  },
  mainnet: {
    evm: {
      name: 'Base',
      caip2: 'eip155:8453',
      rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    },
    svm: {
      name: 'Solana',
      caip2: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    },
    stellar: {
      name: 'Stellar Pubnet',
      caip2: 'stellar:pubnet',
      rpcUrl: process.env.STELLAR_RPC_URL || 'https://mainnet.sorobanrpc.com',
    },
  },
};

/**
 * Get the network set for a given mode
 * 
 * @param mode - 'testnet' or 'mainnet'
 * @returns NetworkSet containing EVM and SVM network configs
 */
export function getNetworkSet(mode: NetworkMode): NetworkSet {
  return NETWORK_SETS[mode];
}

/**
 * Get network config for a protocol family in a given mode
 * 
 * @param mode - 'testnet' or 'mainnet'
 * @param protocolFamily - 'evm', 'svm', or 'stellar'
 * @returns NetworkConfig for the specified protocol, or undefined if not available
 */
export function getNetworkForProtocol(
  mode: NetworkMode,
  protocolFamily: ProtocolFamily
): NetworkConfig {
  return NETWORK_SETS[mode][protocolFamily];
}

/**
 * Get display string for a network mode
 * 
 * @param mode - 'testnet' or 'mainnet'
 * @returns Human-readable description of the networks
 */
export function getNetworkModeDescription(mode: NetworkMode): string {
  const set = NETWORK_SETS[mode];
  const networks = [set.evm.name, set.svm.name, set.stellar.name];
  return networks.join(' + ');
}

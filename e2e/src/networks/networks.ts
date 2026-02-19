/**
 * Network configuration for E2E tests
 * 
 * This is the single source of truth for all network configs.
 * Use getNetworkSet() to get configs for testnet or mainnet mode.
 */

export type NetworkMode = 'testnet' | 'mainnet';
export type ProtocolFamily = 'evm' | 'svm' | 'aptos';

export type NetworkConfig = {
  name: string;
  caip2: `${string}:${string}`;
  rpcUrl: string;
};

export type NetworkSet = {
  evm: NetworkConfig;
  svm: NetworkConfig;
  aptos: NetworkConfig;
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
    aptos: {
      name: 'Aptos Testnet',
      caip2: 'aptos:2',
      rpcUrl: process.env.APTOS_TESTNET_RPC_URL || 'https://fullnode.testnet.aptoslabs.com/v1',
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
    aptos: {
      name: 'Aptos',
      caip2: 'aptos:1',
      rpcUrl: process.env.APTOS_RPC_URL || 'https://fullnode.mainnet.aptoslabs.com/v1',
    },
  },
};

/**
 * Get the network set for a given mode
 * 
 * @param mode - 'testnet' or 'mainnet'
 * @returns NetworkSet containing EVM, SVM, and Aptos network configs
 */
export function getNetworkSet(mode: NetworkMode): NetworkSet {
  return NETWORK_SETS[mode];
}

/**
 * Get network config for a protocol family in a given mode
 * 
 * @param mode - 'testnet' or 'mainnet'
 * @param protocolFamily - 'evm', 'svm', or 'aptos'
 * @returns NetworkConfig for the specified protocol
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
  return `${set.evm.name} + ${set.svm.name} + ${set.aptos.name}`;
}

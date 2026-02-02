import { Network } from "@x402/core/types";

/**
 * Concordium chain configuration.
 */
export interface ChainConfig {
  name: string;
  network: Network;
  v1Network: string;
  grpcUrl: string;
  explorerUrl: string;
  decimals: number;
}

export const CONCORDIUM_MAINNET: ChainConfig = {
  name: "Concordium Mainnet",
  network: "ccd:9dd9ca4d19e9393877d2c44b70f89acb",
  v1Network: "concordium",
  grpcUrl: "grpc.mainnet.concordium.software:20000",
  explorerUrl: "https://ccdexplorer.io/mainnet",
  decimals: 6,
};

export const CONCORDIUM_TESTNET: ChainConfig = {
  name: "Concordium Testnet",
  network: "ccd:4221332d34e1694168c2a0c0b3fd0f27",
  v1Network: "concordium-testnet",
  grpcUrl: "grpc.testnet.concordium.com:20000",
  explorerUrl: "https://ccdexplorer.io/testnet",
  decimals: 6,
};

const CHAINS: ChainConfig[] = [CONCORDIUM_MAINNET, CONCORDIUM_TESTNET];

const BY_NETWORK = new Map(CHAINS.map(c => [c.network, c]));
const BY_V1 = new Map(CHAINS.map(c => [c.v1Network, c]));

/**
 * V1 network names.
 */
export const CONCORDIUM_V1_NETWORKS = CHAINS.map(c => c.v1Network);

/**
 * Gets chain config by network identifier.
 *
 * @param network - Network identifier (V1 name or CAIP-2 format)
 * @returns Chain configuration or undefined if not found
 */
export function getChainConfig(network: string | Network): ChainConfig | undefined {
  return BY_V1.get(network) ?? BY_NETWORK.get(network as Network);
}

/**
 * Gets explorer URL for a transaction.
 *
 * @param network - Network identifier (V1 name or CAIP-2 format)
 * @param txHash - Transaction hash
 * @returns Explorer URL or undefined if network not found
 */
export function getExplorerTxUrl(network: string | Network, txHash: string): string | undefined {
  const config = getChainConfig(network);
  return config ? `${config.explorerUrl}/transaction/${txHash}` : undefined;
}

/**
 * Gets explorer URL for an account.
 *
 * @param network - Network identifier (V1 name or CAIP-2 format)
 * @param address - Account address
 * @returns Explorer URL or undefined if network not found
 */
export function getExplorerAccountUrl(
  network: string | Network,
  address: string,
): string | undefined {
  const config = getChainConfig(network);
  return config ? `${config.explorerUrl}/account/${address}` : undefined;
}

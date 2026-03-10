import { AlgodClient } from "@algorandfoundation/algokit-utils/algod-client";
import { ALGORAND_NETWORK_REFS } from "../../paywallUtils";

/**
 * Default public RPC endpoint for Algorand testnet
 */
const TESTNET_RPC_URL = "https://testnet-api.algonode.cloud";

/**
 * Default public RPC endpoint for Algorand mainnet
 */
const MAINNET_RPC_URL = "https://mainnet-api.algonode.cloud";

/**
 * Creates an Algod client for the testnet network.
 *
 * @param url - Optional URL of the testnet network.
 * @returns An Algod client.
 */
export function createTestnetAlgodClient(url?: string): AlgodClient {
  return new AlgodClient({ baseUrl: url ?? TESTNET_RPC_URL });
}

/**
 * Creates an Algod client for the mainnet network.
 *
 * @param url - Optional URL of the mainnet network.
 * @returns An Algod client.
 */
export function createMainnetAlgodClient(url?: string): AlgodClient {
  return new AlgodClient({ baseUrl: url ?? MAINNET_RPC_URL });
}

/**
 * Gets the Algod client for the given network.
 *
 * @param network - The network to get the Algod client for (CAIP-2 format: algorand:reference)
 * @param url - Optional URL of the network. If not provided, the default URL will be used.
 * @returns The Algod client for the given network
 */
export function getAlgodClient(network: string, url?: string): AlgodClient {
  if (!network.startsWith("algorand:")) {
    throw new Error(
      `Invalid network format. Expected CAIP-2 format (algorand:reference), got: ${network}`,
    );
  }

  const ref = network.split(":")[1];
  const isTestnet = ref === ALGORAND_NETWORK_REFS.TESTNET;

  return isTestnet ? createTestnetAlgodClient(url) : createMainnetAlgodClient(url);
}

/**
 * USDC ASA IDs for Algorand networks
 */
export const USDC_ASA_IDS: Record<string, string> = {
  [ALGORAND_NETWORK_REFS.MAINNET]: "31566704",
  [ALGORAND_NETWORK_REFS.TESTNET]: "10458941",
};

/**
 * Gets the USDC ASA ID for the given network reference.
 *
 * @param networkRef - The network reference (genesis hash).
 * @returns The USDC ASA ID or undefined if not found.
 */
export function getUsdcAsaId(networkRef: string): string | undefined {
  return USDC_ASA_IDS[networkRef];
}

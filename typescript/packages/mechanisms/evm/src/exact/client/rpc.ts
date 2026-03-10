import { createPublicClient, http } from "viem";
import type { ClientEvmSigner } from "../../signer";
import { getEvmChainId } from "../../utils";

export type ExactEvmSchemeConfig = {
  rpcUrl?: string;
};

export type ExactEvmSchemeConfigByChainId = Record<number, ExactEvmSchemeConfig>;

export type ExactEvmSchemeOptions = ExactEvmSchemeConfig | ExactEvmSchemeConfigByChainId;

type ExtensionRpcCapabilities = Pick<
  ClientEvmSigner,
  "readContract" | "signTransaction" | "getTransactionCount" | "estimateFeesPerGas"
>;

const rpcClientCache = new Map<string, ReturnType<typeof createPublicClient>>();

/**
 * Determines whether scheme options are keyed by numeric chain id.
 *
 * @param options - Exact EVM scheme options provided by the client.
 * @returns True when options are a chainId-to-config mapping.
 */
function isConfigByChainId(
  options: ExactEvmSchemeOptions,
): options is ExactEvmSchemeConfigByChainId {
  const keys = Object.keys(options);
  return keys.length > 0 && keys.every(key => /^\d+$/.test(key));
}

/**
 * Returns a cached viem public client for a specific RPC URL.
 *
 * @param rpcUrl - The RPC endpoint URL used to construct the client.
 * @returns A cached or newly created viem public client instance.
 */
function getRpcClient(rpcUrl: string): ReturnType<typeof createPublicClient> {
  const existing = rpcClientCache.get(rpcUrl);
  if (existing) {
    return existing;
  }

  const client = createPublicClient({
    transport: http(rpcUrl),
  });
  rpcClientCache.set(rpcUrl, client);
  return client;
}

/**
 * Resolves the RPC URL for a given CAIP-2 network from scheme options.
 *
 * @param network - CAIP-2 network identifier.
 * @param options - Optional scheme configuration (single config or chain map).
 * @returns The configured RPC URL for the network, if available.
 */
export function resolveRpcUrl(
  network: string,
  options?: ExactEvmSchemeOptions,
): string | undefined {
  if (!options) {
    return undefined;
  }

  if (isConfigByChainId(options)) {
    const chainId = getEvmChainId(network);
    const optionsByChainId = options as ExactEvmSchemeConfigByChainId;
    return optionsByChainId[chainId]?.rpcUrl;
  }

  return (options as ExactEvmSchemeConfig).rpcUrl;
}

/**
 * Resolves extension RPC capabilities from signer methods and optional RPC backfill.
 *
 * @param network - CAIP-2 network identifier for chain resolution.
 * @param signer - Client signer with optional RPC-like methods.
 * @param options - Optional scheme configuration used for RPC backfill.
 * @returns The best available capability set for extension enrichment flows.
 */
export function resolveExtensionRpcCapabilities(
  network: string,
  signer: ClientEvmSigner,
  options?: ExactEvmSchemeOptions,
): ExtensionRpcCapabilities {
  const capabilities: ExtensionRpcCapabilities = {
    signTransaction: signer.signTransaction,
    readContract: signer.readContract,
    getTransactionCount: signer.getTransactionCount,
    estimateFeesPerGas: signer.estimateFeesPerGas,
  };

  const needsRpcBackfill =
    !capabilities.readContract ||
    !capabilities.getTransactionCount ||
    !capabilities.estimateFeesPerGas;
  if (!needsRpcBackfill) {
    return capabilities;
  }

  const rpcUrl = resolveRpcUrl(network, options);
  if (!rpcUrl) {
    return capabilities;
  }
  const rpcClient = getRpcClient(rpcUrl);
  if (!capabilities.readContract) {
    capabilities.readContract = args => rpcClient.readContract(args as never) as Promise<unknown>;
  }
  if (!capabilities.getTransactionCount) {
    capabilities.getTransactionCount = async args =>
      rpcClient.getTransactionCount({ address: args.address });
  }
  if (!capabilities.estimateFeesPerGas) {
    capabilities.estimateFeesPerGas = async () => rpcClient.estimateFeesPerGas();
  }

  return capabilities;
}

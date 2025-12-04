import type {
  TransactionSigner,
  MessagePartialSigner,
  RpcDevnet,
  SolanaRpcApiDevnet,
  RpcTestnet,
  SolanaRpcApiTestnet,
  RpcMainnet,
  SolanaRpcApiMainnet,
  Address,
} from "@solana/kit";
import { createRpcClient } from "./utils";

/**
 * Client-side signer for creating and signing Solana transactions
 * This is a wrapper around TransactionSigner from @solana/kit
 */
export type ClientSvmSigner = TransactionSigner;

/**
 * Configuration for client operations
 */
export type ClientSvmConfig = {
  /**
   * Optional custom RPC URL for the client to use
   */
  rpcUrl?: string;
};

/**
 * Signing capabilities needed by the facilitator
 * Must support both transaction and message signing
 * KeyPairSigner from @solana/kit satisfies this interface
 */
export type FacilitatorSigningCapabilities = TransactionSigner & MessagePartialSigner;

/**
 * RPC client type from @solana/kit
 * Can be devnet, testnet, or mainnet RPC client
 */
export type FacilitatorRpcClient =
  | RpcDevnet<SolanaRpcApiDevnet>
  | RpcTestnet<SolanaRpcApiTestnet>
  | RpcMainnet<SolanaRpcApiMainnet>;

/**
 * RPC capabilities needed by the facilitator for verification and settlement
 * This is a legacy interface for custom RPC implementations
 */
export type FacilitatorRpcCapabilities = {
  /**
   * Get the SOL balance of an account
   *
   * @param address - Base58 encoded address
   * @returns Balance in lamports
   */
  getBalance(address: string): Promise<bigint>;

  /**
   * Get the token account balance
   *
   * @param address - Base58 encoded token account address
   * @returns Token balance in smallest units
   */
  getTokenAccountBalance(address: string): Promise<bigint>;

  /**
   * Get the latest blockhash information
   *
   * @returns Blockhash and last valid block height
   */
  getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: bigint }>;

  /**
   * Simulate a transaction to check if it would succeed
   *
   * @param transaction - Base64 encoded transaction
   * @param config - Simulation configuration
   * @returns Simulation result
   */
  simulateTransaction(transaction: string, config: unknown): Promise<unknown>;

  /**
   * Send a transaction to the network
   *
   * @param transaction - Base64 encoded signed transaction
   * @returns Transaction signature
   */
  sendTransaction(transaction: string): Promise<string>;

  /**
   * Wait for transaction confirmation
   *
   * @param signature - Transaction signature
   * @returns Confirmation result
   */
  confirmTransaction(signature: string): Promise<unknown>;

  /**
   * Fetch token mint information
   *
   * @param address - Base58 encoded mint address
   * @returns Mint information including decimals
   */
  fetchMint(address: string): Promise<unknown>;
};

/**
 * Facilitator-side interface combining signing and RPC operations
 * The facilitator needs to:
 * - Sign transactions as the fee payer
 * - Interact with the blockchain via RPC
 *
 * Supports multiple addresses for load balancing, key rotation, and high availability
 */
export type FacilitatorSvmSigner = FacilitatorSigningCapabilities & {
  /**
   * Get all addresses this facilitator can use as fee payers
   * Enables dynamic address selection for load balancing and key rotation
   *
   * @returns Array of addresses available for signing
   */
  getAddresses(): readonly Address[];

  /**
   * Get specific signer for a given address
   * Used during settlement to sign with the correct key matching the feePayer
   *
   * @param address - The address to get signer for
   * @returns Signer for the specified address
   * @throws Error if no signer exists for the address
   */
  getSigner(address: Address): FacilitatorSigningCapabilities;

  /**
   * Get RPC client for a specific network
   * Returns custom RPC if configured, otherwise creates default RPC
   *
   * @param network - CAIP-2 network identifier
   * @returns RPC client for the network
   */
  getRpcForNetwork(network: string): FacilitatorRpcClient;

  /**
   * Wait for transaction confirmation
   * Allows signer to implement custom retry logic, timeouts, and confirmation strategies
   *
   * @param signature - Transaction signature to confirm
   * @param network - CAIP-2 network identifier
   * @returns Promise that resolves when transaction is confirmed
   * @throws Error if confirmation fails or times out
   */
  confirmTransaction(signature: string, network: string): Promise<void>;
};

/**
 * Convert a signer to ClientSvmSigner (identity function for type safety)
 *
 * @param signer - The signer to convert
 * @returns The signer as ClientSvmSigner
 */
export function toClientSvmSigner(signer: ClientSvmSigner): ClientSvmSigner {
  return signer;
}

/**
 * Create RPC capabilities from a Solana Kit RPC client
 *
 * @param rpc - The RPC client from @solana/kit
 * @returns RPC capabilities for the facilitator
 */
export function createRpcCapabilitiesFromRpc(
  rpc: FacilitatorRpcClient,
): FacilitatorRpcCapabilities {
  return {
    getBalance: async address => {
      const result = await rpc.getBalance(address as never).send();
      return result.value;
    },
    getTokenAccountBalance: async address => {
      const accountInfo = await rpc
        .getAccountInfo(address as never, {
          encoding: "jsonParsed",
        })
        .send();

      if (!accountInfo.value) {
        throw new Error(`Token account not found: ${address}`);
      }

      const parsed = accountInfo.value.data as {
        parsed: { info: { tokenAmount: { amount: string } } };
      };
      return BigInt(parsed.parsed.info.tokenAmount.amount);
    },
    getLatestBlockhash: async () => {
      const result = await rpc.getLatestBlockhash().send();
      return {
        blockhash: result.value.blockhash,
        lastValidBlockHeight: result.value.lastValidBlockHeight,
      };
    },
    simulateTransaction: async (transaction, config) => {
      return await rpc.simulateTransaction(transaction as never, config as never).send();
    },
    sendTransaction: async transaction => {
      return await rpc
        .sendTransaction(transaction as never, {
          encoding: "base64",
        })
        .send();
    },
    confirmTransaction: async signature => {
      let confirmed = false;
      let attempts = 0;
      const maxAttempts = 30;

      while (!confirmed && attempts < maxAttempts) {
        const status = await rpc.getSignatureStatuses([signature as never]).send();

        if (
          status.value[0]?.confirmationStatus === "confirmed" ||
          status.value[0]?.confirmationStatus === "finalized"
        ) {
          confirmed = true;
          return status.value[0];
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }

      throw new Error("Transaction confirmation timeout");
    },
    fetchMint: async address => {
      const { fetchMint } = await import("@solana-program/token-2022");
      return await fetchMint(rpc, address as never);
    },
  };
}

/**
 * RPC configuration for the facilitator
 * Can be a single RPC (all networks), a network mapping, or config options
 */
export type FacilitatorRpcConfig =
  | FacilitatorRpcClient // Single RPC for all networks
  | Record<string, FacilitatorRpcClient> // Per-network RPC mapping
  | { defaultRpcUrl?: string }; // Custom default RPC URL

/**
 * Create a FacilitatorSvmSigner from a TransactionSigner and optional RPC config
 *
 * @param signer - The TransactionSigner (e.g., from createKeyPairSignerFromBytes)
 * @param rpcConfig - Optional RPC configuration (single RPC, per-network map, or config)
 * @returns A complete FacilitatorSvmSigner
 *
 * @example
 * ```ts
 * import { createKeyPairSignerFromBytes, createSolanaRpc, devnet } from "@solana/kit";
 *
 * // Option 1: No RPC - use defaults (SIMPLEST)
 * const keypair = await createKeyPairSignerFromBytes(privateKeyBytes);
 * const facilitator = toFacilitatorSvmSigner(keypair);
 *
 * // Option 2: Single RPC for all networks
 * const rpc = createSolanaRpc(devnet("https://api.devnet.solana.com"));
 * const facilitator = toFacilitatorSvmSigner(keypair, rpc);
 *
 * // Option 3: Per-network RPC (FLEXIBLE)
 * const facilitator = toFacilitatorSvmSigner(keypair, {
 *   [SOLANA_MAINNET_CAIP2]: myQuickNodeRpc,
 *   // Devnet/testnet use defaults
 * });
 *
 * // Option 4: Custom default RPC URL
 * const facilitator = toFacilitatorSvmSigner(keypair, {
 *   defaultRpcUrl: "https://my-rpc.com"
 * });
 * ```
 */
export function toFacilitatorSvmSigner(
  signer: TransactionSigner & MessagePartialSigner,
  rpcConfig?: FacilitatorRpcConfig,
): FacilitatorSvmSigner {
  let rpcMap: Record<string, FacilitatorRpcClient> = {};
  let defaultRpcUrl: string | undefined;

  if (rpcConfig) {
    // Check if it's a config object with defaultRpcUrl
    if ("defaultRpcUrl" in rpcConfig && typeof rpcConfig.defaultRpcUrl === "string") {
      defaultRpcUrl = rpcConfig.defaultRpcUrl;
    }
    // Check if it's a single RPC client
    else if ("getBalance" in rpcConfig || "getSlot" in rpcConfig) {
      rpcMap["*"] = rpcConfig as FacilitatorRpcClient;
    }
    // Otherwise, it's a network mapping
    else {
      rpcMap = rpcConfig as Record<string, FacilitatorRpcClient>;
    }
  }

  return {
    ...signer,
    getAddresses: () => {
      return [signer.address];
    },
    getSigner: (address: Address) => {
      if (address === signer.address) {
        return signer;
      }
      throw new Error(`No signer for address ${address}. Available: ${signer.address}`);
    },
    getRpcForNetwork: (network: string) => {
      // 1. Check for exact network match
      if (rpcMap[network]) {
        return rpcMap[network];
      }

      // 2. Check for wildcard RPC
      if (rpcMap["*"]) {
        return rpcMap["*"];
      }

      // 3. Create default RPC for this network
      return createRpcClient(network as `${string}:${string}`, defaultRpcUrl);
    },
    confirmTransaction: async (signature: string, network: string) => {
      const rpc =
        rpcMap[network] ||
        rpcMap["*"] ||
        createRpcClient(network as `${string}:${string}`, defaultRpcUrl);
      const rpcCapabilities = createRpcCapabilitiesFromRpc(rpc);
      await rpcCapabilities.confirmTransaction(signature);
    },
  } as FacilitatorSvmSigner;
}

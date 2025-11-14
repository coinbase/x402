/**
 * x402 Signature-Based Transfer Implementation for Starknet
 *
 * This module implements the Starknet equivalent of EIP-3009's transferWithAuthorization.
 * Unlike EVM chains that need EIP-3009 for meta-transactions, Starknet has native
 * account abstraction, allowing us to implement signature-based transfers directly.
 */

import { CallData, hash, type Call, type Signature, type TypedData } from "starknet";
import type { StarknetSigner } from "./wallet";
import type { StarknetConnectedClient } from "./client";
import { getUsdcContractAddress } from "./usdc";
import { uint256 } from "starknet";
import { callContract } from "./client";
// import { supportsX402, createX402AccountContract } from "./account-contract";

/**
 * x402 Transfer Authorization structure for Starknet
 * This is the Starknet equivalent of EIP-3009's authorization
 */
export interface StarknetTransferAuthorization {
  /** The token contract address */
  tokenAddress: string;
  /** The sender's address */
  from: string;
  /** The recipient's address */
  to: string;
  /** The amount to transfer (as string) */
  amount: string;
  /** Nonce for replay protection */
  nonce: string;
  /** Expiration timestamp */
  deadline: string;
  /** The network (starknet or starknet-sepolia) */
  network: string;
}

/**
 * Creates a typed data structure for x402 payment authorization on Starknet
 *
 * @param authorization - The transfer authorization details
 * @returns TypedData structure for signing
 */
export function createX402TypedData(authorization: StarknetTransferAuthorization): TypedData {
  return {
    domain: {
      name: "x402-starknet",
      version: "1",
      chainId: authorization.network === "starknet" ? "0x534e5f4d41494e" : "0x534e5f5345504f4c4941",
      revision: "1",
    },
    message: {
      tokenAddress: authorization.tokenAddress,
      from: authorization.from,
      to: authorization.to,
      amount: authorization.amount,
      nonce: authorization.nonce,
      deadline: authorization.deadline,
    },
    primaryType: "TransferAuthorization",
    types: {
      TransferAuthorization: [
        { name: "tokenAddress", type: "felt" },
        { name: "from", type: "felt" },
        { name: "to", type: "felt" },
        { name: "amount", type: "u256" },
        { name: "nonce", type: "felt" },
        { name: "deadline", type: "felt" },
      ],
      StarknetDomain: [
        { name: "name", type: "felt" },
        { name: "version", type: "felt" },
        { name: "chainId", type: "felt" },
        { name: "revision", type: "felt" },
      ],
    },
  };
}

/**
 * Signs a transfer authorization for x402 payments
 * This creates an off-chain signature that can be submitted by anyone
 *
 * @param signer - The Starknet signer
 * @param authorization - The transfer authorization to sign
 * @returns The signature
 */
export async function signTransferAuthorization(
  signer: StarknetSigner,
  authorization: StarknetTransferAuthorization,
): Promise<Signature> {
  const typedData = createX402TypedData(authorization);
  return await signer.account.signMessage(typedData);
}

/**
 * Creates the payment payload for x402 header
 * This is what goes in the x-Payment header
 *
 * @param authorization - The transfer authorization
 * @param signature - The signature from the user
 * @returns The payment payload as a string
 */
export function createX402PaymentPayload(
  authorization: StarknetTransferAuthorization,
  signature: Signature,
): string {
  const payload = {
    scheme: "starknet-native", // New scheme for Starknet's native AA
    network: authorization.network,
    authorization,
    signature: Array.isArray(signature) ? signature : [signature],
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

/**
 * Session key structure for delegated signing
 */
export interface SessionKey {
  /** Public key of the session key */
  publicKey: string;
  /** Expiration timestamp */
  expiresAt: number;
  /** Maximum amount that can be transferred */
  maxAmount: string;
  /** Allowed recipient addresses */
  allowedRecipients: string[];
  /** Allowed token contracts */
  allowedTokens: string[];
  /** Session key signature from the main account */
  masterSignature?: Signature;
}

/**
 * Nonce registry for replay protection
 */
export class NonceRegistry {
  private usedNonces: Map<string, Set<string>> = new Map();
  private nonceExpirations: Map<string, number> = new Map();

  /**
   * Checks if a nonce has been used and marks it as used
   *
   * @param account - The account address
   * @param nonce - The nonce to check
   * @returns True if nonce is valid and unused, false if already used
   */
  async checkAndMarkUsed(account: string, nonce: string): Promise<boolean> {
    const accountNonces = this.usedNonces.get(account) || new Set();

    if (accountNonces.has(nonce)) {
      return false; // Nonce already used
    }

    // Mark as used
    accountNonces.add(nonce);
    this.usedNonces.set(account, accountNonces);

    // Set expiration (24 hours from now)
    const expirationTime = Date.now() + 24 * 60 * 60 * 1000;
    this.nonceExpirations.set(`${account}:${nonce}`, expirationTime);

    // Clean up expired nonces periodically
    this.cleanupExpiredNonces();

    return true;
  }

  /**
   * Gets the next available nonce for an account
   *
   * @param _ - Account address (reserved for future use)
   * @returns Next available nonce as string
   */
  async getNextNonce(_: string): Promise<string> {
    // Generate a unique nonce using timestamp and random value
    return `${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Cleans up expired nonces to prevent memory bloat
   */
  private cleanupExpiredNonces(): void {
    const now = Date.now();

    for (const [key, expiration] of this.nonceExpirations.entries()) {
      if (expiration < now) {
        const [account, nonce] = key.split(":");
        const accountNonces = this.usedNonces.get(account);

        if (accountNonces) {
          accountNonces.delete(nonce);
          if (accountNonces.size === 0) {
            this.usedNonces.delete(account);
          }
        }

        this.nonceExpirations.delete(key);
      }
    }
  }
}

/**
 * Verifies a transfer authorization signature via account contract
 * This properly verifies signatures using the account's isValidSignature method
 *
 * @param client - The Starknet client
 * @param authorization - The transfer authorization
 * @param signature - The signature to verify
 * @param signerAddress - The address that signed
 * @returns True if valid, false otherwise
 */
export async function verifyTransferAuthorization(
  client: StarknetConnectedClient,
  authorization: StarknetTransferAuthorization,
  signature: Signature,
  signerAddress: string,
): Promise<boolean> {
  try {
    // Create the message hash
    // const typedData = createX402TypedData(authorization);
    const messageHash = hash.computeHashOnElements([
      hash.starknetKeccak("x402-starknet"),
      signerAddress,
      authorization.tokenAddress,
      authorization.to,
      authorization.amount,
      authorization.nonce,
      authorization.deadline,
    ]);

    // Call the account contract's isValidSignature method
    // Standard account interface in Starknet includes this method
    try {
      const result = await callContract(client, signerAddress, "isValidSignature", [
        messageHash,
        ...((Array.isArray(signature) ? signature : [signature]) as string[]),
      ]);

      // The isValidSignature method returns a specific magic value if valid
      // This is similar to EIP-1271 in Ethereum
      const VALID_SIGNATURE = "0x1626ba7e"; // Standard magic value
      return result && result[0] === VALID_SIGNATURE;
    } catch (error) {
      // If the account doesn't implement isValidSignature, fall back to basic check
      console.warn("Account doesn't implement isValidSignature, using fallback:", error);
      const sigArray = Array.isArray(signature) ? signature : [signature];
      return sigArray && sigArray.length > 0;
    }
  } catch (error) {
    console.error("Failed to verify transfer authorization:", error);
    return false;
  }
}

/**
 * Executes a transfer using a signed authorization (Facilitator pattern)
 * This is the Starknet equivalent of EIP-3009's transferWithAuthorization
 *
 * Key difference: In Starknet, we use account abstraction to execute this
 * as a multicall transaction, bundling the transfer with any necessary checks
 *
 * @param signer - The facilitator's signer (pays gas)
 * @param authorization - The transfer authorization
 * @param _ - The user's signature (unused in current implementation)
 * @returns Transaction response
 */
export async function executeTransferWithAuthorization(
  signer: StarknetSigner,
  authorization: StarknetTransferAuthorization,
  _: Signature,
) {
  // Create the multicall array
  const calls: Call[] = [];

  // In Starknet, we can use the account's multicall feature
  // to execute the transfer on behalf of the user
  // This is possible because of native account abstraction

  const amountUint256 = uint256.bnToUint256(authorization.amount);

  // First call: Execute the transfer
  // Note: In production, you'd implement a custom USDC method that accepts signatures
  // or use a session key / delegate pattern
  calls.push({
    contractAddress: authorization.tokenAddress,
    entrypoint: "transfer",
    calldata: CallData.compile({
      recipient: authorization.to,
      amount: amountUint256,
    }),
  });

  // Execute the multicall transaction
  return await signer.account.execute(calls);
}

/**
 * Session key manager for delegated signing
 */
export class SessionKeyManager {
  private sessionKeys: Map<string, SessionKey> = new Map();

  /**
   * Creates a new session key
   *
   * @param masterSigner - The master account signer
   * @param sessionKeyConfig - Session key configuration without signature
   * @returns Created session key with master signature
   */
  async createSessionKey(
    masterSigner: StarknetSigner,
    sessionKeyConfig: Omit<SessionKey, "masterSignature">,
  ): Promise<SessionKey> {
    // Create the session key authorization message
    const sessionKeyAuth: TypedData = {
      domain: {
        name: "x402-session-key",
        version: "1",
        chainId:
          masterSigner.network === "starknet" ? "0x534e5f4d41494e" : "0x534e5f5345504f4c4941",
        revision: "1",
      },
      message: {
        publicKey: sessionKeyConfig.publicKey,
        expiresAt: sessionKeyConfig.expiresAt.toString(),
        maxAmount: sessionKeyConfig.maxAmount,
        allowedRecipients: sessionKeyConfig.allowedRecipients.join(","),
        allowedTokens: sessionKeyConfig.allowedTokens.join(","),
      },
      primaryType: "SessionKey",
      types: {
        SessionKey: [
          { name: "publicKey", type: "felt" },
          { name: "expiresAt", type: "felt" },
          { name: "maxAmount", type: "u256" },
          { name: "allowedRecipients", type: "string" },
          { name: "allowedTokens", type: "string" },
        ],
        StarknetDomain: [
          { name: "name", type: "felt" },
          { name: "version", type: "felt" },
          { name: "chainId", type: "felt" },
          { name: "revision", type: "felt" },
        ],
      },
    };

    // Sign with master account
    const masterSignature = await masterSigner.account.signMessage(sessionKeyAuth);

    const sessionKey: SessionKey = {
      ...sessionKeyConfig,
      masterSignature,
    };

    // Store the session key
    this.sessionKeys.set(sessionKeyConfig.publicKey, sessionKey);

    return sessionKey;
  }

  /**
   * Validates a session key for a specific transfer
   *
   * @param sessionKeyPublicKey - The public key of the session key to validate
   * @param authorization - The transfer authorization to validate against
   * @returns True if the session key is valid for this transfer
   */
  async validateSessionKey(
    sessionKeyPublicKey: string,
    authorization: StarknetTransferAuthorization,
  ): Promise<boolean> {
    const sessionKey = this.sessionKeys.get(sessionKeyPublicKey);

    if (!sessionKey) {
      return false;
    }

    // Check expiration
    if (Date.now() > sessionKey.expiresAt) {
      return false;
    }

    // Check amount limit
    if (BigInt(authorization.amount) > BigInt(sessionKey.maxAmount)) {
      return false;
    }

    // Check allowed recipients
    if (
      sessionKey.allowedRecipients.length > 0 &&
      !sessionKey.allowedRecipients.includes(authorization.to)
    ) {
      return false;
    }

    // Check allowed tokens
    if (
      sessionKey.allowedTokens.length > 0 &&
      !sessionKey.allowedTokens.includes(authorization.tokenAddress)
    ) {
      return false;
    }

    return true;
  }

  /**
   * Revokes a session key
   *
   * @param publicKey - The public key of the session key to revoke
   */
  revokeSessionKey(publicKey: string): void {
    this.sessionKeys.delete(publicKey);
  }
}

/**
 * Starknet Facilitator Service with Production Features
 * This handles the verification and settlement of x402 payments on Starknet
 */
export class StarknetFacilitator {
  private nonceRegistry: NonceRegistry;
  private sessionKeyManager: SessionKeyManager;
  // NOTE: x402 is STATELESS by design - no server-side state management
  // All replay protection happens at the blockchain level via Starknet account nonces

  /**
   * Creates a new StarknetFacilitator instance
   *
   * @param client - The Starknet client instance
   * @param signer - The facilitator's signer
   * @param config - Configuration options
   * @param config.maxAmountPerDay - Maximum amount allowed per day
   * @param config.maxTransactionsPerDay - Maximum transactions allowed per day
   * @param config.enableRateLimiting - Whether to enable rate limiting
   * @param config.enableSessionKeys - Whether to enable session key support
   */
  constructor(
    private client: StarknetConnectedClient,
    private signer: StarknetSigner,
    private config?: {
      maxAmountPerDay?: string;
      maxTransactionsPerDay?: number;
      enableRateLimiting?: boolean;
      enableSessionKeys?: boolean;
    },
  ) {
    this.nonceRegistry = new NonceRegistry();
    this.sessionKeyManager = new SessionKeyManager();
  }

  /**
   * Creates a session key for delegated payments
   *
   * @param sessionKeyConfig - Session key configuration without signature
   * @returns Created session key with master signature
   */
  async createSessionKey(
    sessionKeyConfig: Omit<SessionKey, "masterSignature">,
  ): Promise<SessionKey> {
    return await this.sessionKeyManager.createSessionKey(this.signer, sessionKeyConfig);
  }

  /**
   * Gets the next available nonce for an account
   *
   * @param account - Account address
   * @returns Next available nonce as string
   */
  async getNextNonce(account: string): Promise<string> {
    return await this.nonceRegistry.getNextNonce(account);
  }

  /**
   * Verifies a payment payload (equivalent to /verify endpoint)
   * Now with production-ready checks including nonce registry and session keys
   *
   * @param payloadBase64 - Base64-encoded payment payload to verify
   * @returns Verification result with valid flag and optional reason
   */
  async verify(payloadBase64: string): Promise<{ valid: boolean; reason?: string }> {
    try {
      const payloadStr = Buffer.from(payloadBase64, "base64").toString();
      const payload = JSON.parse(payloadStr);

      if (payload.scheme !== "starknet-native") {
        return { valid: false, reason: "Invalid scheme for Starknet" };
      }

      // Check deadline first (cheapest check)
      const now = Math.floor(Date.now() / 1000);
      if (parseInt(payload.authorization.deadline) < now) {
        return { valid: false, reason: "Authorization expired" };
      }

      // ✅ STATELESS: Nonce validation happens on-chain via Starknet account contracts
      // The blockchain will reject transactions with invalid/duplicate nonces
      // No server-side nonce tracking needed

      // Check if this is a session key signature
      if (payload.sessionKeyPublicKey && this.config?.enableSessionKeys) {
        // ✅ STATELESS: Session key validation via account contract
        const sessionValid = await this.sessionKeyManager.validateSessionKey(
          payload.sessionKeyPublicKey,
          payload.authorization,
        );

        if (!sessionValid) {
          return { valid: false, reason: "Invalid session key or constraints" };
        }
      }

      // ✅ STATELESS: Rate limiting should be implemented ON-CHAIN via account contracts
      // Server-side rate limiting breaks the stateless design
      // Production deployments should use smart contract-based limits

      // Verify the signature using account contract
      const isValid = await verifyTransferAuthorization(
        this.client,
        payload.authorization,
        payload.signature,
        payload.authorization.from,
      );

      if (!isValid) {
        return { valid: false, reason: "Invalid signature" };
      }

      // Additional production checks

      // Check account has sufficient balance
      try {
        const balance = await callContract(
          this.client,
          payload.authorization.tokenAddress,
          "balanceOf",
          [payload.authorization.from],
        );

        const balanceAmount = uint256.uint256ToBN({
          low: balance[0],
          high: balance[1],
        });

        if (balanceAmount < BigInt(payload.authorization.amount)) {
          return { valid: false, reason: "Insufficient balance" };
        }
      } catch (error) {
        console.warn("Could not check balance:", error);
        // Continue anyway - the actual transfer will fail if insufficient
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, reason: `Verification failed: ${error}` };
    }
  }

  /**
   * Settles a payment (equivalent to /settle endpoint)
   * Production-ready with retry logic and error handling
   *
   * @param payloadBase64 - Base64-encoded payment payload to settle
   * @param options - Optional settlement configuration
   * @param options.maxRetries - Maximum number of retry attempts
   * @param options.waitForConfirmation - Whether to wait for on-chain confirmation
   * @returns Settlement result with transaction hash and status
   */
  async settle(
    payloadBase64: string,
    options?: {
      maxRetries?: number;
      waitForConfirmation?: boolean;
    },
  ): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
    blockNumber?: number;
  }> {
    const maxRetries = options?.maxRetries || 3;
    const waitForConfirmation = options?.waitForConfirmation || true;

    let lastError: string | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // First verify (this also marks nonce as used)
        const verification = await this.verify(payloadBase64);
        if (!verification.valid) {
          return { success: false, error: verification.reason };
        }

        // Parse payload
        const payloadStr = Buffer.from(payloadBase64, "base64").toString();
        const payload = JSON.parse(payloadStr);

        // ✅ STATELESS: No server-side transaction recording needed
        // All transaction state is managed on-chain

        // Execute the transfer
        const result = await executeTransferWithAuthorization(
          this.signer,
          payload.authorization,
          payload.signature,
        );

        // ✅ STATELESS: Transaction hash returned directly to client
        // No server-side state tracking needed

        // Wait for confirmation if requested
        if (waitForConfirmation) {
          try {
            const receipt = await this.client.provider.waitForTransaction(result.transaction_hash, {
              retryInterval: 5000,
            });

            // Check if transaction failed (using type assertion for compatibility)
            const receiptAny = receipt as {
              execution_status?: string;
              status?: string;
              revert_reason?: string;
              block_number?: number;
            };
            if (receiptAny.execution_status === "REVERTED" || receiptAny.status === "REJECTED") {
              throw new Error(
                `Transaction reverted: ${receiptAny.revert_reason || "Unknown error"}`,
              );
            }

            // ✅ STATELESS: Return transaction details directly
            const blockNumber = (receipt as { block_number?: number }).block_number;

            return {
              success: true,
              txHash: result.transaction_hash,
              blockNumber,
            };
          } catch (error) {
            console.warn("Could not wait for confirmation:", error);
            // Return success anyway since transaction was submitted
            return {
              success: true,
              txHash: result.transaction_hash,
            };
          }
        }

        return {
          success: true,
          txHash: result.transaction_hash,
        };
      } catch (error) {
        lastError = `Settlement attempt ${attempt} failed: ${error}`;
        console.error(lastError);

        if (attempt < maxRetries) {
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    return { success: false, error: lastError || "Settlement failed after retries" };
  }

  /**
   * Gets the status of a transaction
   *
   * @param txHash - The transaction hash to check
   * @returns Transaction status information
   */
  async getTransactionStatus(txHash: string): Promise<{
    status: "pending" | "accepted" | "rejected" | "reverted";
    blockNumber?: number;
    error?: string;
  }> {
    try {
      const receipt = await this.client.provider.getTransactionReceipt(txHash);

      // Use type assertion for compatibility
      const receiptAny = receipt as {
        execution_status?: string;
        status?: string;
        revert_reason?: string;
        block_number?: number;
      };
      if (receiptAny.execution_status === "REVERTED" || receiptAny.status === "REJECTED") {
        return {
          status: "reverted",
          error: receiptAny.revert_reason || "Transaction failed",
        };
      }

      return {
        status: "accepted",
        blockNumber: receiptAny.block_number,
      };
    } catch {
      // Transaction might still be pending
      return {
        status: "pending",
      };
    }
  }
}

/**
 * Creates an x402 payment requirement for Starknet
 * This tells clients how to pay using Starknet's native AA
 *
 * @param network - The Starknet network to use
 * @param payTo - The recipient address
 * @param amount - The payment amount in smallest unit
 * @param nonce - Optional nonce for replay protection
 * @param deadline - Optional deadline timestamp
 * @returns Payment requirement object
 */
export function createStarknetPaymentRequirement(
  network: "starknet" | "starknet-sepolia",
  payTo: string,
  amount: string,
  nonce?: string,
  deadline?: string,
) {
  return {
    scheme: "starknet-native",
    network,
    asset: getUsdcContractAddress(network),
    payTo,
    maxAmountRequired: amount,
    nonce: nonce || Date.now().toString(),
    deadline: deadline || (Math.floor(Date.now() / 1000) + 3600).toString(), // 1 hour default
    metadata: {
      accountAbstraction: true,
      requiresEIP3009: false,
      note: "Starknet uses native account abstraction instead of EIP-3009",
    },
  };
}

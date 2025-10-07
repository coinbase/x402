/**
 * Starknet Payment Provider for x402 Protocol
 *
 * This module provides the payment provider implementation for Starknet
 * that handles verification and settlement of x402 payments.
 */

import { hash } from "starknet";
import type { StarknetSigner } from "./wallet";
import type { StarknetConnectedClient } from "./client";
import { getAccountNonce } from "./client";
import {
  verifyTransferAuthorization,
  executeTransferWithAuthorization,
  type StarknetTransferAuthorization,
} from "./x402-transfers";
import { globalStateManager } from "./state-manager";
import { X402RateLimiter } from "./account-contract";

/**
 * Error class for payment verification failures
 */
export class PaymentVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentVerificationError";
  }
}

/**
 * Error class for payment settlement failures
 */
export class PaymentSettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentSettlementError";
  }
}

/**
 * Starknet Payment Provider
 *
 * Handles verification and settlement of x402 payments on Starknet
 */
export class StarknetPaymentProvider {
  private rateLimiter?: X402RateLimiter;

  constructor(
    private client: StarknetConnectedClient,
    private facilitatorSigner: StarknetSigner,
    private config?: {
      maxAmountPerDay?: string;
      maxTransactionsPerDay?: number;
      enableRateLimiting?: boolean;
      enableSessionKeys?: boolean;
    },
  ) {
    if (config?.enableRateLimiting) {
      this.rateLimiter = new X402RateLimiter();
    }
  }

  /**
   * Verify a payment authorization
   *
   * @param payloadBase64 - Base64 encoded payment payload
   * @returns Verification result
   */
  async verify(payloadBase64: string): Promise<{
    valid: boolean;
    reason?: string;
    payer?: string;
    amount?: string;
    recipient?: string;
  }> {
    try {
      // Parse the payload
      const payloadStr = Buffer.from(payloadBase64, "base64").toString();
      const payload = JSON.parse(payloadStr);

      // Check scheme
      if (payload.scheme !== "exact") {
        return {
          valid: false,
          reason: "scheme_mismatch",
        };
      }

      // Check network
      const expectedNetwork = this.client.chainId === "0x534e5f4d41494e" ? "starknet" : "starknet-sepolia";
      if (payload.network !== expectedNetwork) {
        return {
          valid: false,
          reason: "network_mismatch",
        };
      }

      // Extract authorization and signature from exact scheme payload
      const authorization: StarknetTransferAuthorization = {
        tokenAddress: "", // Will be set from requirements or defaults
        from: payload.payload.authorization.from,
        to: payload.payload.authorization.to,
        amount: payload.payload.authorization.value,
        nonce: payload.payload.authorization.nonce,
        deadline: payload.payload.authorization.validBefore,
        network: payload.network,
      };
      const signature = payload.payload.signature;

      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      if (parseInt(authorization.deadline) < now) {
        return {
          valid: false,
          reason: "authorization_expired",
        };
      }

      // Verify signature
      const isValidSig = await verifyTransferAuthorization(
        this.client,
        authorization,
        signature,
        authorization.from,
      );

      if (!isValidSig) {
        return {
          valid: false,
          reason: "invalid_signature",
        };
      }

      // Check nonce
      const nonceKey = `${authorization.from}:${authorization.nonce}`;
      const nonceState = globalStateManager.getState<{ used: boolean }>(nonceKey);
      if (nonceState?.used) {
        return {
          valid: false,
          reason: "nonce_already_used",
        };
      }
      globalStateManager.setState(nonceKey, { used: true });

      // Check rate limiting
      if (this.rateLimiter && this.config?.maxAmountPerDay && this.config?.maxTransactionsPerDay) {
        const rateLimitResult = await this.rateLimiter.checkRateLimit(
          authorization.from,
          authorization.tokenAddress,
          authorization.amount,
          this.config.maxAmountPerDay,
          this.config.maxTransactionsPerDay,
        );

        if (!rateLimitResult.allowed) {
          return {
            valid: false,
            reason: `rate_limit_exceeded: ${rateLimitResult.reason}`,
          };
        }
      }

      return {
        valid: true,
        payer: authorization.from,
        amount: authorization.amount,
        recipient: authorization.to,
      };
    } catch (error) {
      console.error("Verification error:", error);
      return {
        valid: false,
        reason: "Invalid payload format",
      };
    }
  }

  /**
   * Settle a verified payment
   *
   * @param payloadBase64 - Base64 encoded payment payload
   * @param options - Settlement options
   * @returns Settlement result
   */
  async settle(
    payloadBase64: string,
    options?: {
      waitForConfirmation?: boolean;
      maxRetries?: number;
    },
  ): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
    payer?: string;
    amount?: string;
    recipient?: string;
  }> {
    try {
      // First verify the payment
      const verifyResult = await this.verify(payloadBase64);
      if (!verifyResult.valid) {
        return {
          success: false,
          error: `Payment verification failed: ${verifyResult.reason}`,
        };
      }

      // Parse payload
      const payloadStr = Buffer.from(payloadBase64, "base64").toString();
      const payload = JSON.parse(payloadStr);

      // Extract authorization from exact scheme payload
      const authorization: StarknetTransferAuthorization = {
        tokenAddress: "", // Will be set from requirements or defaults
        from: payload.payload.authorization.from,
        to: payload.payload.authorization.to,
        amount: payload.payload.authorization.value,
        nonce: payload.payload.authorization.nonce,
        deadline: payload.payload.authorization.validBefore,
        network: payload.network,
      };

      // Execute the transfer
      let retries = 0;
      const maxRetries = options?.maxRetries || 1;

      while (retries < maxRetries) {
        try {
          const result = await executeTransferWithAuthorization(
            this.facilitatorSigner,
            authorization,
            payload.payload.signature,
          );

          // Wait for confirmation if requested
          if (options?.waitForConfirmation) {
            await this.waitForTransaction(result.transaction_hash);
          }

          return {
            success: true,
            txHash: result.transaction_hash,
            payer: verifyResult.payer,
            amount: verifyResult.amount,
            recipient: verifyResult.recipient,
          };
        } catch (error) {
          retries++;
          if (retries >= maxRetries) {
            throw error;
          }
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        }
      }

      throw new Error("Max retries exceeded");
    } catch (error) {
      console.error("Settlement error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Settlement failed",
      };
    }
  }

  /**
   * Get transaction status
   *
   * @param txHash - Transaction hash
   * @returns Transaction status
   */
  async getTransactionStatus(txHash: string) {
    try {
      const receipt = await this.client.provider.getTransactionReceipt(txHash);
      return receipt;
    } catch (error) {
      return {
        status: "NOT_FOUND",
        error: error instanceof Error ? error.message : "Transaction not found",
      };
    }
  }

  /**
   * Create a session key for delegated payments
   *
   * @param config - Session key configuration
   * @returns Session key details
   */
  async createSessionKey(config: {
    publicKey?: string;
    expiresAt: number;
    maxAmountPerTx: string;
    maxTotalAmount?: string;
    allowedRecipients?: string[];
    allowedTokens?: string[];
  }) {
    // Generate a new key pair if not provided
    const publicKey = config.publicKey || hash.computeHashOnElements([Math.random()]);

    const sessionKey = {
      sessionKey: hash.computeHashOnElements([
        publicKey,
        config.expiresAt,
        config.maxAmountPerTx,
      ]),
      publicKey,
      expiresAt: config.expiresAt,
      maxAmountPerTx: config.maxAmountPerTx,
      maxTotalAmount: config.maxTotalAmount,
      allowedRecipients: config.allowedRecipients,
      allowedTokens: config.allowedTokens,
    };

    // Store session key in state
    globalStateManager.setState(`session:${sessionKey.sessionKey}`, sessionKey);

    return sessionKey;
  }

  /**
   * Get next nonce for an account
   *
   * @param account - Account address
   * @returns Next nonce as string
   */
  async getNextNonce(account: string): Promise<string> {
    const nonce = await getAccountNonce(this.client, account);
    return String(nonce + 1n);
  }

  /**
   * Wait for transaction confirmation
   *
   * @param txHash - Transaction hash
   * @param timeout - Timeout in milliseconds
   */
  private async waitForTransaction(txHash: string, timeout = 60000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const receipt = await this.client.provider.getTransactionReceipt(txHash);
        if (receipt && (receipt as any).status === "ACCEPTED_ON_L2") {
          return;
        }
      } catch {
        // Transaction not found yet
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error("Transaction confirmation timeout");
  }
}

/**
 * Create a payment header from an authorization
 *
 * @param authorization - Transfer authorization
 * @param signature - Signature
 * @param network - Network
 * @param sessionKeyPublicKey - Optional session key
 * @returns Payment header string
 */
export function createPaymentHeader(
  authorization: StarknetTransferAuthorization,
  signature: string | string[],
  network: "starknet" | "starknet-sepolia",
  x402Version = 1,
  sessionKeyPublicKey?: string,
): string {
  const payload = {
    x402Version,
    scheme: "exact",
    network,
    payload: {
      signature: Array.isArray(signature) ? signature.join(",") : String(signature),
      authorization: {
        from: authorization.from,
        to: authorization.to,
        value: authorization.amount,
        validAfter: "0",
        validBefore: authorization.deadline,
        nonce: authorization.nonce,
      },
    },
  };

  const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64");
  return `x402 ${base64Payload}`;
}
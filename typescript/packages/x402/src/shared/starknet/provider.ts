/**
 * Starknet Payment Provider for x402 Protocol
 *
 * This module provides the payment provider implementation for Starknet
 * that handles verification and settlement of x402 payments.
 */

import type { StarknetSigner } from "./wallet";
import type { StarknetConnectedClient } from "./client";
import {
  verifyTransferAuthorization,
  executeTransferWithAuthorization,
  type StarknetTransferAuthorization,
} from "./x402-transfers";

/**
 * Error class for payment verification failures
 */
export class PaymentVerificationError extends Error {
  /**
   * Creates an error instance for payment verification failures
   *
   * @param message - The error message describing what went wrong
   */
  constructor(message: string) {
    super(message);
    this.name = "PaymentVerificationError";
  }
}

/**
 * Error class for payment settlement failures
 */
export class PaymentSettlementError extends Error {
  /**
   * Creates an error instance for payment settlement failures
   *
   * @param message - The error message describing what went wrong
   */
  constructor(message: string) {
    super(message);
    this.name = "PaymentSettlementError";
  }
}

/**
 * Starknet Payment Provider
 *
 * Handles verification and settlement of x402 payments on Starknet.
 * This implementation is STATELESS by design - all replay protection
 * happens at the blockchain level via Starknet account nonces.
 */
export class StarknetPaymentProvider {
  /**
   * Creates a new Starknet payment provider instance
   *
   * @param client - Connected Starknet client for blockchain interactions
   * @param facilitatorSigner - Signer instance for facilitator operations
   */
  constructor(
    private client: StarknetConnectedClient,
    private facilitatorSigner: StarknetSigner,
  ) {}

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
      const expectedNetwork =
        this.client.chainId === "0x534e5f4d41494e" ? "starknet" : "starknet-sepolia";
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

      // ✅ STATELESS: No nonce checking at application level
      // Nonce validation happens on-chain via Starknet account contracts
      // The blockchain will reject transactions with invalid/duplicate nonces

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
   * @param options.waitForConfirmation - Whether to wait for transaction confirmation
   * @param options.maxRetries - Maximum number of retry attempts
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
   * NOTE: Session keys should be managed ON-CHAIN via Starknet account contracts.
   * This method has been removed to maintain stateless architecture.
   * Implement session keys in your Starknet account contract instead.
   */

  // ❌ REMOVED: getNextNonce violated x402 stateless design
  // x402 spec requires random 32-byte nonces, not blockchain nonces
  // Use generateX402Nonce() for x402-compliant nonces

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
        if (
          receipt &&
          "status" in receipt &&
          (receipt as { status: string }).status === "ACCEPTED_ON_L2"
        ) {
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
 * @param x402Version - Protocol version
 * @returns Payment header string
 */
export function createPaymentHeader(
  authorization: StarknetTransferAuthorization,
  signature: string | string[],
  network: "starknet" | "starknet-sepolia",
  x402Version = 1,
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

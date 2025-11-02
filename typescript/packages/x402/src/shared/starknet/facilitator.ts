/**
 * Starknet Facilitator Implementation for x402 Protocol
 *
 * This module provides the facilitator interface compatibility layer that bridges
 * the Starknet-specific implementation with the standard x402 facilitator interface.
 * It extends the existing StarknetPaymentProvider with additional x402-compliant methods.
 *
 * STATELESS DESIGN: This facilitator does NOT maintain any server-side state.
 * All replay protection happens at the blockchain level via Starknet account nonces.
 */

import type {
  VerifyRequest,
  VerifyResponse,
  SettleRequest,
  SettleResponse,
  PaymentRequirements,
} from "../../types/verify";
import type { StarknetSigner } from "./wallet";
import type { StarknetConnectedClient } from "./client";
import {
  StarknetPaymentProvider,
  PaymentVerificationError,
  PaymentSettlementError,
} from "./provider";
import { createStarknetConnectedClient } from "./client";

/**
 * x402-compliant Starknet Facilitator
 *
 * This class extends the base StarknetPaymentProvider to provide the standard
 * x402 facilitator interface (/verify and /settle endpoints functionality).
 *
 * STATELESS: This facilitator can be horizontally scaled without any coordination
 * between instances. All state is managed on-chain.
 */
export class X402StarknetFacilitator {
  private starknetFacilitator: StarknetPaymentProvider;
  private client: StarknetConnectedClient;

  /**
   * Creates a new X402StarknetFacilitator instance
   *
   * @param network - The Starknet network to use
   * @param facilitatorSigner - The facilitator's signer
   */
  constructor(
    network: "starknet" | "starknet-sepolia",
    facilitatorSigner: StarknetSigner,
  ) {
    this.client = createStarknetConnectedClient(network);
    this.starknetFacilitator = new StarknetPaymentProvider(this.client, facilitatorSigner);
  }

  /**
   * Verify endpoint implementation - validates a payment payload
   *
   * @param request - The verify request containing payment payload and requirements
   * @returns Promise resolving to verification response
   */
  async verify(request: VerifyRequest): Promise<VerifyResponse> {
    try {
      // Validate the payment payload scheme
      if (request.paymentPayload.scheme !== "exact") {
        return {
          isValid: false,
          invalidReason: "unsupported_scheme",
        };
      }

      // Validate network compatibility
      if (!this.isStarknetNetwork(request.paymentPayload.network)) {
        return {
          isValid: false,
          invalidReason: "invalid_network",
        };
      }

      // Encode the payload for verification
      const payloadBase64 = this.encodePaymentPayload(request.paymentPayload);

      // Use the Starknet facilitator to verify
      const result = await this.starknetFacilitator.verify(payloadBase64);

      if (!result.valid) {
        return {
          isValid: false,
          invalidReason: this.mapErrorReason(result.reason || "verification_failed") as any,
        };
      }

      // Extract payer address from the payload
      const payer = this.extractPayerFromPayload(request.paymentPayload);

      return {
        isValid: true,
        payer,
      };
    } catch (error) {
      console.error("Verification error:", error);

      if (error instanceof PaymentVerificationError) {
        return {
          isValid: false,
          invalidReason: "invalid_payment",
        };
      }

      return {
        isValid: false,
        invalidReason: "unexpected_verify_error",
      };
    }
  }

  /**
   * Settle endpoint implementation - executes a verified payment
   *
   * @param request - The settle request containing payment payload and requirements
   * @returns Promise resolving to settlement response
   */
  async settle(request: SettleRequest): Promise<SettleResponse> {
    try {
      // First verify the payment is still valid
      const verificationResult = await this.verify(request);

      if (!verificationResult.isValid) {
        return {
          success: false,
          errorReason: verificationResult.invalidReason,
          network: request.paymentPayload.network,
          transaction: "",
        };
      }

      // Encode the payload for settlement
      const payloadBase64 = this.encodePaymentPayload(request.paymentPayload);

      // Use the Starknet facilitator to settle
      const result = await this.starknetFacilitator.settle(payloadBase64, {
        waitForConfirmation: true,
        maxRetries: 3,
      });

      if (!result.success) {
        return {
          success: false,
          errorReason: this.mapErrorReason(result.error || "settlement_failed") as any,
          network: request.paymentPayload.network,
          transaction: "",
        };
      }

      return {
        success: true,
        payer: verificationResult.payer,
        transaction: result.txHash || "",
        network: request.paymentPayload.network,
      };
    } catch (error) {
      console.error("Settlement error:", error);

      if (error instanceof PaymentSettlementError) {
        return {
          success: false,
          errorReason: "unexpected_settle_error",
          network: request.paymentPayload.network,
          transaction: "",
        };
      }

      return {
        success: false,
        errorReason: "unexpected_settle_error",
        network: request.paymentPayload.network,
        transaction: "",
      };
    }
  }

  /**
   * Gets the status of a transaction
   *
   * @param txHash - Transaction hash to check
   * @returns Transaction status
   */
  async getTransactionStatus(txHash: string) {
    return await this.starknetFacilitator.getTransactionStatus(txHash);
  }

  /**
   * NOTE: Session keys should be managed ON-CHAIN.
   * This method has been removed to maintain stateless architecture.
   */

  /**
   * Gets the next nonce for an account
   *
   * @param account - Account address
   * @returns Next available nonce as string
   */
  async getNextNonce(account: string): Promise<string> {
    return await this.starknetFacilitator.getNextNonce(account);
  }

  /**
   * Helper method to encode payment payload to base64
   *
   * @param payload - Payment payload object
   * @returns Base64 encoded payload string
   */
  private encodePaymentPayload(payload: any): string {
    const starknetPayload = {
      scheme: "starknet-native",
      network: payload.network,
      authorization: payload.payload?.authorization || payload.authorization,
      signature: payload.payload?.signature || payload.signature,
      sessionKeyPublicKey: payload.payload?.sessionKeyPublicKey || payload.sessionKeyPublicKey,
    };

    return Buffer.from(JSON.stringify(starknetPayload)).toString("base64");
  }

  /**
   * Helper method to extract payer address from payload
   *
   * @param payload - Payment payload object
   * @returns Payer address or undefined
   */
  private extractPayerFromPayload(payload: any): string | undefined {
    return payload.payload?.authorization?.from || payload.authorization?.from;
  }

  /**
   * Helper method to check if network is Starknet
   *
   * @param network - Network name to check
   * @returns True if network is Starknet
   */
  private isStarknetNetwork(network: string): boolean {
    return network === "starknet" || network === "starknet-sepolia";
  }

  /**
   * Maps internal error reasons to x402 standard error reasons
   *
   * @param reason - Internal error reason
   * @returns Mapped error string
   */
  private mapErrorReason(reason: string): string {
    const errorMap: Record<string, string> = {
      verification_failed: "invalid_payment",
      settlement_failed: "unexpected_settle_error",
      invalid_signature: "invalid_payment",
      insufficient_balance: "insufficient_funds",
      nonce_already_used: "invalid_transaction_state",
      authorization_expired: "payment_expired",
      session_key_expired: "invalid_payment",
      rate_limit_exceeded: "invalid_transaction_state",
      recipient_mismatch: "invalid_payment",
      amount_mismatch: "invalid_payment",
      network_mismatch: "invalid_network",
      scheme_mismatch: "unsupported_scheme",
    };

    return errorMap[reason] || "unexpected_verify_error";
  }
}

/**
 * Express.js middleware factory for Starknet facilitator endpoints
 * This creates the standard /verify and /settle REST endpoints
 *
 * @param facilitator - X402StarknetFacilitator instance
 * @returns Object with middleware handlers
 */
export function createStarknetFacilitatorMiddleware(facilitator: X402StarknetFacilitator) {
  return {
    /**
     * POST /verify endpoint handler
     *
     * @param req - Express request object
     * @param res - Express response object
     * @param _ - Express next function (unused)
     * @returns Promise that resolves when response is sent
     */
    verify: async (req: any, res: any, _: any) => {
      try {
        const verifyRequest = req.body;
        const result = await facilitator.verify(verifyRequest);
        res.json(result);
      } catch (error) {
        console.error("Verify endpoint error:", error);
        res.status(500).json({
          isValid: false,
          invalidReason: "unexpected_verify_error",
        });
      }
    },

    /**
     * POST /settle endpoint handler
     *
     * @param req - Express request object
     * @param res - Express response object
     * @param _ - Express next function (unused)
     * @returns Promise that resolves when response is sent
     */
    settle: async (req: any, res: any, _: any) => {
      try {
        const settleRequest = req.body;
        const result = await facilitator.settle(settleRequest);
        res.json(result);
      } catch (error) {
        console.error("Settle endpoint error:", error);
        res.status(500).json({
          success: false,
          errorReason: "unexpected_settle_error",
          network: req.body?.paymentPayload?.network || "unknown",
          transaction: "",
        });
      }
    },

    /**
     * GET /status/:txHash endpoint handler
     *
     * @param req - Express request object
     * @param res - Express response object
     * @param _ - Express next function (unused)
     * @returns Promise that resolves when response is sent
     */
    status: async (req: any, res: any, _: any) => {
      try {
        const { txHash } = req.params;
        const result = await facilitator.getTransactionStatus(txHash);
        res.json(result);
      } catch (error) {
        console.error("Status endpoint error:", error);
        res.status(500).json({
          error: "Failed to get transaction status",
        });
      }
    },

    /**
     * NOTE: Session key endpoint removed - manage session keys on-chain
     */

    /**
     * GET /nonce/:account endpoint handler
     *
     * @param req - Express request object
     * @param res - Express response object
     * @param _ - Express next function (unused)
     * @returns Promise that resolves when response is sent
     */
    nonce: async (req: any, res: any, _: any) => {
      try {
        const { account } = req.params;
        const nonce = await facilitator.getNextNonce(account);
        res.json({ nonce });
      } catch (error) {
        console.error("Nonce endpoint error:", error);
        res.status(500).json({
          error: "Failed to get nonce",
        });
      }
    },
  };
}

/**
 * Factory function to create an x402-compliant Starknet facilitator
 *
 * @param network - The Starknet network to use
 * @param facilitatorSigner - The facilitator's signer
 * @returns X402StarknetFacilitator instance
 */
export function createStarknetFacilitator(
  network: "starknet" | "starknet-sepolia",
  facilitatorSigner: StarknetSigner,
): X402StarknetFacilitator {
  return new X402StarknetFacilitator(network, facilitatorSigner);
}

/**
 * Utility function to validate Starknet payment requirements
 *
 * @param requirements - Payment requirements to validate
 * @returns True if requirements are valid
 */
export function validateStarknetPaymentRequirements(requirements: any): boolean {
  if (!requirements) return false;
  if (requirements.scheme !== "exact") return false;
  if (!["starknet", "starknet-sepolia"].includes(requirements.network)) return false;
  if (!requirements.payTo || typeof requirements.payTo !== "string") return false;
  if (!requirements.asset || typeof requirements.asset !== "string") return false;
  if (!requirements.maxAmountRequired || typeof requirements.maxAmountRequired !== "string")
    return false;

  return true;
}

/**
 * Utility function to create standard payment requirements for Starknet
 *
 * @param network - The Starknet network
 * @param payTo - Recipient address
 * @param amount - Payment amount
 * @param asset - Optional token contract address
 * @returns Payment requirements object
 */
export function createStandardStarknetPaymentRequirements(
  network: "starknet" | "starknet-sepolia",
  payTo: string,
  amount: string,
  asset?: string,
): PaymentRequirements {
  // Use USDC by default
  const usdcAddress =
    asset ||
    (network === "starknet"
      ? "0x053C91253BC9682c04929cA02ED00b3E423f6710D2ee7e0D5EBB06F3eCF368A8"
      : "0x053b40A647CEDfca6cA84f542A0fe36736031905A9639a7f19A3C1e66bFd5080");

  return {
    scheme: "exact" as const,
    network,
    maxAmountRequired: amount,
    resource: `https://starknet.io/${network}/payment`,
    description: "Starknet payment using native account abstraction",
    mimeType: "application/json",
    payTo,
    maxTimeoutSeconds: 60,
    asset: usdcAddress,
  };
}

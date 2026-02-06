/**
 * XRP Facilitator Scheme Implementation
 * 
 * Implements SchemeNetworkFacilitator for the Exact payment scheme on XRP
 */

import {
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  VerifyResponse,
  SettleResponse,
} from "@x402/core/types";
import { FacilitatorXrpSigner, ExactXrpPayloadV2, isXrpPayload } from "../../types";
import { verifyXrp, settleXrp } from "./eip3009";

export interface ExactXrpSchemeConfig {
  /**
   * If enabled, automatically fund destination accounts that don't exist
   * Requires the facilitator to have sufficient XRP
   *
   * @default false
   */
  autoFundDestinations?: boolean;

  /**
   * Minimum XRP to fund for new accounts
   * Only applies if autoFundDestinations is true
   *
   * @default 1 (1 XRP)
   */
  newAccountFundingXrp?: number;
}

/**
 * XRP facilitator implementation for the Exact payment scheme.
 * Handles verification and settlement of native XRP Payment transactions.
 */
export class ExactXrpScheme implements SchemeNetworkFacilitator {
  readonly scheme = "exact";
  readonly caipFamily = "xrp:*";
  private readonly config: Required<ExactXrpSchemeConfig>;

  /**
   * Creates a new ExactXrpScheme instance.
   *
   * @param signer - The XRP signer for facilitator operations
   * @param config - Optional configuration for the facilitator
   */
  constructor(
    private readonly signer: FacilitatorXrpSigner,
    config?: ExactXrpSchemeConfig,
  ) {
    this.config = {
      autoFundDestinations: config?.autoFundDestinations ?? false,
      newAccountFundingXrp: config?.newAccountFundingXrp ?? 1,
    };
  }

  /**
   * Get mechanism-specific extra data for the supported kinds endpoint.
   * XRP facilitators don't need extra data (no feePayer like SVM).
   *
   * @param _ - The network identifier (unused for XRP)
   * @returns undefined (XRP has no extra data)
   */
  getExtra(_: string): Record<string, unknown> | undefined {
    return undefined;
  }

  /**
   * Get signer addresses used by this facilitator.
   * Returns all addresses this facilitator can use for transaction submission.
   *
   * @param _ - The network identifier (unused for XRP, addresses are network-agnostic)
   * @returns Array of facilitator addresses
   */
  getSigners(_: string): string[] {
    return [...this.signer.getAddresses()];
  }

  /**
   * Verifies a payment payload.
   *
   * @param payload - The payment payload to verify
   * @param requirements - The payment requirements
   * @returns Promise resolving to verification response
   */
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    const rawPayload = payload.payload as ExactXrpPayloadV2;

    return verifyXrp({
      signer: this.signer,
      payload,
      requirements,
      xrpPayload: rawPayload,
    });
  }

  /**
   * Settles a payment by executing the transfer.
   *
   * @param payload - The payment payload to settle
   * @param requirements - The payment requirements
   * @returns Promise resolving to settlement response
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const rawPayload = payload.payload as ExactXrpPayloadV2;

    if (!isXrpPayload(rawPayload)) {
      return {
        success: false,
        errorReason: "INVALID_TRANSACTION",
        errorMessage: "Invalid XRP transaction format",
        payer: "",
        transaction: "",
        network: requirements.network,
      };
    }

    // Handle auto-funding if enabled and destination doesn't exist
    if (this.config.autoFundDestinations) {
      try {
        // Check if destination exists
        await this.signer.getAccountInfo(rawPayload.transaction.Destination);
      } catch {
        // Destination doesn't exist, we would need to create it
        // This requires having the facilitator fund the account first
        // For now, just let the transaction fail with the appropriate error
      }
    }

    return settleXrp({
      signer: this.signer,
      payload,
      requirements,
      xrpPayload: rawPayload,
    });
  }
}

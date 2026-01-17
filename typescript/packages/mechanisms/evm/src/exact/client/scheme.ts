import {
  PaymentRequirements,
  SchemeNetworkClient,
  PaymentPayloadResult,
  PaymentCreationContext,
} from "@x402/core/types";
import { ClientEvmSigner } from "../../signer";
import { AssetTransferMethod } from "../../types";
import { createEIP3009Payload } from "./eip3009";
import { createPermit2Payload } from "./permit2";

/**
 * EVM client implementation for the Exact payment scheme.
 * Supports both EIP-3009 (transferWithAuthorization) and Permit2 flows.
 *
 * Routes to the appropriate authorization method based on
 * `requirements.extra.assetTransferMethod`. Defaults to EIP-3009
 * for backward compatibility with older facilitators.
 */
export class ExactEvmScheme implements SchemeNetworkClient {
  readonly scheme = "exact";

  /**
   * Creates a new ExactEvmClient instance.
   *
   * @param signer - The EVM signer for client operations
   */
  constructor(private readonly signer: ClientEvmSigner) {}

  /**
   * Creates a payment payload for the Exact scheme.
   * Routes to EIP-3009 or Permit2 based on requirements.extra.assetTransferMethod.
   *
   * @param x402Version - The x402 protocol version
   * @param paymentRequirements - The payment requirements
   * @param context - Optional context for extension support
   * @returns Promise resolving to a payment payload result
   */
  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
    context?: PaymentCreationContext,
  ): Promise<PaymentPayloadResult> {
    const assetTransferMethod =
      (paymentRequirements.extra?.assetTransferMethod as AssetTransferMethod) ?? "eip3009";

    if (assetTransferMethod === "permit2") {
      return createPermit2Payload(this.signer, x402Version, paymentRequirements, context);
    }

    return createEIP3009Payload(this.signer, x402Version, paymentRequirements);
  }
}

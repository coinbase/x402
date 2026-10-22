import {
  SchemeNetworkClient,
  PaymentRequirements,
  PaymentPayloadResult,
  PaymentPayloadContext,
} from "@x402/core/types";
import { ClientEvmSigner } from "../../signer";
import { createUptoPermit2Payload } from "./permit2";
import { createUptoEIP3009Payload } from "./eip3009";
import {
  trySignEip2612PermitExtension,
  trySignErc20ApprovalExtension,
} from "../../shared/extensions";
import { findDefaultAsset } from "../../defaultAssets";
import { UptoEvmSchemeOptions } from "./rpc";
import type { AssetTransferMethod } from "../../types";

/**
 * EVM client implementation for the Upto payment scheme.
 * Handles ERC-3009 and Permit2 payment payload creation.
 */
export class UptoEvmScheme implements SchemeNetworkClient {
  readonly scheme = "upto";
  findDefaultAsset = findDefaultAsset;

  /**
   * Creates a new UptoEvmScheme instance.
   *
   * @param signer - The EVM signer for client operations
   * @param options - Optional RPC configuration
   */
  constructor(
    private readonly signer: ClientEvmSigner,
    private readonly options?: UptoEvmSchemeOptions,
  ) {}

  /**
   * Creates a payment payload for the selected asset transfer method.
   *
   * @param x402Version - The x402 protocol version
   * @param paymentRequirements - The payment requirements
   * @param context - Optional context with server-declared extensions
   * @returns Promise resolving to a payment payload result
   */
  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
    context?: PaymentPayloadContext,
  ): Promise<PaymentPayloadResult> {
    const assetTransferMethod =
      (paymentRequirements.extra?.assetTransferMethod as AssetTransferMethod | undefined) ??
      "permit2";
    if (assetTransferMethod === "eip3009") {
      return createUptoEIP3009Payload(this.signer, x402Version, paymentRequirements);
    }

    const result = await createUptoPermit2Payload(this.signer, x402Version, paymentRequirements);

    const eip2612Extensions = await trySignEip2612PermitExtension(
      this.signer,
      this.options,
      paymentRequirements,
      result,
      context,
    );
    if (eip2612Extensions) {
      return { ...result, extensions: eip2612Extensions };
    }

    const erc20Extensions = await trySignErc20ApprovalExtension(
      this.signer,
      this.options,
      paymentRequirements,
      context,
    );
    if (erc20Extensions) {
      return { ...result, extensions: erc20Extensions };
    }

    return result;
  }
}

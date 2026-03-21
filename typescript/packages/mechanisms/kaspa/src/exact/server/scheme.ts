/**
 * Server-side x402 scheme implementation for Kaspa.
 *
 * Handles price parsing and payment requirements enhancement.
 * The server specifies prices in KAS; this module converts to sompi
 * and populates the PaymentRequirements structure.
 */

import {
  SOMPI_PER_KAS,
  KAS_NATIVE_ASSET,
  isCovenantAsset,
  validateAsset,
} from "../../constants.js";
import type {
  PaymentRequirements,
  SchemeNetworkServer,
  Price,
  AssetAmount,
} from "@x402/core/types";

/** Server-side x402 scheme for Kaspa exact payments. */
export class ExactKaspaScheme implements SchemeNetworkServer {
  readonly scheme = "exact";

  /**
   * Parse a price into an asset + amount (sompi).
   *
   * Accepts:
   * - number: interpreted as KAS (e.g., 1.5 = 1.5 KAS)
   * - string: interpreted as KAS (e.g., "1.5" = 1.5 KAS)
   * - AssetAmount with asset "native": amount is treated as sompi
   *
   * @param price - Price as KAS number/string or AssetAmount
   * @returns Resolved asset and amount in sompi
   */
  async parsePrice(price: Price): Promise<AssetAmount> {
    let amountSompi: bigint;

    if (typeof price === "object" && "asset" in price) {
      // AssetAmount — amount is already in the asset's smallest unit
      validateAsset(price.asset);
      amountSompi = BigInt(price.amount);
    } else {
      // Money (string | number) — interpreted as KAS
      const kas = typeof price === "string" ? parseFloat(price) : price;
      if (isNaN(kas) || kas <= 0) {
        throw new Error(`Invalid price: ${price}. Must be a positive number.`);
      }
      // Convert KAS to sompi (1 KAS = 100,000,000 sompi)
      amountSompi = BigInt(Math.round(kas * Number(SOMPI_PER_KAS)));
    }

    if (amountSompi <= 0n) {
      throw new Error(`Price must be positive, got ${amountSompi} sompi.`);
    }

    // Covenant tokens pass through the original asset; Money (number/string) is always KAS
    const resolvedAsset =
      typeof price === "object" && "asset" in price && isCovenantAsset(price.asset)
        ? price.asset
        : KAS_NATIVE_ASSET;

    return {
      asset: resolvedAsset,
      amount: amountSompi.toString(),
    };
  }

  /**
   * Enhance payment requirements with Kaspa-specific fields.
   *
   * For Kaspa, no additional fields are needed beyond the base requirements.
   * (Unlike SVM, which adds feePayer.)
   *
   * @param paymentRequirements - Base payment requirements to enhance
   * @returns Enhanced payment requirements (unchanged for Kaspa)
   */
  async enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
  ): Promise<PaymentRequirements> {
    return paymentRequirements;
  }
}

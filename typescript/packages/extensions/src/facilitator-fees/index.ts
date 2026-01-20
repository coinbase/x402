/**
 * Facilitator Fees Extension for x402 v2
 *
 * Enables fee-aware multi-facilitator routing by standardizing:
 * - FacilitatorFeeQuote: Facilitator fee disclosure at PaymentRequired time
 * - FacilitatorFeeBid: Client fee constraints in PaymentPayload
 * - FacilitatorFeePaid: Actual fee charged in SettlementResponse
 *
 * ## Usage
 *
 * ### For Resource Servers (declaring fee options)
 *
 * ```typescript
 * import {
 *   declareFacilitatorFeesExtension,
 *   FACILITATOR_FEES
 * } from '@x402/extensions/facilitator-fees';
 *
 * const extension = declareFacilitatorFeesExtension([
 *   {
 *     facilitatorId: "https://x402.org/facilitator",
 *     facilitatorFeeQuote: {
 *       quoteId: "quote_123",
 *       model: "flat",
 *       asset: "0x...",
 *       flatFee: "1000",
 *       expiry: Date.now() / 1000 + 3600,
 *       signature: "0x...",
 *       signatureScheme: "eip191"
 *     }
 *   }
 * ]);
 *
 * // Include in PaymentRequired
 * const paymentRequired = {
 *   x402Version: 2,
 *   resource: { ... },
 *   accepts: [ ... ],
 *   extensions: {
 *     [FACILITATOR_FEES]: extension
 *   }
 * };
 * ```
 *
 * ### For Clients (expressing fee constraints)
 *
 * ```typescript
 * import {
 *   createFacilitatorFeeBid,
 *   FACILITATOR_FEES
 * } from '@x402/extensions/facilitator-fees';
 *
 * const bid = createFacilitatorFeeBid({
 *   maxTotalFee: "2000",
 *   asset: "0x...",
 *   selectedQuoteId: "quote_123"
 * });
 *
 * // Include in PaymentPayload
 * const paymentPayload = {
 *   ...payload,
 *   extensions: {
 *     [FACILITATOR_FEES]: bid
 *   }
 * };
 * ```
 *
 * ### For Facilitators/Servers (reporting fees paid)
 *
 * ```typescript
 * import {
 *   createFacilitatorFeePaid,
 *   FACILITATOR_FEES
 * } from '@x402/extensions/facilitator-fees';
 *
 * const feePaid = createFacilitatorFeePaid({
 *   facilitatorFeePaid: "1000",
 *   asset: "0x...",
 *   quoteId: "quote_123",
 *   facilitatorId: "https://x402.org/facilitator"
 * });
 *
 * // Include in SettlementResponse
 * const settlementResponse = {
 *   ...response,
 *   extensions: {
 *     [FACILITATOR_FEES]: feePaid
 *   }
 * };
 * ```
 */

import {
  FacilitatorFeesPaymentRequiredInfoSchema,
  FacilitatorFeesPaymentPayloadInfoSchema,
  FacilitatorFeesSettlementInfoSchema,
  FACILITATOR_FEES_PAYMENT_REQUIRED_JSON_SCHEMA,
} from "./schema";

import type {
  FacilitatorOption,
  FacilitatorFeeBid,
  FacilitatorFeesPaymentRequiredExtension,
  FacilitatorFeesPaymentPayloadExtension,
  FacilitatorFeesSettlementExtension,
  FacilitatorFeesSettlementInfo,
  FacilitatorFeeQuote,
} from "./types";

// Re-export types
export type {
  FeeModel,
  SignatureScheme,
  FacilitatorFeeQuote,
  FacilitatorOption,
  FacilitatorFeeBid,
  FacilitatorFeePaid,
  FacilitatorFeesPaymentRequiredInfo,
  FacilitatorFeesPaymentPayloadInfo,
  FacilitatorFeesSettlementInfo,
  FacilitatorFeesPaymentRequiredExtension,
  FacilitatorFeesPaymentPayloadExtension,
  FacilitatorFeesSettlementExtension,
} from "./types";

export { FACILITATOR_FEES } from "./types";

import type { FacilitatorFeesSettlementInfo } from "./types";

// Re-export schemas
export {
  FeeModelSchema,
  SignatureSchemeSchema,
  FacilitatorFeeQuoteSchema,
  FacilitatorOptionSchema,
  FacilitatorFeeBidSchema,
  FacilitatorFeesPaymentRequiredInfoSchema,
  FacilitatorFeesPaymentPayloadInfoSchema,
  FacilitatorFeesSettlementInfoSchema,
  FACILITATOR_FEES_PAYMENT_REQUIRED_JSON_SCHEMA,
} from "./schema";

/**
 * Create a facilitator fees extension for PaymentRequired
 *
 * @param options - Array of facilitator options with fee quotes
 * @returns Extension object to include in PaymentRequired.extensions
 */
export function declareFacilitatorFeesExtension(
  options: FacilitatorOption[],
): FacilitatorFeesPaymentRequiredExtension {
  const info = { version: "1" as const, options };

  // Validate
  FacilitatorFeesPaymentRequiredInfoSchema.parse(info);

  return {
    info,
    schema: FACILITATOR_FEES_PAYMENT_REQUIRED_JSON_SCHEMA,
  };
}

/**
 * Create a facilitator fee bid for PaymentPayload
 *
 * @param bid - Client fee constraints
 * @returns Extension object to include in PaymentPayload.extensions
 */
export function createFacilitatorFeeBid(
  bid: FacilitatorFeeBid,
): FacilitatorFeesPaymentPayloadExtension {
  const info = { version: "1" as const, facilitatorFeeBid: bid };

  // Validate
  FacilitatorFeesPaymentPayloadInfoSchema.parse(info);

  return { info };
}

/**
 * Create a facilitator fee paid extension for SettlementResponse
 *
 * @param feePaid - Fee payment details
 * @returns Extension object to include in SettlementResponse.extensions
 */
export function createFacilitatorFeePaid(
  feePaid: Omit<FacilitatorFeesSettlementInfo, "version">,
): FacilitatorFeesSettlementExtension {
  const info: FacilitatorFeesSettlementInfo = { version: "1", ...feePaid };

  // Validate
  FacilitatorFeesSettlementInfoSchema.parse(info);

  return { info };
}

/**
 * Extract facilitator fees extension from PaymentRequired
 *
 * @param paymentRequired - PaymentRequired object with extensions
 * @param paymentRequired.extensions - Extensions map
 * @returns Parsed extension info or undefined if not present/invalid
 */
export function extractFacilitatorFeesFromPaymentRequired(paymentRequired: {
  extensions?: Record<string, unknown>;
}): FacilitatorFeesPaymentRequiredExtension["info"] | undefined {
  const ext = paymentRequired.extensions?.["facilitatorFees"] as { info?: unknown } | undefined;
  if (!ext?.info) return undefined;

  const result = FacilitatorFeesPaymentRequiredInfoSchema.safeParse(ext.info);
  return result.success ? result.data : undefined;
}

/**
 * Extract facilitator fee bid from PaymentPayload
 *
 * @param paymentPayload - PaymentPayload object with extensions
 * @param paymentPayload.extensions - Extensions map
 * @returns Parsed fee bid or undefined if not present/invalid
 */
export function extractFacilitatorFeeBid(paymentPayload: {
  extensions?: Record<string, unknown>;
}): FacilitatorFeeBid | undefined {
  const ext = paymentPayload.extensions?.["facilitatorFees"] as { info?: unknown } | undefined;
  if (!ext?.info) return undefined;

  const result = FacilitatorFeesPaymentPayloadInfoSchema.safeParse(ext.info);
  return result.success ? result.data.facilitatorFeeBid : undefined;
}

/**
 * Extract facilitator fee paid from SettlementResponse
 *
 * @param settlementResponse - SettlementResponse object with extensions
 * @param settlementResponse.extensions - Extensions map
 * @returns Parsed fee paid info or undefined if not present/invalid
 */
export function extractFacilitatorFeePaid(settlementResponse: {
  extensions?: Record<string, unknown>;
}): FacilitatorFeesSettlementInfo | undefined {
  const ext = settlementResponse.extensions?.["facilitatorFees"] as { info?: unknown } | undefined;
  if (!ext?.info) return undefined;

  const result = FacilitatorFeesSettlementInfoSchema.safeParse(ext.info);
  return result.success ? result.data : undefined;
}

/**
 * Check if a fee quote has expired
 *
 * @param quote - Fee quote to check
 * @param gracePeriodSeconds - Optional grace period in seconds (default 0)
 * @returns True if quote has expired
 */
export function isQuoteExpired(quote: FacilitatorFeeQuote, gracePeriodSeconds = 0): boolean {
  const now = Math.floor(Date.now() / 1000);
  return now > quote.expiry + gracePeriodSeconds;
}

/**
 * Find a fee quote by ID from facilitator options
 *
 * @param options - Array of facilitator options
 * @param quoteId - Quote ID to find
 * @returns The matching option or undefined
 */
export function findOptionByQuoteId(
  options: FacilitatorOption[],
  quoteId: string,
): FacilitatorOption | undefined {
  return options.find(opt => opt.facilitatorFeeQuote?.quoteId === quoteId);
}

/**
 * Filter facilitator options by max fee constraint
 *
 * @param options - Array of facilitator options
 * @param maxTotalFee - Maximum acceptable fee (as bigint-compatible string)
 * @param paymentAmount - Optional payment amount for BPS calculation
 * @returns Options that meet the fee constraint
 */
export function filterOptionsByMaxFee(
  options: FacilitatorOption[],
  maxTotalFee: string,
  paymentAmount?: string,
): FacilitatorOption[] {
  const maxFeeConstraint = BigInt(maxTotalFee);

  return options.filter(opt => {
    // If maxFacilitatorFee is provided, use it
    if (opt.maxFacilitatorFee !== undefined) {
      return BigInt(opt.maxFacilitatorFee) <= maxFeeConstraint;
    }

    // If we have a quote with flat fee, use it
    if (opt.facilitatorFeeQuote?.flatFee !== undefined) {
      return BigInt(opt.facilitatorFeeQuote.flatFee) <= maxFeeConstraint;
    }

    // If we have a BPS quote and payment amount is known, calculate
    if (opt.facilitatorFeeQuote?.bps !== undefined && paymentAmount !== undefined) {
      const calculatedFee = calculateBpsFee(opt.facilitatorFeeQuote, paymentAmount);
      return calculatedFee <= maxFeeConstraint;
    }

    // If we have a quote with maxFee bound, use it
    if (opt.facilitatorFeeQuote?.maxFee !== undefined) {
      return BigInt(opt.facilitatorFeeQuote.maxFee) <= maxFeeConstraint;
    }

    // Can't determine fee, exclude by default
    return false;
  });
}

// =============================================================================
// Fee Calculation Helpers
// =============================================================================

/**
 * Calculate the fee for a BPS (basis points) quote given a payment amount
 *
 * Formula: fee = max(minFee, min(maxFee, (paymentAmount * bps) / 10000))
 *
 * @param quote - Fee quote with BPS model
 * @param paymentAmount - Payment amount in atomic units
 * @returns Calculated fee in atomic units
 */
export function calculateBpsFee(quote: FacilitatorFeeQuote, paymentAmount: string): bigint {
  if (quote.bps === undefined) {
    throw new Error("Quote does not have BPS fee model");
  }

  const amount = BigInt(paymentAmount);
  const bps = BigInt(quote.bps);

  // Calculate raw BPS fee: (amount * bps) / 10000
  let fee = (amount * bps) / BigInt(10000);

  // Apply minFee constraint
  if (quote.minFee !== undefined) {
    const minFee = BigInt(quote.minFee);
    if (fee < minFee) fee = minFee;
  }

  // Apply maxFee constraint
  if (quote.maxFee !== undefined) {
    const maxFee = BigInt(quote.maxFee);
    if (fee > maxFee) fee = maxFee;
  }

  return fee;
}

/**
 * Calculate the fee for any quote type given an optional payment amount
 *
 * @param quote - Fee quote
 * @param paymentAmount - Payment amount (required for BPS/hybrid models)
 * @returns Calculated fee in atomic units, or undefined if cannot calculate
 */
export function calculateFee(
  quote: FacilitatorFeeQuote,
  paymentAmount?: string,
): bigint | undefined {
  switch (quote.model) {
    case "flat":
      if (quote.flatFee === undefined) return undefined;
      return BigInt(quote.flatFee);

    case "bps":
      if (paymentAmount === undefined) return undefined;
      return calculateBpsFee(quote, paymentAmount);

    case "tiered":
    case "hybrid":
      // For complex models, use maxFee as upper bound if available
      if (quote.maxFee !== undefined) return BigInt(quote.maxFee);
      return undefined;

    default:
      return undefined;
  }
}

// =============================================================================
// Signature Verification
// =============================================================================

/**
 * Get the canonical signing payload for a fee quote
 *
 * Fields are sorted alphabetically and signature/signatureScheme are excluded.
 *
 * @param quote - Fee quote to canonicalize
 * @returns Canonical JSON string for signing
 */
export function getCanonicalQuotePayload(quote: FacilitatorFeeQuote): string {
  // Build payload with only defined fields, excluding signature fields
  const payload: Record<string, unknown> = {};

  // Add fields in alphabetical order
  payload.asset = quote.asset;
  if (quote.bps !== undefined) payload.bps = quote.bps;
  payload.expiry = quote.expiry;
  payload.facilitatorAddress = quote.facilitatorAddress;
  if (quote.flatFee !== undefined) payload.flatFee = quote.flatFee;
  if (quote.maxFee !== undefined) payload.maxFee = quote.maxFee;
  if (quote.minFee !== undefined) payload.minFee = quote.minFee;
  payload.model = quote.model;
  payload.quoteId = quote.quoteId;

  return JSON.stringify(payload);
}

/**
 * Verify a fee quote signature (EIP-191 scheme)
 *
 * Requires viem or ethers for signature recovery. This function provides
 * the verification logic - actual recovery requires a crypto library.
 *
 * @param quote - Fee quote to verify
 * @param recoverAddress - Function to recover signer address from message and signature
 * @returns True if signature is valid and matches facilitatorAddress
 */
export async function verifyQuoteSignatureEip191(
  quote: FacilitatorFeeQuote,
  recoverAddress: (message: string, signature: string) => Promise<string>,
): Promise<boolean> {
  if (quote.signatureScheme !== "eip191") {
    throw new Error(`Expected eip191 signature scheme, got ${quote.signatureScheme}`);
  }

  const canonicalPayload = getCanonicalQuotePayload(quote);
  const recoveredAddress = await recoverAddress(canonicalPayload, quote.signature);

  // Compare addresses case-insensitively
  return recoveredAddress.toLowerCase() === quote.facilitatorAddress.toLowerCase();
}

/**
 * Verify that the settlement response matches the client's selected quote
 *
 * @param settlementInfo - Fee paid info from settlement response
 * @param selectedQuoteId - Quote ID that was selected by client
 * @param expectedFacilitatorId - Expected facilitator ID from the original quote
 * @returns Object with validation result and any error message
 */
export function verifySettlementMatchesSelection(
  settlementInfo: FacilitatorFeesSettlementInfo,
  selectedQuoteId: string,
  expectedFacilitatorId: string,
): { valid: boolean; error?: string } {
  // Verify quote ID matches
  if (settlementInfo.quoteId !== selectedQuoteId) {
    return {
      valid: false,
      error: `Quote ID mismatch: expected ${selectedQuoteId}, got ${settlementInfo.quoteId}`,
    };
  }

  // Verify facilitator ID matches
  if (settlementInfo.facilitatorId !== expectedFacilitatorId) {
    return {
      valid: false,
      error: `Facilitator ID mismatch: expected ${expectedFacilitatorId}, got ${settlementInfo.facilitatorId}`,
    };
  }

  return { valid: true };
}

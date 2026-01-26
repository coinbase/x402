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
  FeeQuoteResponseSchema,
  FeeQuoteErrorResponseSchema,
} from "./schema";

import type {
  FacilitatorOption,
  FacilitatorFeeBid,
  FacilitatorFeesPaymentRequiredExtension,
  FacilitatorFeesPaymentPayloadExtension,
  FacilitatorFeesSettlementExtension,
  FacilitatorFeesSettlementInfo,
  FacilitatorFeeQuote,
  FeeQuoteRequest,
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
  // Quote API types
  FeeQuoteRequest,
  FeeQuoteResponse,
  FeeQuoteErrorCode,
  FeeQuoteErrorResponse,
} from "./types";

export { FACILITATOR_FEES } from "./types";

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
  // Quote API schemas
  FeeQuoteRequestSchema,
  FeeQuoteResponseSchema,
  FeeQuoteErrorCodeSchema,
  FeeQuoteErrorResponseSchema,
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
 * Formula: fee = max(minFee, min(maxFee, floor((paymentAmount * bps) / 10000)))
 *
 * Note: Division uses floor rounding (round down) per spec for deterministic calculation.
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

  // Calculate raw BPS fee with floor rounding (BigInt division truncates toward zero)
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
 * Produces an RFC 8785 (JSON Canonicalization Scheme) compliant representation:
 * - Fields sorted lexicographically by key
 * - Compact JSON (no whitespace)
 * - signature/signatureScheme fields excluded
 *
 * @see https://www.rfc-editor.org/rfc/rfc8785
 * @param quote - Fee quote to canonicalize
 * @returns Canonical JSON string for signing
 */
export function getCanonicalQuotePayload(quote: FacilitatorFeeQuote): string {
  // Build payload with only defined fields, excluding signature fields
  // Fields added in alphabetical order for RFC 8785 compliance
  const payload: Record<string, unknown> = {};

  // Add fields in alphabetical order (lexicographic per RFC 8785)
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
 * Per the spec, servers MUST honor the client's `selectedQuoteId` or reject
 * the request. This function allows clients to verify enforcement.
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
      error: `Quote ID mismatch: expected ${selectedQuoteId}, got ${settlementInfo.quoteId}. Server MUST honor selectedQuoteId per spec.`,
    };
  }

  // Verify facilitator ID matches
  if (settlementInfo.facilitatorId !== expectedFacilitatorId) {
    return {
      valid: false,
      error: `Facilitator ID mismatch: expected ${expectedFacilitatorId}, got ${settlementInfo.facilitatorId}. Server MUST honor selectedQuoteId per spec.`,
    };
  }

  return { valid: true };
}

/**
 * Error thrown when a quote doesn't meet fee model requirements
 */
export class InvalidFeeQuoteError extends Error {
  /**
   * Creates a new InvalidFeeQuoteError
   *
   * @param message - Error message describing the validation failure
   * @param model - The fee model that failed validation (e.g., "bps", "flat")
   * @param missingField - The required field that was missing from the quote
   */
  constructor(
    message: string,
    public readonly model: string,
    public readonly missingField: string,
  ) {
    super(message);
    this.name = "InvalidFeeQuoteError";
  }
}

/**
 * Validate that a BPS quote has the required maxFee field for fee comparison
 *
 * Per the spec, BPS model quotes MUST include maxFee to enable clients to
 * compare fees when payment amount is unknown at quote time.
 *
 * @param quote - Fee quote to validate
 * @throws InvalidFeeQuoteError if BPS quote is missing maxFee
 */
export function validateBpsQuoteHasMaxFee(quote: FacilitatorFeeQuote): void {
  if (quote.model === "bps" && quote.maxFee === undefined) {
    throw new InvalidFeeQuoteError(
      "BPS model quote must include maxFee for fee comparison when payment amount is unknown",
      quote.model,
      "maxFee",
    );
  }
}

/**
 * Check if a quote can be used for fee-constrained routing
 *
 * Returns false for BPS quotes without maxFee since they cannot be compared
 * against maxTotalFee constraints when payment amount is unknown.
 *
 * @param option - Facilitator option to check
 * @returns True if the option can be used for fee comparison
 */
export function canCompareForFeeRouting(option: FacilitatorOption): boolean {
  // maxFacilitatorFee is always comparable
  if (option.maxFacilitatorFee !== undefined) {
    return true;
  }

  // Quote ref needs to be fetched first
  if (option.facilitatorFeeQuoteRef !== undefined && option.facilitatorFeeQuote === undefined) {
    return false;
  }

  const quote = option.facilitatorFeeQuote;
  if (!quote) {
    return false;
  }

  // Flat fee is always comparable
  if (quote.model === "flat" && quote.flatFee !== undefined) {
    return true;
  }

  // BPS requires maxFee for comparison
  if (quote.model === "bps") {
    return quote.maxFee !== undefined;
  }

  // Tiered/hybrid can use maxFee if provided
  if ((quote.model === "tiered" || quote.model === "hybrid") && quote.maxFee !== undefined) {
    return true;
  }

  return false;
}

// =============================================================================
// Facilitator Quote API Helpers
// =============================================================================

/**
 * Build the URL for a facilitator fee quote request
 *
 * @param baseUrl - Facilitator base URL (e.g., "https://facilitator.example.com")
 * @param request - Quote request parameters
 * @returns Full URL for the fee quote endpoint
 */
export function buildFeeQuoteUrl(baseUrl: string, request: FeeQuoteRequest): string {
  const url = new URL("/x402/fee-quote", baseUrl);
  url.searchParams.set("network", request.network);
  url.searchParams.set("asset", request.asset);
  if (request.amount !== undefined) {
    url.searchParams.set("amount", request.amount);
  }
  return url.toString();
}

/**
 * Fetch a fee quote from a facilitator
 *
 * @param facilitatorUrl - Facilitator base URL or full quote endpoint URL
 * @param request - Quote request parameters (optional if facilitatorUrl is a full URL)
 * @returns Fee quote or error response
 * @throws Error if network request fails
 */
export async function fetchFeeQuote(
  facilitatorUrl: string,
  request?: FeeQuoteRequest,
): Promise<
  { success: true; quote: FacilitatorFeeQuote } | { success: false; error: string; code?: string }
> {
  const url = request ? buildFeeQuoteUrl(facilitatorUrl, request) : facilitatorUrl;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    const errorResult = FeeQuoteErrorResponseSchema.safeParse(data);
    if (errorResult.success) {
      return { success: false, error: errorResult.data.message, code: errorResult.data.error };
    }
    return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
  }

  const result = FeeQuoteResponseSchema.safeParse(data);
  if (!result.success) {
    return { success: false, error: "Invalid quote response format" };
  }

  return { success: true, quote: result.data.facilitatorFeeQuote };
}

/**
 * Fetch a fee quote from a facilitatorFeeQuoteRef URL
 *
 * Convenience wrapper for fetching quotes from URLs provided in PaymentRequired.
 *
 * @param quoteRef - The facilitatorFeeQuoteRef URL from a FacilitatorOption
 * @returns Fee quote or error response
 */
export async function fetchFeeQuoteFromRef(
  quoteRef: string,
): Promise<
  { success: true; quote: FacilitatorFeeQuote } | { success: false; error: string; code?: string }
> {
  return fetchFeeQuote(quoteRef);
}

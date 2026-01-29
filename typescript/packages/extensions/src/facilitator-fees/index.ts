/**
 * Facilitator Fees Extension for x402 v2
 *
 * Enables fee-aware multi-facilitator routing by standardizing:
 * - **Facilitator Quote API**: Server-side fee discovery (core)
 * - **FacilitatorFeePaid**: Settlement receipt (core)
 * - **FacilitatorFeeBid**: Client fee preferences (optional)
 *
 * ## Design Philosophy
 *
 * **Server-side routing is primary.** Servers fetch quotes from facilitators,
 * compare costs, and select the optimal option. Clients receive a receipt.
 *
 * **Client preferences are optional.** Clients MAY express preferences
 * (asset, max fee) but these are advisory—servers handle the routing.
 *
 * ## Usage
 *
 * ### For Servers (creating settlement receipts)
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
 *   facilitatorId: "https://x402.org/facilitator",
 *   model: "flat"
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
 *
 * ### For Servers (fetching fee quotes)
 *
 * ```typescript
 * import { fetchFeeQuote, buildFeeQuoteUrl } from '@x402/extensions/facilitator-fees';
 *
 * // Fetch quotes from multiple facilitators
 * const quotes = await Promise.all([
 *   fetchFeeQuote("https://facilitator1.com", { network: "eip155:8453", asset: "0x..." }),
 *   fetchFeeQuote("https://facilitator2.com", { network: "eip155:8453", asset: "0x..." }),
 * ]);
 *
 * // Pick the cheapest
 * const cheapest = quotes.filter(q => q.success).sort(...)[0];
 * ```
 *
 * ### For Clients (expressing preferences - optional)
 *
 * ```typescript
 * import {
 *   createFacilitatorFeeBid,
 *   FACILITATOR_FEES
 * } from '@x402/extensions/facilitator-fees';
 *
 * const bid = createFacilitatorFeeBid({
 *   maxTotalFee: "2000",
 *   asset: "0x..."
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
 */

import {
  FacilitatorFeesPaymentPayloadInfoSchema,
  FacilitatorFeesSettlementInfoSchema,
  FeeQuoteResponseSchema,
  FeeQuoteErrorResponseSchema,
} from "./schema";

import type {
  FacilitatorFeeBid,
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
  FacilitatorFeeBid,
  FacilitatorFeePaid,
  FacilitatorFeesPaymentPayloadInfo,
  FacilitatorFeesSettlementInfo,
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
  FacilitatorFeeBidSchema,
  FacilitatorFeesPaymentPayloadInfoSchema,
  FacilitatorFeesSettlementInfoSchema,
  FACILITATOR_FEES_PAYMENT_PAYLOAD_JSON_SCHEMA,
  FACILITATOR_FEES_SETTLEMENT_JSON_SCHEMA,
  // Quote API schemas
  FeeQuoteRequestSchema,
  FeeQuoteResponseSchema,
  FeeQuoteErrorCodeSchema,
  FeeQuoteErrorResponseSchema,
} from "./schema";

/**
 * Create a facilitator fee bid for PaymentPayload (client preferences)
 *
 * These preferences are advisory—servers SHOULD try to honor them but
 * are not required to. The `amount` field in the payment is what the
 * client consents to; this is additional context for routing.
 *
 * @param bid - Client fee preferences (all fields optional)
 * @returns Extension object to include in PaymentPayload.extensions
 */
export function createFacilitatorFeeBid(
  bid?: FacilitatorFeeBid,
): FacilitatorFeesPaymentPayloadExtension {
  const info = { version: "1" as const, facilitatorFeeBid: bid };

  // Validate
  FacilitatorFeesPaymentPayloadInfoSchema.parse(info);

  return { info };
}

/**
 * Create a facilitator fee paid extension for SettlementResponse (receipt)
 *
 * This provides transparency to clients about actual fees charged.
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
 * Extract facilitator fee paid from SettlementResponse (receipt)
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

/**
 * Compare two quotes and return the cheaper one
 *
 * @param a - First quote
 * @param b - Second quote
 * @param paymentAmount - Payment amount for BPS calculation
 * @returns -1 if a is cheaper, 1 if b is cheaper, 0 if equal/incomparable
 */
export function compareQuotes(
  a: FacilitatorFeeQuote,
  b: FacilitatorFeeQuote,
  paymentAmount?: string,
): number {
  const feeA = calculateFee(a, paymentAmount);
  const feeB = calculateFee(b, paymentAmount);

  if (feeA === undefined && feeB === undefined) return 0;
  if (feeA === undefined) return 1; // b is better (known fee)
  if (feeB === undefined) return -1; // a is better (known fee)

  if (feeA < feeB) return -1;
  if (feeA > feeB) return 1;
  return 0;
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
  payload.network = quote.network;
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
 * Per the spec, BPS model quotes SHOULD include maxFee to enable servers to
 * compare fees when payment amount is unknown at quote time.
 *
 * @param quote - Fee quote to validate
 * @throws InvalidFeeQuoteError if BPS quote is missing maxFee
 */
export function validateBpsQuoteHasMaxFee(quote: FacilitatorFeeQuote): void {
  if (quote.model === "bps" && quote.maxFee === undefined) {
    throw new InvalidFeeQuoteError(
      "BPS model quote should include maxFee for fee comparison when payment amount is unknown",
      quote.model,
      "maxFee",
    );
  }
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
 * This is the primary mechanism for server-side fee discovery. Servers
 * should call this for multiple facilitators and compare quotes.
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
 * Fetch quotes from multiple facilitators in parallel
 *
 * Convenience wrapper for server-side multi-facilitator routing.
 *
 * @param facilitators - Array of facilitator URLs
 * @param request - Quote request parameters
 * @returns Array of results (success or error for each)
 */
export async function fetchMultipleFeeQuotes(
  facilitators: string[],
  request: FeeQuoteRequest,
): Promise<
  Array<{
    facilitator: string;
    result:
      | { success: true; quote: FacilitatorFeeQuote }
      | { success: false; error: string; code?: string };
  }>
> {
  const results = await Promise.all(
    facilitators.map(async facilitator => ({
      facilitator,
      result: await fetchFeeQuote(facilitator, request).catch(
        (err: Error) =>
          ({ success: false, error: err.message }) as {
            success: false;
            error: string;
            code?: string;
          },
      ),
    })),
  );
  return results;
}

/**
 * Find the cheapest quote from a list of results
 *
 * @param results - Results from fetchMultipleFeeQuotes
 * @param paymentAmount - Payment amount for BPS calculation
 * @returns The cheapest successful result, or undefined if none succeeded
 */
export function findCheapestQuote(
  results: Array<{
    facilitator: string;
    result:
      | { success: true; quote: FacilitatorFeeQuote }
      | { success: false; error: string; code?: string };
  }>,
  paymentAmount?: string,
): { facilitator: string; quote: FacilitatorFeeQuote } | undefined {
  const successful = results.filter(
    (r): r is { facilitator: string; result: { success: true; quote: FacilitatorFeeQuote } } =>
      r.result.success,
  );

  if (successful.length === 0) return undefined;

  // Sort by fee (cheapest first)
  successful.sort((a, b) => compareQuotes(a.result.quote, b.result.quote, paymentAmount));

  return {
    facilitator: successful[0].facilitator,
    quote: successful[0].result.quote,
  };
}

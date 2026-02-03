/**
 * Type definitions for the Facilitator Fees Extension
 *
 * This extension standardizes facilitator fee disclosure to enable
 * fee-aware multi-facilitator routing.
 *
 * ## Design Philosophy
 *
 * **Server-side routing is primary.** Servers fetch quotes from facilitators,
 * compare costs, and select the optimal option. Clients receive a receipt.
 *
 * **Client preferences are optional.** Clients MAY express preferences
 * (asset, max fee) but these are advisory—servers handle the routing.
 */

/**
 * Extension identifier constant
 */
export const FACILITATOR_FEES = "facilitatorFees";

/**
 * Supported fee models
 */
export type FeeModel = "flat" | "bps" | "tiered" | "hybrid";

/**
 * Supported signature schemes per network family
 */
export type SignatureScheme = "eip191" | "ed25519";

/**
 * Facilitator fee quote - signed fee disclosure from a facilitator
 *
 * Obtained via the Facilitator Quote API (GET /x402/fee-quote).
 *
 * Model-specific requirements:
 * - `flat` model: `flatFee` is REQUIRED
 * - `bps` model: `bps` REQUIRED, `maxFee` RECOMMENDED (enables fee comparison)
 * - `tiered`/`hybrid` models: `maxFee` is RECOMMENDED
 */
export interface FacilitatorFeeQuote {
  /** Unique identifier for this quote */
  quoteId: string;
  /** Signing address of the facilitator (required for signature verification) */
  facilitatorAddress: string;
  /** CAIP-2 network identifier (e.g., "eip155:8453") - ensures quote is self-describing and replay-resistant */
  network: string;
  /** Fee model type */
  model: FeeModel;
  /** Fee currency (token address or identifier) */
  asset: string;
  /** Flat fee amount in atomic units (REQUIRED for flat model) */
  flatFee?: string;
  /** Basis points (REQUIRED for bps model, 1 bps = 0.01%) */
  bps?: number;
  /** Minimum fee in atomic units */
  minFee?: string;
  /** Maximum fee in atomic units (RECOMMENDED for bps model to enable fee comparison) */
  maxFee?: string;
  /** Unix timestamp when quote expires */
  expiry: number;
  /** Facilitator signature over the canonical quote */
  signature: string;
  /** Signature scheme used */
  signatureScheme: SignatureScheme;
}

/**
 * Client fee bid - optional preferences from client (advisory, not binding)
 *
 * Clients MAY include this to express preferences. Servers SHOULD try to
 * honor these but are not required to. The `amount` field in the payment
 * is what the client consents to; this is additional context for routing.
 *
 * Use cases:
 * - Cost-conscious clients: "prefer facilitators charging ≤ X"
 * - Asset preferences: "I prefer paying fees in USDC"
 * - Simple clients: Omit entirely—server handles everything
 */
export interface FacilitatorFeeBid {
  /** Maximum acceptable fee in atomic units (soft constraint, advisory) */
  maxTotalFee?: string;
  /** Preferred fee currency */
  asset?: string;
}

/**
 * Info structure for PaymentPayload extension (client preferences)
 */
export interface FacilitatorFeesPaymentPayloadInfo {
  version: "1";
  facilitatorFeeBid?: FacilitatorFeeBid;
}

/**
 * Fee receipt - actual fee charged after settlement (core)
 *
 * Provides transparency to clients about what they paid in facilitator fees.
 */
export interface FacilitatorFeePaid {
  /** Actual fee charged in atomic units */
  facilitatorFeePaid: string;
  /** Fee currency */
  asset: string;
  /** Facilitator that processed the payment */
  facilitatorId?: string;
  /** Fee model that was applied */
  model?: FeeModel;
}

/**
 * Info structure for SettlementResponse extension (receipt)
 *
 * This is the "receipt" - shows actual fees charged after settlement.
 */
export interface FacilitatorFeesSettlementInfo {
  version: "1";
  /** Actual fee charged in atomic units */
  facilitatorFeePaid: string;
  /** Fee currency */
  asset: string;
  /** Facilitator that processed the payment */
  facilitatorId?: string;
  /** Fee model that was applied */
  model?: FeeModel;
}

/**
 * Full extension structure for PaymentPayload (client preferences)
 */
export interface FacilitatorFeesPaymentPayloadExtension {
  info: FacilitatorFeesPaymentPayloadInfo;
}

/**
 * Full extension structure for SettlementResponse (receipt)
 */
export interface FacilitatorFeesSettlementExtension {
  info: FacilitatorFeesSettlementInfo;
}

// =============================================================================
// Facilitator Quote API Types (GET /x402/fee-quote)
// =============================================================================

/**
 * Query parameters for the facilitator quote API endpoint
 *
 * Facilitators SHOULD expose: GET /x402/fee-quote?network=...&asset=...&amount=...
 */
export interface FeeQuoteRequest {
  /** CAIP-2 network identifier (e.g., "eip155:8453") */
  network: string;
  /** Token address for fee currency */
  asset: string;
  /** Payment amount in atomic units (optional, enables exact BPS calculation) */
  amount?: string;
}

/**
 * Successful response from the facilitator quote API
 */
export interface FeeQuoteResponse {
  facilitatorFeeQuote: FacilitatorFeeQuote;
}

/**
 * Standard error codes for the facilitator quote API
 */
export type FeeQuoteErrorCode = "UNSUPPORTED_NETWORK" | "UNSUPPORTED_ASSET" | "INVALID_AMOUNT";

/**
 * Error response from the facilitator quote API
 */
export interface FeeQuoteErrorResponse {
  error: FeeQuoteErrorCode;
  message: string;
}

/**
 * Type definitions for the Facilitator Fees Extension
 *
 * This extension standardizes facilitator fee disclosure to enable
 * fee-aware multi-facilitator routing.
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
 * Model-specific requirements:
 * - `flat` model: `flatFee` is REQUIRED
 * - `bps` model: `bps` REQUIRED, `maxFee` RECOMMENDED (clients may exclude uncapped quotes)
 * - `tiered`/`hybrid` models: `maxFee` is RECOMMENDED
 */
export interface FacilitatorFeeQuote {
  /** Unique identifier for this quote */
  quoteId: string;
  /** Signing address of the facilitator (required for signature verification) */
  facilitatorAddress: string;
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
 * A single facilitator option in the fee disclosure
 */
export interface FacilitatorOption {
  /** Stable facilitator identifier (MUST be a valid URL) */
  facilitatorId: string;
  /** Embedded signed fee quote */
  facilitatorFeeQuote?: FacilitatorFeeQuote;
  /** URL to fetch the signed quote directly from facilitator */
  facilitatorFeeQuoteRef?: string;
  /** Conservative upper bound on fee (privacy-friendly alternative) */
  maxFacilitatorFee?: string;
}

/**
 * Info structure for PaymentRequired extension
 */
export interface FacilitatorFeesPaymentRequiredInfo {
  version: "1";
  options: FacilitatorOption[];
}

/**
 * Client fee bid - constraints/preferences from client
 *
 * Selection semantics:
 * - If `selectedQuoteId` is absent: Server picks any facilitator meeting `maxTotalFee`
 * - If `selectedQuoteId` is present: Server MUST use that facilitator or reject
 */
export interface FacilitatorFeeBid {
  /** Maximum acceptable fee in atomic units (hard constraint) */
  maxTotalFee: string;
  /** Fee currency */
  asset: string;
  /** Explicitly select a specific quote by ID. Server MUST honor this or reject. */
  selectedQuoteId?: string;
}

/**
 * Info structure for PaymentPayload extension
 */
export interface FacilitatorFeesPaymentPayloadInfo {
  version: "1";
  facilitatorFeeBid: FacilitatorFeeBid;
}

/**
 * Fee receipt - actual fee charged after settlement
 */
export interface FacilitatorFeePaid {
  /** Actual fee charged in atomic units */
  facilitatorFeePaid: string;
  /** Fee currency */
  asset: string;
  /** Quote that was used (if any) */
  quoteId?: string;
  /** Facilitator that processed the payment */
  facilitatorId?: string;
  /** Fee model that was applied */
  model?: FeeModel;
}

/**
 * Info structure for SettlementResponse extension
 */
export interface FacilitatorFeesSettlementInfo {
  version: "1";
  facilitatorFeePaid: string;
  asset: string;
  quoteId?: string;
  facilitatorId?: string;
  model?: FeeModel;
}

/**
 * Full extension structure for PaymentRequired
 */
export interface FacilitatorFeesPaymentRequiredExtension {
  info: FacilitatorFeesPaymentRequiredInfo;
  schema: Record<string, unknown>;
}

/**
 * Full extension structure for PaymentPayload
 */
export interface FacilitatorFeesPaymentPayloadExtension {
  info: FacilitatorFeesPaymentPayloadInfo;
}

/**
 * Full extension structure for SettlementResponse
 */
export interface FacilitatorFeesSettlementExtension {
  info: FacilitatorFeesSettlementInfo;
}

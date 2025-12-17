import { PaymentPayload, PaymentRequirements } from "./payments";
import { Network } from "./";

/**
 * Remediation hint for resolving payment issues.
 * Provides actionable guidance to clients on how to fix a failure.
 */
export type Remediation = {
  /** Suggested action (e.g., "top_up", "retry", "switch_network") */
  action: string;
  /** Why this action would help */
  reason?: string;
  /** Action-specific parameters */
  [key: string]: unknown;
};

/**
 * Intent trace for structured payment decision context.
 * Used to communicate why a payment was declined or failed.
 */
export type IntentTrace = {
  /** Enumerated code identifying the primary reason */
  reason_code: string;
  /** Human-readable summary (max 500 chars) */
  trace_summary?: string;
  /** Flat key-value object for additional context */
  metadata?: Record<string, string | number | boolean>;
  /** Suggested action to resolve the issue */
  remediation?: Remediation;
};

export type VerifyRequest = {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

export type VerifyResponse = {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
  /** Structured context for why verification failed */
  intentTrace?: IntentTrace;
};

export type SettleRequest = {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

export type SettleResponse = {
  success: boolean;
  errorReason?: string;
  payer?: string;
  transaction: string;
  network: Network;
  /** Structured context for why settlement failed */
  intentTrace?: IntentTrace;
};

export type SupportedKind = {
  x402Version: number;
  scheme: string;
  network: Network;
  extra?: Record<string, unknown>;
};

export type SupportedResponse = {
  kinds: SupportedKind[];
  extensions: string[];
  signers: Record<string, string[]>; // CAIP family pattern → Signer addresses
};

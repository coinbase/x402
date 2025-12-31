import { PaymentPayload, PaymentRequirements } from "./payments";
import { Network } from "./";

export type VerifyRequest = {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

export type VerifyResponse = {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
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

/**
 * Error thrown when payment verification fails.
 */
export class VerifyError extends Error {
  readonly invalidReason?: string;
  readonly payer?: string;
  readonly statusCode: number;

  /**
   * Creates a VerifyError from a failed verification response.
   *
   * @param statusCode - HTTP status code from the facilitator
   * @param response - The verify response containing error details
   */
  constructor(statusCode: number, response: VerifyResponse) {
    super(`verification failed: ${response.invalidReason || "unknown reason"}`);
    this.name = "VerifyError";
    this.statusCode = statusCode;
    this.invalidReason = response.invalidReason;
    this.payer = response.payer;
  }
}

/**
 * Error thrown when payment settlement fails.
 */
export class SettleError extends Error {
  readonly errorReason?: string;
  readonly payer?: string;
  readonly transaction: string;
  readonly network: Network;
  readonly statusCode: number;

  /**
   * Creates a SettleError from a failed settlement response.
   *
   * @param statusCode - HTTP status code from the facilitator
   * @param response - The settle response containing error details
   */
  constructor(statusCode: number, response: SettleResponse) {
    super(`settlement failed: ${response.errorReason || "unknown reason"}`);
    this.name = "SettleError";
    this.statusCode = statusCode;
    this.errorReason = response.errorReason;
    this.payer = response.payer;
    this.transaction = response.transaction;
    this.network = response.network;
  }
}

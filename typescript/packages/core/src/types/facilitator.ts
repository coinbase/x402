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
  scheme: string;
  network: Network;
  extra?: Record<string, unknown>;
};

export type SupportedResponse = {
  kinds: Record<string, SupportedKind[]>; // Version string → Array of kinds
  extensions: string[];
  signers: Record<string, string[]>; // CAIP family pattern → Signer addresses
};

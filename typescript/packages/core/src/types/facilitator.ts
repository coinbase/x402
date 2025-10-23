import { PaymentPayload, PaymentRequirements } from "./payments";
import { Network } from "./";

export type VerifyRequest = {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

export type VerifyResponse = {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
}

export type SettleRequest = {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

export type SettleResponse = {
  success: boolean,
  errorReason?: string;
  payer?: string;
  transaction: string;
  network: Network;
}

export type SupportedResponse = {
  kinds: {
    x402Version: number;
    scheme: string;
    network: Network;
    extra?: Record<string, any>;
  }[];
  extensions: string[];
}
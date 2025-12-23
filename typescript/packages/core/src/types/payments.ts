import { Network } from "./";
import { IntentTrace } from "./facilitator";

export interface ResourceInfo {
  url: string;
  description: string;
  mimeType: string;
}

export type PaymentRequirements = {
  scheme: string;
  network: Network;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
};

export type PaymentRequired = {
  x402Version: number;
  error?: string;
  resource: ResourceInfo;
  accepts: PaymentRequirements[];
  extensions?: Record<string, unknown>;
};

export type PaymentPayload = {
  x402Version: number;
  resource: ResourceInfo;
  accepted: PaymentRequirements;
  payload: Record<string, unknown>;
  extensions?: Record<string, unknown>;
};

/**
 * Payment decline message sent by clients when they choose not to pay.
 * Includes optional intent trace to explain the reason for declining.
 */
export type PaymentDecline = {
  x402Version: number;
  decline: true;
  resource: ResourceInfo;
  /** Structured context for why the payment was declined */
  intentTrace?: IntentTrace;
};

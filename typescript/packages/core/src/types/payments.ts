import { Network } from "./";

export type PaymentRequirements = {
  scheme: string;
  network: Network;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, any>;
}

export type PaymentRequired = {
  x402Version: number;
  error?: string;
  resource: {
    url: string;
    description: string;
    mimeType: string;
  };
  accepts: PaymentRequirements[];
  extensions?: Record<string, any>;
}

export type PaymentPayload = {
  x402Version: number;
  scheme: string;
  network: Network;
  payload: Record<string, any>;
  accepted: PaymentRequirements;
  extensions?: Record<string, any>;
}

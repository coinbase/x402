import { Network } from "./";

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
  resource: {
    url: string;
    description: string;
    mimeType: string;
  };
  accepts: PaymentRequirements[];
  extensions?: Record<string, unknown>;
};

export type PaymentPayload = {
  x402Version: number;
  scheme: string;
  network: Network;
  payload: Record<string, unknown>;
  accepted: PaymentRequirements;
  extensions?: Record<string, unknown>;
};

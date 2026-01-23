import { Network } from "./";

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
  /** Signed offer proving these requirements came from the resource server (optional) */
  signedOffer?: SignedOffer;
};

/**
 * Signed offer object (JWS or EIP-712 format)
 * Per x402 spec: each accepts[] entry MAY include its own signature
 */
export type SignedOffer =
  | { format: "jws"; signature: string }
  | { format: "eip712"; payload: Record<string, unknown>; signature: string };

/**
 * Signed receipt object (JWS or EIP-712 format)
 * Privacy-minimal: contains only resourceUrl, payer, issuedAt
 */
export type SignedReceipt =
  | { format: "jws"; signature: string }
  | { format: "eip712"; payload: Record<string, unknown>; signature: string };

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

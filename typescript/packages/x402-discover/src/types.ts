// x402 Payment Requirements from the spec
export interface PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  asset: string;
  payTo: string;
  resource: string;
  description?: string;
  mimeType?: string;
  maxTimeoutSeconds?: number;
  outputSchema?: unknown;
  extra?: Record<string, unknown>;
}

// Resource/Tool as returned by discovery
export interface Resource {
  resource: string; // URL
  type: string; // "http"
  x402Version: number;
  accepts: PaymentRequirements[];
  lastUpdated?: number;
  metadata?: {
    category?: string;
    provider?: string;
    [key: string]: unknown;
  };
}

// Discovery API response
export interface DiscoveryResponse {
  x402Version: number;
  items: Resource[];
  pagination?: {
    limit: number;
    offset: number;
    total: number;
  };
}

// Simplified tool for display/search
export interface Tool {
  url: string;
  description: string;
  price: string; // human readable e.g. "$0.01"
  priceRaw: string; // atomic units
  network: string; // normalized e.g. "base"
  networkRaw?: string; // original e.g. "eip155:8453"
  asset: string;
  payTo: string;
  facilitator: string;
}

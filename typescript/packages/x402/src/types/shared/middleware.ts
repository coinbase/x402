import { HTTPRequestStructure } from "..";
import { CreateHeaders } from "../../verify";
import { EvmSigner } from "./evm";
import { Money } from "./money";
import { Network } from "./network";
import { Resource } from "./resource";

export type FacilitatorConfig = {
  url: Resource;
  createAuthHeaders?: CreateHeaders;
};

export type PaywallConfig = {
  cdpClientKey?: string;
  appName?: string;
  appLogo?: string;
  sessionTokenEndpoint?: string;
};

/**
 * Metadata for discovery catalog (Bazaar)
 */
export type DiscoveryMetadata = {
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  documentation?: string;
  logo?: string;
  provider?: string;
  [key: string]: unknown;
};

/**
 * Schema definition for discovery input/output
 */
export type DiscoverySchemaDefinition = {
  example?: unknown;
  schema?: Record<string, unknown>;
};

export type PaymentMiddlewareConfig = {
  description?: string;
  mimeType?: string;
  maxTimeoutSeconds?: number;
  inputSchema?: Omit<HTTPRequestStructure, "type" | "method">;
  outputSchema?: object;
  discoverable?: boolean;
  customPaywallHtml?: string;
  resource?: Resource;
  signatureType?: "authorization" | "permit";
  /**
   * Discovery input schema for Bazaar catalog (example + JSON schema).
   * Use declareDiscoveryExtension() from "@b3dotfun/anyspend-x402/extensions" for convenience.
   */
  discoveryInput?: DiscoverySchemaDefinition;
  /**
   * Discovery output schema for Bazaar catalog (example + JSON schema).
   * Use declareDiscoveryExtension() from "@b3dotfun/anyspend-x402/extensions" for convenience.
   */
  discoveryOutput?: DiscoverySchemaDefinition;
  /**
   * Metadata for the Bazaar discovery catalog.
   * Use declareDiscoveryExtension() from "@b3dotfun/anyspend-x402/extensions" for convenience.
   */
  discoveryMetadata?: DiscoveryMetadata;
  errorMessages?: {
    paymentRequired?: string;
    invalidPayment?: string;
    noMatchingRequirements?: string;
    verificationFailed?: string;
    settlementFailed?: string;
  };
};

export interface ERC20TokenAmount {
  amount: string;
  asset: {
    address: `0x${string}`;
    decimals: number;
    eip712: {
      name: string;
      version: string;
    };
  };
}

export interface SPLTokenAmount {
  amount: string;
  asset: {
    address: string;
    decimals: number;
  };
}

export type Price = Money | ERC20TokenAmount | SPLTokenAmount;

export interface RouteConfig {
  price: Price;
  network: Network;
  config?: PaymentMiddlewareConfig;
}

export type RoutesConfig = Record<string, Price | RouteConfig>;

export interface RoutePattern {
  verb: string;
  pattern: RegExp;
  config: RouteConfig;
}

export type Wallet = EvmSigner;

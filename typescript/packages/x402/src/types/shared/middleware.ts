import { CreateHeaders } from "../../verify";
import { Money } from "./money";
import { Network } from "./network";
import { Resource } from "./resource";
import { EvmSigner } from "./evm";
import { HTTPRequestStructure } from "..";
import { SuiWallet } from "./sui";

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

export type PaymentMiddlewareConfig = {
  description?: string;
  mimeType?: string;
  maxTimeoutSeconds?: number;
  inputSchema?: Omit<HTTPRequestStructure, "type" | "method">;
  outputSchema?: object;
  customPaywallHtml?: string;
  resource?: Resource;
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

export interface SuiTokenAmount {
  amount: string;
  asset: {
    // TODO: address is misleading because we really want coinType,
    // but using address means we don't need to update all the middleware to set
    // asset in payment requirements to either address or coinType depending on the network
    address: string;
    coinType: string;
    decimals: number;
  };
}

export type Price = Money | ERC20TokenAmount | SPLTokenAmount | SuiTokenAmount;

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

export type Wallet = EvmSigner | SuiWallet;

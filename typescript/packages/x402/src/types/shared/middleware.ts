import { Hex } from "viem";
import { Network } from "./network";
import { Resource } from "./resource";
import { CreateHeaders } from "../../verify";

export type GlobalConfig = {
  facilitatorUrl?: Resource;
  address: Hex;
  network: Network;
  createAuthHeaders?: CreateHeaders;
};

export type PaymentMiddlewareConfig = {
  description?: string;
  mimeType?: string;
  maxTimeoutSeconds?: number;
  outputSchema?: object;
  customPaywallHtml?: string;
  resource?: Resource;
  asset?: {
    address: string;
    decimals: number;
    eip712: {
      name: string;
      version: string;
    };
  };
};

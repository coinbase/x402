import { SettleResponse, VerifyResponse } from "./facilitator";
import { PaymentRequirements } from "./payments";
import { PaymentPayload } from "./payments";
import { Price, Network, AssetAmount } from ".";

export interface SchemeNetworkClient {
  readonly scheme: string;

  createPaymentPayload(x402Version: number, requirements: PaymentRequirements): Promise<PaymentPayload>;
}

export interface SchemeNetworkFacilitator {
  readonly scheme: string;

  verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse>;
  settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse>;
}

export interface SchemeNetworkService {
  readonly scheme: string;

  /**
   * Convert a user-friendly price to the scheme's specific amount and asset format
   * @param price - User-friendly price (e.g., "$0.10", "0.10", { amount: "100000", asset: "USDC" })
   * @param network - The network identifier for context
   * @returns The converted amount, asset identifier, and any extra metadata
   * 
   * @example
   * // For EVM networks with USDC:
   * parsePrice("$0.10", "eip155:8453") => { amount: "100000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" }
   * 
   * // For custom schemes:
   * parsePrice("10 points", "custom:network") => { amount: "10", asset: "points" }
   */
  parsePrice(price: Price, network: Network): AssetAmount;

  /**
   * Build payment requirements for this scheme/network combination
   * @param paymentRequirements - Base payment requirements with amount/asset already set
   * @param supportedKind - The supported kind from facilitator's /supported endpoint
   * @param facilitatorExtensions - Extensions supported by the facilitator
   * @returns Enhanced payment requirements ready to be sent to clients
   */
  enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    supportedKind: {
      x402Version: number;
      scheme: string;
      network: Network;
      extra?: Record<string, any>;
    },
    facilitatorExtensions: string[]
  ): Promise<PaymentRequirements>;
}



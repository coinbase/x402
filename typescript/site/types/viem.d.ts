// Custom typings for viem to help with excessively deep type instantiations

// This declares the module "x402/facilitator" to have a simplified verify function signature
// that doesn't cause deep type instantiation issues
declare module "x402/facilitator" {
  import {
    PaymentPayload,
    PaymentRequirements,
    VerifyResponse,
    SettleResponse,
  } from "x402/types/verify";

  // Define a simpler client type that won't cause deep type instantiation
  type SimpleClient = {
    chain: { id: number };
    request: (...args: unknown[]) => Promise<unknown>;
  };

  export function verify(
    client: SimpleClient, // Using a simpler client type to avoid deep type instantiation
    payload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<VerifyResponse>;

  export function settle(
    client: SimpleClient, // Using a simpler client type to avoid deep type instantiation
    payload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<SettleResponse>;
}

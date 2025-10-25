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

  // Define a very permissive client type to accept any runtime client (EVM/SVM/Hedera)
  type SimpleClient = object;

  export function verify(
    client: SimpleClient, // Using simpler client types to avoid deep type instantiation
    payload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<VerifyResponse>;

  export function settle(
    client: SimpleClient, // Using simpler client types to avoid deep type instantiation
    payload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<SettleResponse>;
}

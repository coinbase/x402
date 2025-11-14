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

  // Define a minimal client type that works for EVM, Solana, and Starknet signers
  type SimpleClient =
    | {
        [key: string]: unknown; // Allow any additional properties to avoid deep type instantiation issues
        address?: string; // Optional to handle both EVM and Solana address formats
      }
    | {
        // Alternative interface for signers that don't have index signatures (like StarknetSigner)
        address?: string;
        account?: unknown;
        privateKey?: string;
        network?: string;
      };

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

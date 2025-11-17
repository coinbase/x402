import { privateKeyToAccount } from "viem/accounts";
import { x402Client } from "@x402/fetch";
import { ExactEvmClient } from "@x402/evm";

/**
 * Creates an x402Client with custom hooks for payment lifecycle events.
 *
 * This demonstrates how to hook into the payment creation process to add
 * custom logic at different stages:
 * - onBeforePaymentCreation: Called before payment creation starts, can abort the process
 * - onAfterPaymentCreation: Called after successful payment creation, useful for logging/side effects
 * - onPaymentCreationFailure: Called when payment creation fails, can attempt recovery
 *
 * @param evmPrivateKey - The EVM private key for signing transactions
 * @returns A configured x402Client instance with hooks
 */
export async function createHooksClient(evmPrivateKey: `0x${string}`): Promise<x402Client> {
  const evmSigner = privateKeyToAccount(evmPrivateKey);

  const client = new x402Client()
    .registerScheme("eip155:*", new ExactEvmClient(evmSigner))
    .onBeforePaymentCreation(async (context: unknown) => {
      console.log("Before payment creation", context);
      // If payment creation should be aborted, we can return aborted
      // e.g. return { abort: true, reason: "Reason" };
    })
    .onAfterPaymentCreation(async (context: unknown) => {
      console.log("After payment creation", context);
      // Can handle side effects here, e.g. logging
    })
    .onPaymentCreationFailure(async (context: unknown) => {
      console.log("Payment creation failure", context);
      // If payment creation failed, we can try to recover by returning a payment payload
      // e.g. return { recovered: true, payload: fixedPayload };
    });

  return client;
}

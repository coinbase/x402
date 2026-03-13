import { PaymentRequirements, PaymentPayloadResult } from "@x402/core/types";
import { x402UptoPermit2ProxyAddress } from "../../constants";
import { ClientEvmSigner } from "../../signer";
import { createPermit2PayloadForProxy } from "../../shared/permit2";

// Re-export Permit2-generic approval helpers
export { createPermit2ApprovalTx, getPermit2AllowanceReadParams } from "../../exact/client/permit2";
export type { Permit2AllowanceParams } from "../../exact/client/permit2";

/**
 * Creates a Permit2 payload for the upto payment scheme.
 * Uses x402UptoPermit2Proxy as the spender, which enforces that funds
 * can only be sent to the witness.to address.
 *
 * The `permitted.amount` represents the **maximum** amount authorized.
 * Actual settlement amount is determined by the server and may be less.
 *
 * @param signer - The EVM signer for client operations
 * @param x402Version - The x402 protocol version
 * @param paymentRequirements - The payment requirements (amount = maximum authorized)
 * @returns Promise resolving to a payment payload result
 */
export async function createUptoPermit2Payload(
  signer: ClientEvmSigner,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<PaymentPayloadResult> {
  return createPermit2PayloadForProxy(
    x402UptoPermit2ProxyAddress,
    signer,
    x402Version,
    paymentRequirements,
  );
}

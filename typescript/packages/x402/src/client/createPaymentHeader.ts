import { createPaymentHeader as createPaymentHeaderExactEVM } from "../schemes/exact/evm/client";
import { SupportedEVMNetworks } from "../types/shared";
import { SignerWallet } from "../types/shared/evm";
import { PaymentRequirements } from "../types/verify";

/**
 * Creates a payment header based on the provided client and payment requirements.
 * 
 * @param client - The signer wallet instance used to create the payment header
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns A promise that resolves to the created payment header string
 */
export async function createPaymentHeader(
  client: SignerWallet,
  paymentRequirements: PaymentRequirements,
): Promise<string> {
  if (
    paymentRequirements.scheme === "exact" &&
    SupportedEVMNetworks.includes(paymentRequirements.network)
  ) {
    return await createPaymentHeaderExactEVM(client, paymentRequirements);
  }

  throw new Error("Unsupported scheme");
}
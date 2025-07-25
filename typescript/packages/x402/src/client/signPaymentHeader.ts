import { signPaymentHeader as signPaymentHeaderExactEVM } from "../schemes/exact/evm/client";
import { encodePayment } from "../schemes/exact/evm/utils/paymentUtils";
import { SupportedEVMNetworks } from "../types/shared";
import { SignerWallet } from "../types/shared/evm";
import { PaymentRequirements, UnsignedPaymentPayload } from "../types/verify";

/**
 * Signs a payment header using the provided client and payment requirements.
 * 
 * @param client - The signer wallet instance used to sign the payment header
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @param unsignedPaymentHeader - The unsigned payment payload to be signed
 * @returns A promise that resolves to the encoded signed payment header string
 */
export async function signPaymentHeader(
  client: SignerWallet,
  paymentRequirements: PaymentRequirements,
  unsignedPaymentHeader: UnsignedPaymentPayload,
): Promise<string> {
  if (
    paymentRequirements.scheme === "exact" &&
    SupportedEVMNetworks.includes(paymentRequirements.network)
  ) {
    const signedPaymentHeader = await signPaymentHeaderExactEVM(client, paymentRequirements, unsignedPaymentHeader);
    return encodePayment(signedPaymentHeader);
  }

  throw new Error("Unsupported scheme");
}
import { signPaymentHeader as signPaymentHeaderExactEVM } from "../schemes/exact/evm/client";
import { encodePayment } from "../schemes/exact/evm/utils/paymentUtils";
import { isEvmSignerWallet, isMultiNetworkSigner, MultiNetworkSigner, Signer, SupportedEVMNetworks, SupportedSVMNetworks, SupportedHederaNetworks } from "../types/shared";
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
  client: Signer | MultiNetworkSigner,
  paymentRequirements: PaymentRequirements,
  unsignedPaymentHeader: UnsignedPaymentPayload,
): Promise<string> {
  if (paymentRequirements.scheme === "exact") {
    // evm
    if (SupportedEVMNetworks.includes(paymentRequirements.network)) {
      const evmClient = isMultiNetworkSigner(client) ? client.evm : client;

      if (!isEvmSignerWallet(evmClient)) {
        throw new Error("Invalid evm wallet client provided");
      }
      const signedPaymentHeader = await signPaymentHeaderExactEVM(evmClient, paymentRequirements, unsignedPaymentHeader);
      return encodePayment(signedPaymentHeader);
    }

    // svm and hedera don't use this function - they handle signing in createPaymentHeader
    if (SupportedSVMNetworks.includes(paymentRequirements.network) || 
        SupportedHederaNetworks.includes(paymentRequirements.network)) {
      throw new Error("Use createPaymentHeader directly for SVM and Hedera networks");
    }
  }

  throw new Error("Unsupported scheme or network");
}
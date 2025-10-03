import { createPaymentHeader as createPaymentHeaderExactEVM } from "../schemes/exact/evm/client";
import { createPaymentHeader as createPaymentHeaderExactSVM } from "../schemes/exact/svm/client";
import { isEvmSignerWallet, isMultiNetworkSigner, isSvmSignerWallet, MultiNetworkSigner, Signer, SupportedEVMNetworks, SupportedSVMNetworks } from "../types/shared";
import { createPaymentHeader as createPaymentHeaderDeferredEVM } from "../schemes/deferred/evm/client";
import { PaymentRequirements } from "../types/verify";
import { DEFERRRED_SCHEME } from "../types/verify/schemes/deferred";
import { EXACT_SCHEME } from "../types/verify/schemes/exact";

/**
 * Creates a payment header based on the provided client and payment requirements.
 * 
 * @param client - The signer wallet instance used to create the payment header
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns A promise that resolves to the created payment header string
 */
export async function createPaymentHeader(
  client: Signer | MultiNetworkSigner,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<string> {
  // exact scheme
  if (paymentRequirements.scheme === EXACT_SCHEME) {
    // evm
    if (SupportedEVMNetworks.includes(paymentRequirements.network)) {
      const evmClient = isMultiNetworkSigner(client) ? client.evm : client;

      if (!isEvmSignerWallet(evmClient)) {
        throw new Error("Invalid evm wallet client provided");
      }

      return await createPaymentHeaderExactEVM(
        evmClient,
        x402Version,
        paymentRequirements,
      );
    }
    // svm
    if (SupportedSVMNetworks.includes(paymentRequirements.network)) {
      const svmClient = isMultiNetworkSigner(client) ? client.svm : client;
      if (!isSvmSignerWallet(svmClient)) {
        throw new Error("Invalid svm wallet client provided");
      }

      return await createPaymentHeaderExactSVM(
        svmClient,
        x402Version,
        paymentRequirements,
      );
    }
    throw new Error("Unsupported network");
  }

  // deferred scheme
  if (
    paymentRequirements.scheme === DEFERRRED_SCHEME &&
    SupportedEVMNetworks.includes(paymentRequirements.network)
  ) {
    const evmClient = isMultiNetworkSigner(client) ? client.evm : client;

    if (!isEvmSignerWallet(evmClient)) {
      throw new Error("Invalid evm wallet client provided");
    }

    return await createPaymentHeaderDeferredEVM(evmClient, x402Version, paymentRequirements);
  }

  throw new Error("Unsupported scheme");
}
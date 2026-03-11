import { createPaymentHeader as createPaymentHeaderExactEVM } from "../schemes/exact/evm/client";
import { createPaymentHeader as createPaymentHeaderExactSVM } from "../schemes/exact/svm/client";
import { createPaymentHeader as createPaymentHeaderExactAVM } from "../schemes/exact/avm/client";
import { isEvmSignerWallet, isMultiNetworkSigner, isSvmSignerWallet, isAvmSignerWallet, MultiNetworkSigner, Signer, SupportedEVMNetworks, SupportedSVMNetworks, SupportedAVMNetworks } from "../types/shared";
import { AlgorandClient } from "../schemes/exact/avm/types";
import { PaymentRequirements } from "../types/verify";
import { X402Config } from "../types/config";

/**
 * Creates a payment header based on the provided client and payment requirements.
 *
 * @param client - The signer wallet instance used to create the payment header
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @param config - Optional configuration for X402 operations (e.g., custom RPC URLs)
 * @returns A promise that resolves to the created payment header string
 */
export async function createPaymentHeader(
  client: Signer | MultiNetworkSigner,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
  config?: X402Config,
): Promise<string> {
  // exact scheme
  if (paymentRequirements.scheme === "exact") {
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
        config,
      );
    }

    // avm (Algorand)
    if (SupportedAVMNetworks.includes(paymentRequirements.network)) {
      const avmClient = isMultiNetworkSigner(client) ? client.avm : client;
      if (!isAvmSignerWallet(avmClient)) {
        throw new Error("Invalid avm wallet client provided");
      }

      // Construct AlgorandClient from wallet's client and network from requirements
      const algorandClient: AlgorandClient = {
        client: avmClient.client,
        network: paymentRequirements.network,
      };

      return await createPaymentHeaderExactAVM(
        algorandClient,
        avmClient,
        x402Version,
        paymentRequirements,
      );
    }
    throw new Error("Unsupported network");
  }
  throw new Error("Unsupported scheme");
}
import { isEvmSignerWallet, isHederaSignerWallet, isMultiNetworkSigner, isSvmSignerWallet, MultiNetworkSigner, Signer } from "../types/shared";
import { getNetworkFamily } from "../types/shared/network";
import { strategy } from "../shared/strategy";
import { PaymentRequirements } from "../types/verify";
import { X402Config } from "../types/config";
import { HederaSigner } from "../shared/hedera/wallet";

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
  client: Signer | MultiNetworkSigner | HederaSigner,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
  config?: X402Config,
): Promise<string> {
  if (paymentRequirements.scheme !== "exact") {
    throw new Error("Unsupported scheme");
  }

  const family = getNetworkFamily(paymentRequirements.network);
  if (family === "evm") {
    const evmClient = isMultiNetworkSigner(client) ? client.evm : client;
    if (!isEvmSignerWallet(evmClient)) {
      throw new Error("Invalid evm wallet client provided");
    }
    return await strategy.createPaymentHeader.evm(evmClient, x402Version, paymentRequirements);
  }

  if (family === "svm") {
    const svmClient = isMultiNetworkSigner(client) ? client.svm : client;
    if (!isSvmSignerWallet(svmClient)) {
      throw new Error("Invalid svm wallet client provided");
    }
    return await strategy.createPaymentHeader.svm(svmClient, x402Version, paymentRequirements, config);
  }

  if (family === "hedera") {
    const hederaClient = isMultiNetworkSigner(client) ? client.hedera : client;
    if (!isHederaSignerWallet(hederaClient)) {
      throw new Error("Invalid hedera wallet client provided");
    }
    return await strategy.createPaymentHeader.hedera(hederaClient, x402Version, paymentRequirements);
  }

  throw new Error("Unsupported network");
}
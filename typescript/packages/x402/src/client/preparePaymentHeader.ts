import { Address } from "viem";
import { Address as SolanaAddress } from "@solana/kit";
import { preparePaymentHeader as preparePaymentHeaderExactEVM } from "../schemes/exact/evm/client";
import { SupportedEVMNetworks, SupportedSVMNetworks, SupportedHederaNetworks } from "../types/shared";
import { PaymentRequirements, UnsignedPaymentPayload } from "../types/verify";

/**
 * Prepares a payment header with the given sender address and payment requirements.
 *
 * @param from - The sender's address from which the payment will be made
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns An unsigned payment payload that can be used to create a payment header
 */
export function preparePaymentHeader(
  from: Address | SolanaAddress | string,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): UnsignedPaymentPayload {
  if (paymentRequirements.scheme === "exact") {
    // evm
    if (SupportedEVMNetworks.includes(paymentRequirements.network)) {
      return preparePaymentHeaderExactEVM(from as Address, x402Version, paymentRequirements);
    }

    // svm and hedera don't currently have prepare functions
    // they handle payment creation directly in their createPaymentHeader functions
    if (SupportedSVMNetworks.includes(paymentRequirements.network) || 
        SupportedHederaNetworks.includes(paymentRequirements.network)) {
      throw new Error("Use createPaymentHeader directly for SVM and Hedera networks");
    }
  }

  throw new Error("Unsupported scheme or network");
}

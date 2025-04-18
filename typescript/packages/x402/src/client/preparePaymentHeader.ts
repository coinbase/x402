import { Address } from "viem";
import { preparePaymentHeader as preparePaymentHeaderExactEVM } from "../schemes/exact/evm/client";
import { SupportedEVMNetworks } from "../types/shared";
import { PaymentRequirements, UnsignedPaymentPayload } from "../types/verify";

/**
 * Prepares a payment header with the given sender address and payment requirements.
 * 
 * @param from - The sender's address from which the payment will be made
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns An unsigned payment payload that can be used to create a payment header
 */
export function preparePaymentHeader(
  from: Address,
  paymentRequirements: PaymentRequirements,
): UnsignedPaymentPayload {
  if (
    paymentRequirements.scheme === "exact" &&
    SupportedEVMNetworks.includes(paymentRequirements.network)
  ) {
    return preparePaymentHeaderExactEVM(from, paymentRequirements);
  }

  throw new Error("Unsupported scheme");
}
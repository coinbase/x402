import { Address } from "viem";
import { preparePaymentHeader as preparePaymentHeaderExactEVM } from "../schemes/exact/evm/client";
import { preparePaymentHeader as preparePaymentHeaderDeferredEVM } from "../schemes/deferred/evm/client";
import { SupportedEVMNetworks } from "../types/shared";
import { PaymentRequirements, UnsignedPaymentPayload } from "../types/verify";
import { DEFERRRED_SCHEME } from "../types/verify/schemes/deferred";
import { EXACT_SCHEME } from "../types/verify/schemes/exact";

/**
 * Prepares a payment header with the given sender address and payment requirements.
 * Only supports exact scheme. For deferred scheme, use preparePaymentHeaderAsync.
 * 
 * @param from - The sender's address from which the payment will be made
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns An unsigned payment payload that can be used to create a payment header
 */
export function preparePaymentHeader(
  from: Address,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): UnsignedPaymentPayload {
  if (
    paymentRequirements.scheme === EXACT_SCHEME &&
    SupportedEVMNetworks.includes(paymentRequirements.network)
  ) {
    return preparePaymentHeaderExactEVM(from, x402Version, paymentRequirements);
  }

  throw new Error("Unsupported scheme");
}

/**
 * Prepares a payment header with the given sender address and payment requirements.
 * Async version of preparePaymentHeader that supports exact and deferred schemes.
 *
 * @param from - The sender's address from which the payment will be made
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns An unsigned payment payload that can be used to create a payment header
 */
export function preparePaymentHeaderAsync(
  from: Address,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<UnsignedPaymentPayload> {

  if (
    paymentRequirements.scheme === EXACT_SCHEME &&
    SupportedEVMNetworks.includes(paymentRequirements.network)
  ) {
    return Promise.resolve(preparePaymentHeaderExactEVM(from, x402Version, paymentRequirements));
  }

  if (
    paymentRequirements.scheme === DEFERRRED_SCHEME &&
    SupportedEVMNetworks.includes(paymentRequirements.network)
  ) {
    return preparePaymentHeaderDeferredEVM(from, x402Version, paymentRequirements);
  }

  throw new Error("Unsupported scheme");
}
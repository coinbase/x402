import { PaymentRequirements } from "../types";
import { getUsdcAddressForChain } from "../shared/evm";
import { getNetworkId } from "../shared/network";

/**
 * Default selector for payment requirements.
 * Default behavior is to select the first payment requirement that has a USDC asset.
 * If no USDC payment requirement is found, the first payment requirement is selected.
 * 
 * @param paymentRequirements - The payment requirements to select from.
 * @returns The payment requirement that is the most appropriate for the user.
 */
export function selectPaymentRequirements(paymentRequirements: PaymentRequirements[]): PaymentRequirements {
  const usdcPaymentRequirement = paymentRequirements.find(requirement => requirement.scheme === "exact" && requirement.asset === getUsdcAddressForChain(getNetworkId(requirement.network)));
  if (usdcPaymentRequirement) {
    return usdcPaymentRequirement;
  }
  return paymentRequirements[0];
}

/**
 * Selector for payment requirements.
 * 
 * @param paymentRequirements - The payment requirements to select from.
 * @returns The payment requirement that is the most appropriate for the user.
 */
export type PaymentRequirementsSelector = (paymentRequirements: PaymentRequirements[]) => PaymentRequirements;

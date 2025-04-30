import { Network, PaymentRequirements } from "../types";
import { getUsdcAddressForChain } from "../shared/evm";
import { getNetworkId } from "../shared/network";

/**
 * Default selector for payment requirements.
 * Default behavior is to select the first payment requirement that has a USDC asset.
 * If no USDC payment requirement is found, the first payment requirement is selected.
 * 
 * @param paymentRequirements - The payment requirements to select from.
 * @param network - The network to check against. If not provided, the network will not be checked.
 * @returns The payment requirement that is the most appropriate for the user.
 */
export function selectPaymentRequirements(paymentRequirements: PaymentRequirements[], network?: Network): PaymentRequirements {
  const usdcPaymentRequirement = paymentRequirements.find(requirement => {
    const isExpectedScheme = requirement.scheme === "exact";
    const isExpectedAsset = requirement.asset === getUsdcAddressForChain(getNetworkId(requirement.network));
    // If the chain is not resolveable, we skip the check. Otherwise, we check if our connected chain is the expected chain.
    const isExpectedChain = !network || network == requirement.network;

    return isExpectedScheme && isExpectedAsset && isExpectedChain;
  });

  if (usdcPaymentRequirement) {
    return usdcPaymentRequirement;
  }

  return paymentRequirements[0];
}

/**
 * Selector for payment requirements.
 * 
 * @param paymentRequirements - The payment requirements to select from.
 * @param network - The network to check against. If not provided, the network will not be checked.
 * @returns The payment requirement that is the most appropriate for the user.
 */
export type PaymentRequirementsSelector = (paymentRequirements: PaymentRequirements[], network?: Network) => PaymentRequirements;

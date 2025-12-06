import { Network, PaymentRequirements } from "../types";
import { getUsdcChainConfigForChain } from "../shared/evm";
import { getNumericNetworkId } from "../shared/network";

/**
 * Default selector for payment requirements.
 * Default behavior is to select the first payment requirement that has a USDC asset.
 * If no USDC payment requirement is found, the first payment requirement is selected.
 *
 * @param paymentRequirements - The payment requirements to select from.
 * @param network - The network to check against. If not provided, the network will not be checked.
 * @param scheme - The scheme to check against. If not provided, the scheme will not be checked.
 * @returns The payment requirement that is the most appropriate for the user.
 */
export function selectPaymentRequirements(paymentRequirements: PaymentRequirements[], network?: Network | Network[], scheme?: "exact"): PaymentRequirements {
  // Filter down to the scheme/network if provided
  const broadlyAcceptedPaymentRequirements = paymentRequirements.filter(requirement => {
    // If the scheme is not provided, we accept any scheme.
    const isExpectedScheme = !scheme || requirement.scheme === scheme;
    // If the chain is not provided, we accept any chain.
    const isExpectedChain = !network || (Array.isArray(network) ? network.includes(requirement.network) : network == requirement.network);

    return isExpectedScheme && isExpectedChain;
  });

  // Filter down to USDC requirements
  const usdcRequirements = broadlyAcceptedPaymentRequirements.filter(requirement => {
    // For Starknet networks, check against hardcoded USDC addresses
    if (requirement.network === "starknet" || requirement.network === "starknet-sepolia") {
      const starknetUsdc = requirement.network === "starknet" 
        ? "0x053C91253BC9682c04929cA02ED00b3E423f6710D2ee7e0D5EBB06F3eCF368A8"
        : "0x053b40A647CEDfca6cA84f542A0fe36736031905A9639a7f19A3C1e66bFd5080";
      return requirement.asset === starknetUsdc;
    }
    
    // For EVM/SVM networks, use the existing logic
    try {
      const chainId = getNumericNetworkId(requirement.network);
      return requirement.asset === getUsdcChainConfigForChain(chainId)?.usdcAddress;
    } catch {
      return false;
    }
  });

  // Prioritize USDC requirements if available
  if (usdcRequirements.length > 0) {
    return usdcRequirements[0];
  }
  // If no USDC requirements are found, return the first broadly accepted requirement.
  if (broadlyAcceptedPaymentRequirements.length > 0) {
    return broadlyAcceptedPaymentRequirements[0];
  }
  // If no matching requirements are found, return the first requirement.
  return paymentRequirements[0];
}

/**
 * Selector for payment requirements.
 *
 * @param paymentRequirements - The payment requirements to select from.
 * @param network - The network to check against. If not provided, the network will not be checked.
 * @param scheme - The scheme to check against. If not provided, the scheme will not be checked.
 * @returns The payment requirement that is the most appropriate for the user.
 */
export type PaymentRequirementsSelector = (paymentRequirements: PaymentRequirements[], network?: Network | Network[], scheme?: "exact") => PaymentRequirements;


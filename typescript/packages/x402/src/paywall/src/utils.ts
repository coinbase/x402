import { Network, PaymentRequirements } from "../../types";

/**
 * Selects the most appropriate payment requirement from a list
 *
 * @param paymentRequirements - The payment requirements to select from
 * @param network - The network to match against
 * @param scheme - The payment scheme to match against
 * @returns The selected payment requirement
 */
export function selectPaymentRequirements(
  paymentRequirements: PaymentRequirements | PaymentRequirements[],
  network?: Network,
  scheme: string = "exact",
): PaymentRequirements {
  const requirementsArray = Array.isArray(paymentRequirements)
    ? paymentRequirements
    : [paymentRequirements];

  const matching = requirementsArray.filter(req => {
    const schemeMatch = !scheme || req.scheme === scheme;
    const networkMatch = !network || req.network === network;
    return schemeMatch && networkMatch;
  });

  return matching.length > 0 ? matching[0] : requirementsArray[0];
}

/**
 * Ensures a valid amount is set in payment requirements
 *
 * @param paymentRequirements - The payment requirements to validate and update
 * @returns Updated payment requirements with valid amount
 */
export function ensureValidAmount(paymentRequirements: PaymentRequirements): PaymentRequirements {
  const updatedRequirements = JSON.parse(JSON.stringify(paymentRequirements));

  if (window.x402?.amount) {
    try {
      const amountInBaseUnits = Math.round(window.x402.amount * 1_000_000);
      updatedRequirements.maxAmountRequired = amountInBaseUnits.toString();
    } catch (error) {
      console.error("Failed to parse amount:", error);
    }
  }

  if (
    !updatedRequirements.maxAmountRequired ||
    !/^\d+$/.test(updatedRequirements.maxAmountRequired)
  ) {
    updatedRequirements.maxAmountRequired = "10000";
  }

  return updatedRequirements;
}

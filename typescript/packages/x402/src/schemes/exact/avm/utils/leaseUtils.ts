import { PaymentRequirements } from "../../../../types/verify";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils";

/**
 * Creates a lease field from payment requirements to prevent replay attacks
 *
 * @param paymentRequirements - The payment requirements to hash
 * @returns A Uint8Array containing the lease field
 */
export function createLeaseFromPaymentRequirements(
  paymentRequirements: PaymentRequirements,
): Uint8Array {
  // Create a string representation of the payment requirements
  const requirementsString = JSON.stringify({
    scheme: paymentRequirements.scheme,
    network: paymentRequirements.network,
    resource: paymentRequirements.resource ?? null,
    mimeType: paymentRequirements.mimeType ?? null,
    payTo: paymentRequirements.payTo,
    maxAmountRequired: paymentRequirements.maxAmountRequired,
    asset: paymentRequirements.asset,
  });

  // Hash the string using SHA-256
  const hashBuffer = sha256(utf8ToBytes(requirementsString));

  // Return the hash as a Uint8Array
  return new Uint8Array(hashBuffer);
}

/**
 * Verifies that a lease field matches the hash of the payment requirements
 *
 * @param lease - The lease field to verify
 * @param paymentRequirements - The payment requirements to hash
 * @returns True if the lease matches the hash of the payment requirements
 */
export function verifyLease(
  lease: Uint8Array | Buffer,
  paymentRequirements: PaymentRequirements,
): boolean {
  const expectedLease = createLeaseFromPaymentRequirements(paymentRequirements);

  const leaseArray = lease instanceof Uint8Array ? lease : new Uint8Array(lease);

  if (leaseArray.length !== expectedLease.length) {
    return false;
  }

  for (let i = 0; i < leaseArray.length; i += 1) {
    if (leaseArray[i] !== expectedLease[i]) {
      return false;
    }
  }

  return true;
}

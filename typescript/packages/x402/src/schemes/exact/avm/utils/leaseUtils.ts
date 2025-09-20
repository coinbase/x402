import { PaymentRequirements } from "../../../../types/verify";
import { createHash, timingSafeEqual } from "crypto";

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
  const hash = createHash("sha256").update(requirementsString).digest();

  // Return the hash as a Uint8Array
  return new Uint8Array(hash);
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

  const leaseBuffer = Buffer.isBuffer(lease) ? lease : Buffer.from(lease);
  const expectedBuffer = Buffer.from(expectedLease);

  if (leaseBuffer.length !== expectedBuffer.length) {
    return false;
  }

  try {
    return timingSafeEqual(leaseBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

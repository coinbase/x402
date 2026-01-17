/**
 * Configuration types for offer/receipt signing
 *
 * Offers prove payment requirements came from the resource server.
 * Receipts prove service was delivered after payment.
 */

import { PaymentRequirements } from "./payments";

/**
 * Signer interface for offer/receipt signing
 *
 * Implementations can use any signing backend:
 * - In-memory keys (for testing)
 * - HSM/TPM
 * - Remote signing service (e.g., Thirdweb server wallet)
 */
export interface OfferReceiptSigner {
  /** Key identifier DID (e.g., did:web:api.example.com#key-1) */
  kid: string;

  /** Signature format */
  format: "jws" | "eip712";

  /**
   * Sign an offer payload
   *
   * @param resourceUrl - The resource URL being paid for
   * @param requirements - The payment requirements to sign
   * @returns Signed offer object
   */
  signOffer(
    resourceUrl: string,
    requirements: PaymentRequirements,
  ): Promise<
    | { format: "jws"; signature: string }
    | { format: "eip712"; payload: Record<string, unknown>; signature: string }
  >;

  /**
   * Sign a receipt payload
   *
   * @param resourceUrl - The resource URL that was paid for
   * @param payer - The payer identifier (wallet address)
   * @returns Signed receipt object
   */
  signReceipt(
    resourceUrl: string,
    payer: string,
  ): Promise<
    | { format: "jws"; signature: string }
    | { format: "eip712"; payload: Record<string, unknown>; signature: string }
  >;
}

/**
 * Configuration for offer/receipt signing in HTTP middleware
 */
export interface OfferReceiptConfig {
  /**
   * Signer for offers (signs PaymentRequirements)
   * If not provided, offers will not be signed
   */
  offerSigner?: OfferReceiptSigner;

  /**
   * Signer for receipts (signs service delivery confirmation)
   * If not provided, receipts will not be generated
   * Can be the same as offerSigner
   */
  receiptSigner?: OfferReceiptSigner;
}

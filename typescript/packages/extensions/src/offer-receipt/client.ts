/**
 * Client-side utilities for extracting offers and receipts from x402 responses
 *
 * Provides utilities for clients who want to access signed offers and receipts
 * from x402 payment flows. Useful for verified reviews, audit trails, and dispute resolution.
 *
 * @see README.md for usage examples (raw and wrapper flows)
 * @see examples/typescript/clients/receipt-attestation/ for complete attestation example
 */

import { decodePaymentResponseHeader } from "@x402/core/http";
import type { PaymentPayload, PaymentRequired, PaymentRequirements, SettleResponse } from "@x402/core/types";
import { OFFER_RECEIPT, type OfferPayload, type SignedOffer, type SignedReceipt } from "./types";
import { extractOfferPayload, extractReceiptPayload } from "./signing";

/**
 * Context passed from wrapFetchWithPayment's onPaymentComplete callback
 */
export interface PaymentCompleteContext {
  paymentRequired: PaymentRequired;
  paymentPayload: PaymentPayload;
  response: Response;
}

/**
 * Metadata extracted from an x402 payment flow
 */
export interface OfferReceiptMetadata {
  /** All signed offers from the 402 response */
  offers?: SignedOffer[];
  /** The accepted offer used for payment (matched by acceptIndex or terms) */
  acceptedOffer?: SignedOffer;
  /** Signed receipt from settlement response */
  receipt?: SignedReceipt;
  /** The full settlement response */
  settlementResponse?: SettleResponse;
}

/**
 * Response type with offerReceipt metadata attached
 */
export type OfferReceiptResponse = Response & { offerReceipt?: OfferReceiptMetadata };

/**
 * A signed offer with its decoded payload fields at the top level.
 * Combines the signed offer metadata with the decoded payload for easy access.
 */
export interface DecodedOffer extends OfferPayload {
  /** The original signed offer (for passing to other functions or downstream systems) */
  signedOffer: SignedOffer;
  /** The signature format used */
  format: "jws" | "eip712";
  /** Index into accepts[] array (hint for matching), may be undefined */
  acceptIndex?: number;
}

/**
 * Structure of offer-receipt extension data in PaymentRequired.extensions
 */
interface OfferReceiptExtensionInfo {
  info?: {
    offers?: SignedOffer[];
    receipt?: SignedReceipt;
  };
}

// ============================================================================
// Internal Functions (not exported)
// ============================================================================

/**
 * Find the accepted offer from the offers array.
 * Used internally by createOfferReceiptExtractor.
 *
 * Uses acceptIndex as a hint but verifies the payload matches the accepted terms.
 */
function findAcceptedOffer(
  offers: SignedOffer[],
  acceptedIndex: number,
  accepted: PaymentPayload["accepted"],
): SignedOffer | undefined {
  for (const offer of offers) {
    // Use acceptIndex as a hint
    if (offer.acceptIndex !== acceptedIndex) continue;

    // Verify payload matches accepted terms
    const payload = extractOfferPayload(offer);
    if (
      payload.network === accepted.network &&
      payload.scheme === accepted.scheme &&
      payload.asset === accepted.asset &&
      payload.payTo === accepted.payTo &&
      payload.amount === accepted.amount
    ) {
      return offer;
    }
  }
  return undefined;
}

// ============================================================================
// Exported Functions
// ============================================================================

/**
 * Verify that a receipt's payload matches the offer and payer.
 *
 * This performs basic payload field verification:
 * - resourceUrl matches the offer
 * - network matches the offer
 * - payer matches one of the client's wallet addresses
 * - issuedAt is recent (within maxAgeSeconds)
 *
 * NOTE: This does NOT verify the signature or key binding. See the comment
 * in the receipt-attestation example for guidance on full verification.
 *
 * @param receipt - The signed receipt from the server
 * @param offer - The decoded offer that was accepted
 * @param payerAddresses - Array of the client's wallet addresses (EVM, SVM, etc.)
 * @param maxAgeSeconds - Maximum age of receipt in seconds (default: 3600 = 1 hour)
 * @returns true if all checks pass, false otherwise
 */
export function verifyReceiptMatchesOffer(
  receipt: SignedReceipt,
  offer: DecodedOffer,
  payerAddresses: string[],
  maxAgeSeconds: number = 3600,
): boolean {
  const payload = extractReceiptPayload(receipt);

  const resourceUrlMatch = payload.resourceUrl === offer.resourceUrl;
  const networkMatch = payload.network === offer.network;
  const payerMatch = payerAddresses.some(
    (addr) => payload.payer.toLowerCase() === addr.toLowerCase()
  );
  const issuedRecently = Math.floor(Date.now() / 1000) - payload.issuedAt < maxAgeSeconds;

  return resourceUrlMatch && networkMatch && payerMatch && issuedRecently;
}

/**
 * Extract signed offers from a PaymentRequired response.
 *
 * Call this immediately after receiving a 402 response to save the offers.
 * If the settlement response doesn't include a receipt, you'll still have
 * the offers for attestation purposes.
 *
 * @param paymentRequired - The PaymentRequired object from the 402 response
 * @returns Array of signed offers, or empty array if none present
 */
export function extractOffersFromPaymentRequired(paymentRequired: PaymentRequired): SignedOffer[] {
  const extData = paymentRequired.extensions?.[OFFER_RECEIPT] as
    | OfferReceiptExtensionInfo
    | undefined;
  return extData?.info?.offers ?? [];
}

/**
 * Decode all signed offers and return them with payload fields at the top level.
 *
 * Use this to inspect offer details (network, amount, etc.) for selection.
 * JWS decoding is cheap (base64 decode, no crypto), so decoding all offers
 * upfront is fine even with multiple offers.
 *
 * @param offers - Array of signed offers from extractOffersFromPaymentRequired
 * @returns Array of decoded offers with payload fields at top level
 */
export function decodeSignedOffers(offers: SignedOffer[]): DecodedOffer[] {
  return offers.map((offer) => {
    const payload = extractOfferPayload(offer);
    return {
      // Spread payload fields at top level
      ...payload,
      // Include metadata
      signedOffer: offer,
      format: offer.format,
      acceptIndex: offer.acceptIndex,
    };
  });
}

/**
 * Find the accepts[] entry that matches a signed or decoded offer.
 *
 * Use this after selecting an offer to get the PaymentRequirements
 * object needed for createPaymentPayload.
 *
 * Uses the offer's acceptIndex as a hint for faster lookup, but verifies
 * the payload matches in case indices got out of sync.
 *
 * @param offer - A DecodedOffer (from decodeSignedOffers) or SignedOffer
 * @param accepts - Array of payment requirements from paymentRequired.accepts
 * @returns The matching PaymentRequirements, or undefined if not found
 */
export function findAcceptsObjectFromSignedOffer(
  offer: DecodedOffer | SignedOffer,
  accepts: PaymentRequirements[],
): PaymentRequirements | undefined {
  // Check if it's a DecodedOffer (has signedOffer property) or SignedOffer
  const isDecoded = "signedOffer" in offer;
  const payload = isDecoded ? offer : extractOfferPayload(offer);
  const acceptIndex = isDecoded ? offer.acceptIndex : offer.acceptIndex;

  // Use acceptIndex as a hint - check that index first
  if (acceptIndex !== undefined && acceptIndex < accepts.length) {
    const hinted = accepts[acceptIndex];
    if (
      hinted.network === payload.network &&
      hinted.scheme === payload.scheme &&
      hinted.asset === payload.asset &&
      hinted.payTo === payload.payTo &&
      hinted.amount === payload.amount
    ) {
      return hinted;
    }
  }

  // Fall back to searching all accepts
  return accepts.find(
    (req) =>
      req.network === payload.network &&
      req.scheme === payload.scheme &&
      req.asset === payload.asset &&
      req.payTo === payload.payTo &&
      req.amount === payload.amount
  );
}

/**
 * Extract signed receipt from a successful payment response.
 *
 * Call this after a successful payment to get the server's signed receipt.
 * The receipt proves the service was delivered after payment.
 *
 * @param response - The Response object from the successful request
 * @returns The signed receipt, or undefined if not present
 */
export function extractReceiptFromResponse(response: Response): SignedReceipt | undefined {
  const paymentResponseHeader =
    response.headers.get("PAYMENT-RESPONSE") || response.headers.get("X-PAYMENT-RESPONSE");

  if (!paymentResponseHeader) {
    return undefined;
  }

  try {
    const settlementResponse = decodePaymentResponseHeader(paymentResponseHeader) as SettleResponse;
    const receiptExtData = settlementResponse.extensions?.[OFFER_RECEIPT] as
      | OfferReceiptExtensionInfo
      | undefined;
    return receiptExtData?.info?.receipt;
  } catch {
    return undefined;
  }
}

/**
 * Creates an extractor function for use with wrapFetchWithPayment's onPaymentComplete option.
 * The extractor attaches offerReceipt metadata to the response object.
 *
 * NOTE: This function is not yet usable. The x402 wrapFetchWithPayment wrapper does not
 * currently support the onPaymentComplete callback or extension handling. Use the raw
 * flow functions (extractOffersFromPaymentRequired, extractReceiptFromResponse) instead
 * until the wrapper is updated.
 *
 * @returns Extractor function for onPaymentComplete callback
 */
export function createOfferReceiptExtractor(): (context: PaymentCompleteContext) => void {
  return (context: PaymentCompleteContext): void => {
    const { paymentRequired, paymentPayload, response } = context;
    const metadata: OfferReceiptMetadata = {};

    // Extract offers from paymentRequired.extensions["offer-receipt"].info.offers
    const extData = paymentRequired.extensions?.[OFFER_RECEIPT] as
      | OfferReceiptExtensionInfo
      | undefined;
    const offers = extData?.info?.offers;

    if (offers && offers.length > 0) {
      metadata.offers = offers;

      // Find the accepted offer
      // The accepted index is determined by which accepts[] entry was chosen
      const acceptedIndex = paymentRequired.accepts.findIndex(
        (req) =>
          req.network === paymentPayload.accepted.network &&
          req.scheme === paymentPayload.accepted.scheme &&
          req.asset === paymentPayload.accepted.asset &&
          req.payTo === paymentPayload.accepted.payTo &&
          req.amount === paymentPayload.accepted.amount,
      );

      if (acceptedIndex >= 0) {
        const acceptedOffer = findAcceptedOffer(offers, acceptedIndex, paymentPayload.accepted);
        if (acceptedOffer) {
          metadata.acceptedOffer = acceptedOffer;
        }
      }
    }

    // Extract settlement response and receipt from response header
    try {
      const paymentResponse =
        response.headers.get("PAYMENT-RESPONSE") || response.headers.get("X-PAYMENT-RESPONSE");

      if (paymentResponse) {
        const settlementResponse = decodePaymentResponseHeader(paymentResponse) as SettleResponse;
        metadata.settlementResponse = settlementResponse;

        // Extract receipt from settlement response extensions
        const receiptExtData = settlementResponse.extensions?.[OFFER_RECEIPT] as
          | OfferReceiptExtensionInfo
          | undefined;
        if (receiptExtData?.info?.receipt) {
          metadata.receipt = receiptExtData.info.receipt;
        }
      }
    } catch {
      // Header parsing failed - continue without settlement data
    }

    // Attach metadata to response
    (response as OfferReceiptResponse).offerReceipt = metadata;
  };
}

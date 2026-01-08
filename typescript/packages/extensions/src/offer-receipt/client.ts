/**
 * Client-side utilities for extracting offers and receipts from x402 responses
 *
 * This module provides utilities for clients who want to access signed offers
 * and receipts from x402 payment flows. These are useful for:
 * - Creating verified user reviews (OMATrust)
 * - Audit trails and compliance
 * - Dispute resolution
 *
 * @example
 * ```typescript
 * import { wrapFetchWithPayment } from "@x402/fetch";
 * import { createOfferReceiptExtractor, type OfferReceiptResponse } from "@x402/extensions/offer-receipt";
 *
 * const fetchWithPay = wrapFetchWithPayment(fetch, client, {
 *   onPaymentComplete: createOfferReceiptExtractor()
 * });
 * const response = await fetchWithPay(url, { method: "GET" }) as OfferReceiptResponse;
 *
 * if (response.offerReceipt?.receipt) {
 *   // Use receipt for verified review, audit trail, etc.
 * }
 * ```
 */

import { decodePaymentResponseHeader } from "@x402/core/http";
import type { PaymentPayload, PaymentRequired, SettleResponse } from "@x402/core/types";
import type { SignedOffer, SignedReceipt } from "./types";

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
  /** The accepted offer used for payment */
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
 * Creates an extractor function for use with wrapFetchWithPayment's onPaymentComplete option.
 * The extractor attaches offerReceipt metadata to the response object.
 *
 * @example
 * ```typescript
 * const fetchWithPay = wrapFetchWithPayment(fetch, client, {
 *   onPaymentComplete: createOfferReceiptExtractor()
 * });
 * const response = await fetchWithPay(url, { method: "GET" }) as OfferReceiptResponse;
 * ```
 */
export function createOfferReceiptExtractor(): (context: PaymentCompleteContext) => void {
  return (context: PaymentCompleteContext): void => {
    const { paymentRequired, paymentPayload, response } = context;
    const metadata: OfferReceiptMetadata = {};

    // Extract offers from paymentRequired.accepts[].signedOffer
    const offers: SignedOffer[] = [];
    for (const req of paymentRequired.accepts) {
      if (req.signedOffer) {
        offers.push(req.signedOffer as SignedOffer);
      }
    }
    if (offers.length > 0) {
      metadata.offers = offers;
    }

    // Extract accepted offer from paymentPayload.accepted.signedOffer
    if (paymentPayload.accepted?.signedOffer) {
      metadata.acceptedOffer = paymentPayload.accepted.signedOffer as SignedOffer;
    }

    // Extract settlement response and receipt from response header
    try {
      const paymentResponse =
        response.headers.get("PAYMENT-RESPONSE") || response.headers.get("X-PAYMENT-RESPONSE");

      if (paymentResponse) {
        const settlementResponse = decodePaymentResponseHeader(
          paymentResponse,
        ) as SettleResponse & { receipt?: SignedReceipt };
        metadata.settlementResponse = settlementResponse;

        if (settlementResponse.receipt) {
          metadata.receipt = settlementResponse.receipt;
        }
      }
    } catch {
      // Header parsing failed - continue without settlement data
    }

    // Attach metadata to response
    (response as OfferReceiptResponse).offerReceipt = metadata;
  };
}

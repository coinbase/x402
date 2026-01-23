/**
 * OMATrust User Review Attestation
 *
 * Creates OMATrust-compatible user review attestations from x402 receipts or offers.
 * This enables "Verified Purchase" badges for reviews, similar to centralized ecommerce sites and app stores.
 *
 * To support other trust systems, create a similar module with the appropriate
 * types and functions for that system.
 */

import {
  extractPayload,
  parseNetworkToCAIP2,
  type SignedOffer,
  type SignedReceipt,
  type OfferPayload,
  type ReceiptPayload,
} from "@x402/extensions/offer-receipt";

// ============================================================================
// Proof Source Types
// ============================================================================

/**
 * Unified proof source for attestations
 */
export interface ProofSource {
  /** Type of proof */
  type: "receipt" | "offer";
  /** The signed proof object */
  proof: SignedOffer | SignedReceipt;
  /** Payer's wallet address */
  payer: string;
  /** Network identifier (CAIP-2 format preferred, legacy v1 also supported) */
  network: string;
}

// ============================================================================
// Attestation Types
// ============================================================================

/**
 * Proof wrapper for OMATrust attestations
 */
export interface AttestationProof {
  proofType: "x402-receipt" | "x402-offer";
  proofPurpose: string;
  proofFormat: "jws" | "eip712";
  proofObject: unknown;
}

/**
 * OMATrust User Review attestation payload
 */
export interface OMATrustUserReview {
  attester: string;
  subject: string;
  ratingValue: 1 | 2 | 3 | 4 | 5;
  reviewBody?: string;
  issuedAt: number;
  proofs: AttestationProof[];
}

/**
 * Options for creating a user review
 */
export interface UserReviewOptions {
  ratingValue: 1 | 2 | 3 | 4 | 5;
  reviewBody?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Derive a payer DID from a wallet address and network
 */
export function derivePayerDid(payer: string, network: string): string {
  const caip2 = parseNetworkToCAIP2(network);
  const [namespace, reference] = caip2.split(":");
  return `did:pkh:${namespace}:${reference}:${payer}`;
}

/**
 * Derive a service DID from a resource URL
 */
export function deriveServiceDid(resourceUrl: string): string {
  try {
    const url = new URL(resourceUrl);
    return `did:web:${url.host}`;
  } catch {
    return `did:web:${resourceUrl}`;
  }
}

function getProofObject(proofSource: ProofSource): unknown {
  const proof = proofSource.proof;
  if (proof.format === "jws") {
    return proof.signature;
  }
  return {
    payload: (proof as { payload: unknown }).payload,
    signature: proof.signature,
  };
}

function buildProof(proofSource: ProofSource): AttestationProof {
  return {
    proofType: proofSource.type === "receipt" ? "x402-receipt" : "x402-offer",
    proofPurpose: "commercial-tx",
    proofFormat: proofSource.proof.format,
    proofObject: getProofObject(proofSource),
  };
}

function extractResourceUrl(proofSource: ProofSource): string {
  const payload = extractPayload<OfferPayload | ReceiptPayload>(proofSource.proof);
  return payload.resourceUrl;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Create an OMATrust User Review attestation from a signed receipt or offer
 *
 * @example
 * ```typescript
 * const review = createOMATrustUserReview(
 *   { type: "receipt", proof: receipt, payer: "0x...", network: "eip155:8453" },
 *   { ratingValue: 5, reviewBody: "Great service!" }
 * );
 * ```
 */
export function createOMATrustUserReview(
  proofSource: ProofSource,
  options: UserReviewOptions,
): OMATrustUserReview {
  const { ratingValue, reviewBody } = options;

  if (ratingValue < 1 || ratingValue > 5 || !Number.isInteger(ratingValue)) {
    throw new Error("ratingValue must be an integer between 1 and 5");
  }

  if (reviewBody && reviewBody.length > 500) {
    throw new Error("reviewBody must be 500 characters or less");
  }

  if (!proofSource.payer) {
    throw new Error("payer address is required for attestations");
  }

  const resourceUrl = extractResourceUrl(proofSource);

  const payload: OMATrustUserReview = {
    attester: derivePayerDid(proofSource.payer, proofSource.network),
    subject: deriveServiceDid(resourceUrl),
    ratingValue,
    issuedAt: Math.floor(Date.now() / 1000),
    proofs: [buildProof(proofSource)],
  };

  if (reviewBody) {
    payload.reviewBody = reviewBody;
  }

  return payload;
}

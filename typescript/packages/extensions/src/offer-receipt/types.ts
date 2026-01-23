/**
 * Type definitions for the x402 Offer/Receipt Extension
 *
 * Based on: x402/specs/extensions/extension-offer-and-receipt.md
 *
 * Offers prove payment requirements originated from a resource server.
 * Receipts prove service was delivered after payment (privacy-minimal).
 */

/**
 * Extension identifier constant
 */
export const OFFER_RECEIPT = "offer-receipt";

/**
 * Supported signature formats (§3.1)
 */
export type SignatureFormat = "jws" | "eip712";

// ============================================================================
// Signer Interface (from PR plan §2)
// ============================================================================

/**
 * Signer interface for pluggable signing backends
 */
export interface Signer {
  /** Key identifier DID (e.g., did:web:api.example.com#key-1) */
  kid: string;
  /** Sign payload and return signature string */
  sign: (payload: Uint8Array) => Promise<string>;
  /** Signature format */
  format: SignatureFormat;
}

/**
 * JWS-specific signer with algorithm info
 */
export interface JWSSigner extends Signer {
  format: "jws";
  /** JWS algorithm (e.g., ES256K, EdDSA) */
  algorithm: string;
}

/**
 * EIP-712 specific signer
 */
export interface EIP712Signer extends Signer {
  format: "eip712";
  /** Chain ID for EIP-712 domain */
  chainId: number;
}

// ============================================================================
// Offer Types (§4)
// ============================================================================

/**
 * Offer payload fields (§4.2)
 *
 * Required: resourceUrl, scheme, settlement, network, asset, payTo, amount
 * Optional: maxTimeoutSeconds, issuedAt
 */
export interface OfferPayload {
  /** The paid resource URL */
  resourceUrl: string;
  /** Payment scheme identifier (e.g., "exact") */
  scheme: string;
  /** Settlement type (e.g., "txid") */
  settlement: string;
  /** Blockchain network identifier (e.g., "eip155:8453") */
  network: string;
  /** Token contract address or "native" */
  asset: string;
  /** Recipient wallet address */
  payTo: string;
  /** Required payment amount */
  amount: string;
  /** Offer validity window in seconds (optional) */
  maxTimeoutSeconds?: number;
  /** Unix timestamp when offer was created (optional) */
  issuedAt?: number;
}

/**
 * Signed offer in JWS format (§3.1.1)
 *
 * "When format = 'jws': payload MUST be omitted"
 */
export interface JWSSignedOffer {
  format: "jws";
  /** JWS Compact Serialization string (header.payload.signature) */
  signature: string;
}

/**
 * Signed offer in EIP-712 format (§3.1.1)
 *
 * "When format = 'eip712': payload is REQUIRED"
 */
export interface EIP712SignedOffer {
  format: "eip712";
  /** The canonical payload fields */
  payload: OfferPayload;
  /** Hex-encoded ECDSA signature (0x-prefixed, 65 bytes: r+s+v) */
  signature: string;
}

/**
 * Union type for signed offers
 */
export type SignedOffer = JWSSignedOffer | EIP712SignedOffer;

// ============================================================================
// Receipt Types (§5)
// ============================================================================

/**
 * Receipt payload fields (§5.2)
 *
 * "The receipt is privacy-minimal and intentionally omits transaction
 *  references and economic terms to reduce correlation risk."
 *
 * Required: resourceUrl, payer, issuedAt
 * NOT included: amount, asset, network, transaction
 */
export interface ReceiptPayload {
  /** The paid resource URL */
  resourceUrl: string;
  /** Payer identifier (commonly a wallet address) */
  payer: string;
  /** Unix timestamp (seconds) when receipt was issued */
  issuedAt: number;
}

/**
 * Signed receipt in JWS format (§3.1.1)
 */
export interface JWSSignedReceipt {
  format: "jws";
  /** JWS Compact Serialization string */
  signature: string;
}

/**
 * Signed receipt in EIP-712 format (§3.1.1)
 */
export interface EIP712SignedReceipt {
  format: "eip712";
  /** The receipt payload */
  payload: ReceiptPayload;
  /** Hex-encoded ECDSA signature */
  signature: string;
}

/**
 * Union type for signed receipts
 */
export type SignedReceipt = JWSSignedReceipt | EIP712SignedReceipt;

// ============================================================================
// Type Guards
// ============================================================================

/**
 *
 * @param offer
 */
export function isJWSSignedOffer(offer: SignedOffer): offer is JWSSignedOffer {
  return offer.format === "jws";
}

/**
 *
 * @param offer
 */
export function isEIP712SignedOffer(offer: SignedOffer): offer is EIP712SignedOffer {
  return offer.format === "eip712";
}

/**
 *
 * @param receipt
 */
export function isJWSSignedReceipt(receipt: SignedReceipt): receipt is JWSSignedReceipt {
  return receipt.format === "jws";
}

/**
 *
 * @param receipt
 */
export function isEIP712SignedReceipt(receipt: SignedReceipt): receipt is EIP712SignedReceipt {
  return receipt.format === "eip712";
}

/**
 *
 * @param signer
 */
export function isJWSSigner(signer: Signer): signer is JWSSigner {
  return signer.format === "jws";
}

/**
 *
 * @param signer
 */
export function isEIP712Signer(signer: Signer): signer is EIP712Signer {
  return signer.format === "eip712";
}

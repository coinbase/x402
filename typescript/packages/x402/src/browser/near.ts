/**
 * x402 – NEAR browser wrapper (Skeleton)
 * - NEP-413 header signing (client auth)
 * - Canonical payload builder
 *
 * NOTE: This is a compiling stub. Replace TODO blocks with real logic.
 */

export type NearNetwork = "near-mainnet" | "near-testnet";

export interface NearCanonicalPayload {
  v: number;
  scheme: "exact";
  network: NearNetwork;
  resource: string;
  payTo: string; // merchant accountId
  asset: { standard: "native" } | { standard: "nep141"; contractId: string };
  amount: string; // yoctoNEAR or FT base units
  description?: string;
  mimeType?: string;
  validUntil?: number;
}

export interface NearWalletLike {
  signMessage(input: {
    message: Uint8Array;
    recipient: string;
    nonce: Uint8Array;
    callbackUrl?: string;
  }): Promise<{
    accountId: string;
    publicKey: string; // "ed25519:<base58>"
    signature: Uint8Array | string;
  }>;
}

export interface NearNep413Header {
  kind: "near/nep413";
  version: 1;
  network: NearNetwork;
  accountId: string;
  publicKey: string;
  recipient: string;
  nonce_b64: string;
  message_b64: string;
  signature_b64: string;
}

// ---- public API (stubs) -----------------------------------------------------

/**
 * Builds canonical message bytes from a NEAR payment payload
 *
 * @param payload - The NEAR canonical payment payload to encode
 * @returns The encoded message as a Uint8Array
 */
export function buildCanonicalMessageBytes(payload: NearCanonicalPayload): Uint8Array {
  // TODO: replace with deterministic key-sorted JSON bytes
  const enc = new TextEncoder();
  return enc.encode(JSON.stringify(payload));
}

/**
 * Creates a NEAR payment header by signing with a wallet
 *
 * @param _ - The NEAR wallet instance to use for signing
 * @param _0 - Options for creating the payment header
 * @param _0.network - The NEAR network (mainnet or testnet)
 * @param _0.recipient - The recipient account ID
 * @param _0.nonce32 - A 32-byte nonce for the signature
 * @param _0.payload - The payload bytes to sign
 * @param _0.callbackUrl - Optional callback URL for wallet redirect
 * @returns The encoded x402 header string
 */
export async function createNearPaymentHeaderWithWallet(
  _: NearWalletLike,
  _0: {
    network: NearNetwork;
    recipient: string;
    nonce32: Uint8Array;
    payload: Uint8Array;
    callbackUrl?: string;
  },
): Promise<string> {
  // TODO: call wallet.signMessage, normalize signature, encode header
  // Returning a placeholder header keeps the build green.
  const placeholder: NearNep413Header = {
    kind: "near/nep413",
    version: 1,
    network: _0.network,
    accountId: "todo.testnet",
    publicKey: "ed25519:TODO",
    recipient: _0.recipient,
    nonce_b64: "TODO",
    message_b64: "TODO",
    signature_b64: "TODO",
  };
  return encodeX402HeaderNear(placeholder);
}

/**
 * Quick helper to create a NEAR payment header with minimal parameters
 *
 * @param _ - The NEAR wallet instance to use for signing
 * @param _0 - Payment parameters
 * @param _0.network - The NEAR network (mainnet or testnet)
 * @param _0.recipient - The recipient account ID
 * @param _0.nonce32 - A 32-byte nonce for the signature
 * @param _0.resource - The resource being paid for
 * @param _0.payTo - The merchant account ID to pay
 * @param _0.amount - The payment amount in yoctoNEAR or token base units
 * @param _0.asset - The asset type (native NEAR or NEP-141 token)
 * @param _0.description - Optional payment description
 * @param _0.mimeType - Optional MIME type of the resource
 * @param _0.validUntil - Optional expiration timestamp
 * @returns The encoded x402 header string
 */
export async function quickNearHeader(
  _: NearWalletLike,
  _0: {
    network: NearNetwork;
    recipient: string;
    nonce32: Uint8Array;
    resource: string;
    payTo: string;
    amount: string;
    asset: NearCanonicalPayload["asset"];
    description?: string;
    mimeType?: string;
    validUntil?: number;
  },
): Promise<string> {
  // TODO: build payload -> createNearPaymentHeaderWithWallet
  return encodeX402HeaderNear({
    kind: "near/nep413",
    version: 1,
    network: _0.network,
    accountId: "todo.testnet",
    publicKey: "ed25519:TODO",
    recipient: _0.recipient,
    nonce_b64: "TODO",
    message_b64: "TODO",
    signature_b64: "TODO",
  });
}

// ---- utils (minimal, OK for skeleton) ---------------------------------------

/**
 * Encodes a NEAR NEP-413 header into x402 format
 *
 * @param h - The NEAR NEP-413 header to encode
 * @returns The encoded x402 header string
 */
export function encodeX402HeaderNear(h: NearNep413Header): string {
  const bytes = new TextEncoder().encode(JSON.stringify(h));
  const b64 = toBase64(bytes);
  const b64url = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `x402:${b64url}`;
}

/**
 * Converts a Uint8Array to base64 string
 *
 * @param bytes - The bytes to encode
 * @returns The base64-encoded string
 */
function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  // @ts-expect-error btoa is available in browser environment
  return btoa(s);
}

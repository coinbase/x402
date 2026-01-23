/**
 * Signing utilities for x402 Offer/Receipt
 *
 * This module consolidates:
 * - JCS (JSON Canonicalization Scheme) per RFC 8785
 * - JWS (JSON Web Signature) signing and extraction
 * - EIP-712 typed data signing
 * - Network/payload utilities
 *
 * Based on: x402/specs/extensions/extension-offer-and-receipt.md §3
 */

import * as jose from "jose";
import { hashTypedData, type Hex, type TypedDataDomain } from "viem";
import type { JWSSigner, OfferPayload, ReceiptPayload, SignedOffer, SignedReceipt } from "./types";
import {
  isJWSSignedOffer,
  isEIP712SignedOffer,
  isJWSSignedReceipt,
  isEIP712SignedReceipt,
  type JWSSignedOffer,
  type EIP712SignedOffer,
  type JWSSignedReceipt,
  type EIP712SignedReceipt,
} from "./types";

// ============================================================================
// JCS Canonicalization (RFC 8785)
// ============================================================================

/**
 * Canonicalize an object using JCS (RFC 8785)
 *
 * Rules:
 * 1. Object keys are sorted lexicographically by UTF-16 code units
 * 2. No whitespace between tokens
 * 3. Numbers use shortest representation (no trailing zeros)
 * 4. Strings use minimal escaping
 * 5. null, true, false are lowercase literals
 *
 * @param obj
 */
export function canonicalize(obj: unknown): string {
  return serializeValue(obj);
}

/**
 *
 * @param value
 */
function serializeValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "null";

  const type = typeof value;
  if (type === "boolean") return value ? "true" : "false";
  if (type === "number") return serializeNumber(value as number);
  if (type === "string") return serializeString(value as string);
  if (Array.isArray(value)) return serializeArray(value);
  if (type === "object") return serializeObject(value as Record<string, unknown>);

  throw new Error(`Cannot canonicalize value of type ${type}`);
}

/**
 *
 * @param num
 */
function serializeNumber(num: number): string {
  if (!Number.isFinite(num)) throw new Error("Cannot canonicalize Infinity or NaN");
  if (Object.is(num, -0)) return "0";
  return String(num);
}

/**
 *
 * @param str
 */
function serializeString(str: string): string {
  let result = '"';
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const code = str.charCodeAt(i);
    if (code < 0x20) {
      result += "\\u" + code.toString(16).padStart(4, "0");
    } else if (char === '"') {
      result += '\\"';
    } else if (char === "\\") {
      result += "\\\\";
    } else {
      result += char;
    }
  }
  return result + '"';
}

/**
 *
 * @param arr
 */
function serializeArray(arr: unknown[]): string {
  return "[" + arr.map(serializeValue).join(",") + "]";
}

/**
 *
 * @param obj
 */
function serializeObject(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const pairs: string[] = [];
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined) {
      pairs.push(serializeString(key) + ":" + serializeValue(value));
    }
  }
  return "{" + pairs.join(",") + "}";
}

/**
 * Hash a canonicalized object using SHA-256
 *
 * @param obj
 */
export async function hashCanonical(obj: unknown): Promise<Uint8Array> {
  const canonical = canonicalize(obj);
  const data = new TextEncoder().encode(canonical);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hashBuffer);
}

/**
 * Get canonical bytes of an object (UTF-8 encoded)
 *
 * @param obj
 */
export function getCanonicalBytes(obj: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(obj));
}

// ============================================================================
// JWS Signing (§3.3)
// ============================================================================

/**
 * Sign a payload using JWS Compact Serialization
 *
 * @param payload
 * @param signer
 */
export async function signJWS<T extends object>(payload: T, signer: JWSSigner): Promise<string> {
  const canonical = canonicalize(payload);
  const payloadBytes = new TextEncoder().encode(canonical);
  return signer.sign(payloadBytes);
}

/**
 * Extract JWS header without verification
 *
 * @param jws
 */
export function extractJWSHeader(jws: string): { alg: string; kid?: string } {
  const parts = jws.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWS format");
  const headerJson = jose.base64url.decode(parts[0]);
  return JSON.parse(new TextDecoder().decode(headerJson));
}

/**
 * Extract JWS payload without verification
 *
 * @param jws
 */
export function extractJWSPayloadUnsafe<T>(jws: string): T {
  const parts = jws.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWS format");
  const payloadJson = jose.base64url.decode(parts[1]);
  return JSON.parse(new TextDecoder().decode(payloadJson));
}

// ============================================================================
// EIP-712 Domain Configuration (§3.2)
// ============================================================================

/**
 *
 * @param chainId
 */
export function createOfferDomain(chainId: number): TypedDataDomain {
  return { name: "x402 offer", version: "1", chainId };
}

/**
 *
 * @param chainId
 */
export function createReceiptDomain(chainId: number): TypedDataDomain {
  return { name: "x402 receipt", version: "1", chainId };
}

export const OFFER_TYPES = {
  Offer: [
    { name: "resourceUrl", type: "string" },
    { name: "scheme", type: "string" },
    { name: "settlement", type: "string" },
    { name: "network", type: "string" },
    { name: "asset", type: "string" },
    { name: "payTo", type: "string" },
    { name: "amount", type: "string" },
    { name: "maxTimeoutSeconds", type: "uint256" },
    { name: "issuedAt", type: "uint256" },
  ],
};

export const RECEIPT_TYPES = {
  Receipt: [
    { name: "resourceUrl", type: "string" },
    { name: "payer", type: "string" },
    { name: "issuedAt", type: "uint256" },
  ],
};

// ============================================================================
// EIP-712 Payload Preparation
// ============================================================================

/**
 *
 * @param payload
 */
export function prepareOfferForEIP712(payload: OfferPayload) {
  return {
    resourceUrl: payload.resourceUrl,
    scheme: payload.scheme,
    settlement: payload.settlement,
    network: payload.network,
    asset: payload.asset,
    payTo: payload.payTo,
    amount: payload.amount,
    maxTimeoutSeconds: BigInt(payload.maxTimeoutSeconds ?? 0),
    issuedAt: BigInt(payload.issuedAt ?? 0),
  };
}

/**
 *
 * @param payload
 */
export function prepareReceiptForEIP712(payload: ReceiptPayload) {
  return {
    resourceUrl: payload.resourceUrl,
    payer: payload.payer,
    issuedAt: BigInt(payload.issuedAt),
  };
}

// ============================================================================
// EIP-712 Hashing
// ============================================================================

/**
 *
 * @param payload
 * @param chainId
 */
export function hashOfferTypedData(payload: OfferPayload, chainId: number): Hex {
  return hashTypedData({
    domain: createOfferDomain(chainId),
    types: OFFER_TYPES,
    primaryType: "Offer",
    message: prepareOfferForEIP712(payload),
  });
}

/**
 *
 * @param payload
 * @param chainId
 */
export function hashReceiptTypedData(payload: ReceiptPayload, chainId: number): Hex {
  return hashTypedData({
    domain: createReceiptDomain(chainId),
    types: RECEIPT_TYPES,
    primaryType: "Receipt",
    message: prepareReceiptForEIP712(payload),
  });
}

// ============================================================================
// EIP-712 Signing
// ============================================================================

export type SignTypedDataFn = (params: {
  domain: TypedDataDomain;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}) => Promise<Hex>;

/**
 *
 * @param payload
 * @param chainId
 * @param signTypedData
 */
export async function signOfferEIP712(
  payload: OfferPayload,
  chainId: number,
  signTypedData: SignTypedDataFn,
): Promise<Hex> {
  return signTypedData({
    domain: createOfferDomain(chainId),
    types: OFFER_TYPES,
    primaryType: "Offer",
    message: prepareOfferForEIP712(payload) as unknown as Record<string, unknown>,
  });
}

/**
 *
 * @param payload
 * @param chainId
 * @param signTypedData
 */
export async function signReceiptEIP712(
  payload: ReceiptPayload,
  chainId: number,
  signTypedData: SignTypedDataFn,
): Promise<Hex> {
  return signTypedData({
    domain: createReceiptDomain(chainId),
    types: RECEIPT_TYPES,
    primaryType: "Receipt",
    message: prepareReceiptForEIP712(payload) as unknown as Record<string, unknown>,
  });
}

// ============================================================================
// Network Utilities
// ============================================================================

/**
 * Extract chain ID from a CAIP-2 network string (strict format)
 *
 * @param network
 * @throws Error if network is not in "eip155:<chainId>" format
 */
export function extractChainId(network: string): number {
  const match = network.match(/^eip155:(\d+)$/);
  if (!match) {
    throw new Error(`Invalid network format: ${network}. Expected "eip155:<chainId>"`);
  }
  return parseInt(match[1], 10);
}

/**
 * Parse a network string into CAIP-2 format
 *
 * Handles both CAIP-2 format and legacy x402 v1 network strings:
 * - CAIP-2: "eip155:8453" → "eip155:8453"
 * - Legacy: "solana" → "solana:mainnet"
 * - Legacy: "base", "base-sepolia", etc. → assumed EVM with chainId 1
 *
 * @param network
 */
export function parseNetworkToCAIP2(network: string): string {
  if (network.includes(":")) return network;
  if (network.toLowerCase() === "solana") return "solana:mainnet";
  return "eip155:1";
}

/**
 * Extract chain ID from a CAIP-2 network string (EVM only)
 *
 * @param caip2Network
 * @returns Chain ID number, or undefined for non-EVM networks
 */
export function extractChainIdFromCAIP2(caip2Network: string): number | undefined {
  const [namespace, reference] = caip2Network.split(":");
  if (namespace === "eip155" && reference) {
    const chainId = parseInt(reference, 10);
    return isNaN(chainId) ? undefined : chainId;
  }
  return undefined;
}

// ============================================================================
// Payload Extraction
// ============================================================================

/** Signed proof object (either offer or receipt) */
type SignedProof = SignedOffer | SignedReceipt;

/**
 * Extract the payload from a signed proof (offer or receipt)
 *
 * Works with both JWS and EIP-712 formats:
 * - JWS: decodes payload from the signature string
 * - EIP-712: returns the explicit payload field
 *
 * @param proof
 */
export function extractPayload<T extends OfferPayload | ReceiptPayload>(proof: SignedProof): T {
  if (proof.format === "jws") {
    return extractJWSPayloadUnsafe<T>(proof.signature);
  }
  return (proof as unknown as { payload: T }).payload;
}

// ============================================================================
// Offer Creation (§4)
// ============================================================================

export interface OfferInput {
  scheme: string;
  settlement: string;
  network: string;
  asset: string;
  payTo: string;
  amount: string;
  maxTimeoutSeconds?: number;
}

/**
 *
 * @param resourceUrl
 * @param input
 */
function createOfferPayload(resourceUrl: string, input: OfferInput): OfferPayload {
  return {
    resourceUrl,
    scheme: input.scheme,
    settlement: input.settlement,
    network: input.network,
    asset: input.asset,
    payTo: input.payTo,
    amount: input.amount,
    maxTimeoutSeconds: input.maxTimeoutSeconds,
    issuedAt: Math.floor(Date.now() / 1000),
  };
}

/**
 * Create a signed offer using JWS
 *
 * @param resourceUrl
 * @param input
 * @param signer
 */
export async function createOfferJWS(
  resourceUrl: string,
  input: OfferInput,
  signer: JWSSigner,
): Promise<JWSSignedOffer> {
  const payload = createOfferPayload(resourceUrl, input);
  const jws = await signJWS(payload, signer);
  return { format: "jws", signature: jws };
}

/**
 * Create a signed offer using EIP-712
 *
 * @param resourceUrl
 * @param input
 * @param chainId
 * @param signTypedData
 */
export async function createOfferEIP712(
  resourceUrl: string,
  input: OfferInput,
  chainId: number,
  signTypedData: SignTypedDataFn,
): Promise<EIP712SignedOffer> {
  const payload = createOfferPayload(resourceUrl, input);
  const signature = await signOfferEIP712(payload, chainId, signTypedData);
  return { format: "eip712", payload, signature };
}

/**
 * Extract offer payload without verification
 *
 * @param offer
 */
export function extractOfferPayloadUnsafe(offer: SignedOffer): OfferPayload {
  if (isJWSSignedOffer(offer)) {
    return extractJWSPayloadUnsafe<OfferPayload>(offer.signature);
  } else if (isEIP712SignedOffer(offer)) {
    return offer.payload;
  }
  throw new Error(`Unknown offer format: ${(offer as SignedOffer).format}`);
}

// ============================================================================
// Receipt Creation (§5)
// ============================================================================

export interface ReceiptInput {
  resourceUrl: string;
  payer: string;
}

/**
 *
 * @param input
 */
function createReceiptPayload(input: ReceiptInput): ReceiptPayload {
  return {
    resourceUrl: input.resourceUrl,
    payer: input.payer,
    issuedAt: Math.floor(Date.now() / 1000),
  };
}

/**
 * Create a signed receipt using JWS
 *
 * @param input
 * @param signer
 */
export async function createReceiptJWS(
  input: ReceiptInput,
  signer: JWSSigner,
): Promise<JWSSignedReceipt> {
  const payload = createReceiptPayload(input);
  const jws = await signJWS(payload, signer);
  return { format: "jws", signature: jws };
}

/**
 * Create a signed receipt using EIP-712
 *
 * @param input
 * @param chainId
 * @param signTypedData
 */
export async function createReceiptEIP712(
  input: ReceiptInput,
  chainId: number,
  signTypedData: SignTypedDataFn,
): Promise<EIP712SignedReceipt> {
  const payload = createReceiptPayload(input);
  const signature = await signReceiptEIP712(payload, chainId, signTypedData);
  return { format: "eip712", payload, signature };
}

/**
 * Extract receipt payload without verification
 *
 * @param receipt
 */
export function extractReceiptPayloadUnsafe(receipt: SignedReceipt): ReceiptPayload {
  if (isJWSSignedReceipt(receipt)) {
    return extractJWSPayloadUnsafe<ReceiptPayload>(receipt.signature);
  } else if (isEIP712SignedReceipt(receipt)) {
    return receipt.payload;
  }
  throw new Error(`Unknown receipt format: ${(receipt as SignedReceipt).format}`);
}

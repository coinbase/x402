/// <reference lib="dom" />
import type { Hex } from "viem";

/**
 * Converts an ArrayBuffer to a hex string.
 *
 * @param buffer - The ArrayBuffer to convert
 * @returns The hex string representation
 */
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Converts a base64url-encoded string to a hex string.
 *
 * @param base64url - The base64url string to convert
 * @returns The hex string representation
 */
function base64urlToHex(base64url: string): string {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  return Array.from(binary, c => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}

/**
 * Extracts P256 public key coordinates from a WebAuthn credential.
 *
 * Replaces `extractPasskeyData` from `@safe-global/protocol-kit`.
 * Uses only the Web Crypto API (no external dependencies).
 *
 * @param credential - The WebAuthn credential containing the public key
 * @returns The raw ID and P256 x/y coordinates
 */
export async function extractPasskeyCoordinates(
  credential: PublicKeyCredential,
): Promise<{ rawId: string; x: Hex; y: Hex }> {
  const rawId = bufferToHex(credential.rawId);
  const response = credential.response as AuthenticatorAttestationResponse;
  const publicKey = response.getPublicKey();
  if (!publicKey) throw new Error("Failed to extract public key from credential");

  const key = await crypto.subtle.importKey(
    "spki",
    publicKey,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", key);
  if (!jwk.x || !jwk.y) throw new Error("Missing coordinates in JWK");

  return {
    rawId,
    x: ("0x" + base64urlToHex(jwk.x)) as Hex,
    y: ("0x" + base64urlToHex(jwk.y)) as Hex,
  };
}

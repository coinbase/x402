/**
 * Test utilities for x402 Offer/Receipt Extension
 *
 * These are convenience functions for testing only.
 * Production implementations should use HSM, TPM, or secure key management.
 */

import * as jose from "jose";
import type { JWSSigner } from "../src/offer-receipt/types";

/**
 * Create a JWS signer from a JWK private key (FOR TESTING ONLY)
 *
 * WARNING: This loads the private key into memory. For production,
 * implement JWSSigner with HSM, TPM, or a remote signing service.
 *
 * @param jwk
 * @param kid
 */
export async function createJWSSignerFromJWK(jwk: jose.JWK, kid: string): Promise<JWSSigner> {
  const privateKey = await jose.importJWK(jwk);

  let algorithm: string;
  if (jwk.crv === "secp256k1") {
    algorithm = "ES256K";
  } else if (jwk.crv === "P-256") {
    algorithm = "ES256";
  } else if (jwk.crv === "Ed25519") {
    algorithm = "EdDSA";
  } else {
    throw new Error(`Unsupported key curve: ${jwk.crv}`);
  }

  return {
    kid,
    algorithm,
    format: "jws",
    sign: async (payloadBytes: Uint8Array): Promise<string> => {
      const jws = await new jose.CompactSign(payloadBytes)
        .setProtectedHeader({ alg: algorithm, kid })
        .sign(privateKey);
      return jws;
    },
  };
}

/**
 * Generate an ES256K key pair (FOR TESTING ONLY)
 */
export async function generateES256KKeyPair(): Promise<{
  privateKey: jose.JWK;
  publicKey: jose.JWK;
}> {
  const { privateKey, publicKey } = await jose.generateKeyPair("ES256K");
  return {
    privateKey: await jose.exportJWK(privateKey),
    publicKey: await jose.exportJWK(publicKey),
  };
}

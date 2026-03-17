import type {
  ColdStartSignal,
  VerifyColdStartSignalOptions,
  VerifyColdStartSignalResult,
} from "./types";
import { isSignedColdStartSignal } from "./parse";

const SIGNATURE_METADATA_FIELDS = new Set(["sig", "kid", "jwks", "alg"]);

/**
 * Build the default canonical payload for detached signal verification.
 *
 * The signature metadata is excluded so callers can sign the semantic payload
 * without including transport-specific verification hints.
 */
export function canonicalizeColdStartSignal(signal: ColdStartSignal): string {
  const payload: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(signal)) {
    if (!SIGNATURE_METADATA_FIELDS.has(key) && value !== undefined) {
      payload[key] = value;
    }
  }

  return JSON.stringify(sortJsonValue(payload));
}

/**
 * Verify a detached cold-start signal signature.
 *
 * This scaffold intentionally keeps key resolution outside the helper so
 * callers can decide how to fetch, cache, or pin JWKS documents.
 */
export async function verifyColdStartSignalSignature(
  signal: ColdStartSignal,
  options: VerifyColdStartSignalOptions = {},
): Promise<VerifyColdStartSignalResult> {
  if (!isSignedColdStartSignal(signal)) {
    return {
      valid: false,
      error: "Signal is missing the required sig and kid fields",
    };
  }

  const algorithm = options.algorithm ?? signal.alg;
  let resolvedAlgorithm = algorithm;
  const subtle = globalThis.crypto?.subtle;

  if (!subtle) {
    return {
      valid: false,
      error: "WebCrypto subtle API is not available in this runtime",
      keyId: signal.kid,
      algorithm,
    };
  }

  try {
    const jwk =
      options.jwk ??
      (await options.resolveJwk?.({
        signal,
        kid: signal.kid,
        jwks: signal.jwks,
      }));

    if (!jwk) {
      return {
        valid: false,
        error: "No JWK was provided for signal verification",
        keyId: signal.kid,
        algorithm,
      };
    }

    resolvedAlgorithm = normalizeAlgorithm(algorithm ?? jwk.alg, jwk);

    if (!resolvedAlgorithm) {
      return {
        valid: false,
        error: "Unable to determine a signature algorithm for the signal",
        keyId: signal.kid,
      };
    }

    const imported = await importVerificationKey(subtle, jwk, resolvedAlgorithm);
    const payload = toArrayBuffer(
      options.payload ?? options.canonicalize?.(signal) ?? canonicalizeColdStartSignal(signal),
    );

    const signature = decodeBase64Url(signal.sig);
    const valid = await subtle.verify(imported.verifyAlgorithm, imported.key, signature, payload);

    return valid
      ? {
          valid: true,
          keyId: signal.kid,
          algorithm: resolvedAlgorithm,
        }
      : {
          valid: false,
          error: "Signal signature verification failed",
          keyId: signal.kid,
          algorithm: resolvedAlgorithm,
        };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Signal signature verification failed",
      keyId: signal.kid,
      algorithm: resolvedAlgorithm,
    };
  }
}

function normalizeAlgorithm(algorithm: string | undefined, jwk: JsonWebKey): string | undefined {
  if (!algorithm) {
    return jwk.kty === "OKP" && jwk.crv === "Ed25519" ? "EdDSA" : undefined;
  }

  if (algorithm === "Ed25519") {
    return "EdDSA";
  }

  return algorithm;
}

async function importVerificationKey(
  subtle: SubtleCrypto,
  jwk: JsonWebKey,
  algorithm: string,
): Promise<{
  key: CryptoKey;
  verifyAlgorithm: AlgorithmIdentifier | RsaPssParams | EcdsaParams;
}> {
  switch (algorithm) {
    case "RS256": {
      return {
        key: await subtle.importKey(
          "jwk",
          jwk,
          { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
          false,
          ["verify"],
        ),
        verifyAlgorithm: "RSASSA-PKCS1-v1_5",
      };
    }
    case "ES256": {
      if (jwk.crv && jwk.crv !== "P-256") {
        throw new Error(`ES256 requires a P-256 key, received curve: ${jwk.crv}`);
      }

      return {
        key: await subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, [
          "verify",
        ]),
        verifyAlgorithm: { name: "ECDSA", hash: "SHA-256" },
      };
    }
    case "EdDSA": {
      if (jwk.crv && jwk.crv !== "Ed25519") {
        throw new Error(`EdDSA requires an Ed25519 key, received curve: ${jwk.crv}`);
      }

      return {
        key: await subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["verify"]),
        verifyAlgorithm: "Ed25519",
      };
    }
    default:
      throw new Error(
        `Unsupported signature algorithm: ${algorithm}. Supported algorithms: RS256, ES256, EdDSA`,
      );
  }
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nestedValue]) => nestedValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortJsonValue(nestedValue)]),
    );
  }

  return value;
}

function toArrayBuffer(value: string | Uint8Array): ArrayBuffer {
  const bytes =
    value instanceof Uint8Array ? Uint8Array.from(value) : new TextEncoder().encode(value);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function decodeBase64Url(value: string): ArrayBuffer {
  if (!/^[A-Za-z0-9_-]+=*$/.test(value)) {
    throw new Error("Signal signature is not valid base64url");
  }

  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");

  if (typeof Buffer !== "undefined") {
    const bytes = Uint8Array.from(Buffer.from(padded, "base64"));
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  const binary = globalThis.atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

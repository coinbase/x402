import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign as signBuffer } from "crypto";
import {
  canonicalizeColdStartSignal,
  extractColdStartSignals,
  getFreshColdStartSignals,
  isColdStartSignalFresh,
  listColdStartSignals,
  parseColdStartSignals,
  safeParseColdStartSignals,
  verifyColdStartSignalSignature,
  type ColdStartSignals,
} from "../src/cold-start";

describe("Cold-start signal helpers", () => {
  describe("parseColdStartSignals", () => {
    it("ignores unknown categories while preserving known signals", () => {
      const parsed = parseColdStartSignals({
        onChainCredentials: [
          {
            type: "customCredential",
            issuer: "did:web:issuer.example",
          },
        ],
        unknownCategory: [
          {
            type: "ignore-me",
          },
        ],
      });

      expect(parsed.onChainCredentials).toHaveLength(1);
      expect(parsed.onChainCredentials?.[0].type).toBe("customCredential");
      expect("unknownCategory" in parsed).toBe(false);
    });

    it("accepts unknown signal types inside known categories", () => {
      const parsed = parseColdStartSignals({
        discoveryAttestations: [
          {
            type: "providerDefinedHealthProbe",
            provider: "monitoring.example",
            successRate: 0.99,
          },
        ],
      });

      expect(parsed.discoveryAttestations?.[0].type).toBe("providerDefinedHealthProbe");
      expect(parsed.discoveryAttestations?.[0].successRate).toBe(0.99);
    });

    it("returns a safe parse error for malformed known categories", () => {
      const result = safeParseColdStartSignals({
        onChainCredentials: {
          type: "not-an-array",
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("onChainCredentials");
      }
    });
  });

  describe("extractColdStartSignals", () => {
    it("extracts from discovery-style metadata", () => {
      const parsed = extractColdStartSignals({
        metadata: {
          coldStartSignals: {
            offChainAttestations: [
              {
                type: "did",
                id: "did:web:agent.example.com",
              },
            ],
          },
        },
      });

      expect(parsed?.offChainAttestations?.[0].type).toBe("did");
    });

    it("extracts from a direct coldStartSignals envelope", () => {
      const parsed = extractColdStartSignals({
        coldStartSignals: {
          discoveryAttestations: [
            {
              type: "serviceHealth",
              uptimePct: 99.9,
            },
          ],
        },
      });

      expect(parsed?.discoveryAttestations?.[0].type).toBe("serviceHealth");
    });
  });

  describe("freshness helpers", () => {
    it("filters stale signals for pre-payment evaluation", () => {
      const signals: ColdStartSignals = {
        onChainActivity: [
          {
            type: "walletTrust",
            checkedAt: "2026-03-11T12:00:00Z",
            ttlSeconds: 120,
          },
        ],
        discoveryAttestations: [
          {
            type: "serviceHealth",
            checkedAt: "2026-03-11T12:00:00Z",
            ttlSeconds: 10,
          },
        ],
      };

      const allSignals = listColdStartSignals(signals);
      const freshSignals = getFreshColdStartSignals(signals, new Date("2026-03-11T12:01:00Z"));

      expect(allSignals).toHaveLength(2);
      expect(freshSignals).toHaveLength(1);
      expect(freshSignals[0].signal.type).toBe("walletTrust");
    });

    it("treats malformed freshness metadata as stale", () => {
      expect(
        isColdStartSignalFresh({
          checkedAt: "not-a-date",
          ttlSeconds: 60,
        }),
      ).toBe(false);

      expect(
        isColdStartSignalFresh({
          checkedAt: "2026-03-11T12:00:00Z",
        }),
      ).toBe(false);
    });
  });

  describe("verifyColdStartSignalSignature", () => {
    it("verifies a real RS256 detached signature with a resolver-supplied JWK", async () => {
      const { publicKey, privateKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
      });

      const unsignedSignal = {
        type: "serviceHealth",
        provider: "discovery-service",
        checkedAt: "2026-03-11T12:00:00Z",
        ttlSeconds: 300,
        uptimePct: 99.5,
      };

      const signature = signBuffer(
        "RSA-SHA256",
        Buffer.from(canonicalizeColdStartSignal(unsignedSignal), "utf8"),
        privateKey,
      ).toString("base64url");

      const signedSignal = {
        ...unsignedSignal,
        sig: signature,
        kid: "provider-key-1",
        jwks: "https://provider.example/.well-known/jwks.json",
        alg: "RS256",
      };

      const jwk = publicKey.export({ format: "jwk" }) as JsonWebKey;

      const result = await verifyColdStartSignalSignature(signedSignal, {
        resolveJwk: async ({ kid, jwks }) => {
          expect(kid).toBe("provider-key-1");
          expect(jwks).toBe("https://provider.example/.well-known/jwks.json");
          return jwk;
        },
      });

      expect(result).toEqual({
        valid: true,
        algorithm: "RS256",
        keyId: "provider-key-1",
      });
    });

    it("verifies a real ES256 detached signature", async () => {
      const { publicKey, privateKey } = generateKeyPairSync("ec", {
        namedCurve: "prime256v1",
      });

      const unsignedSignal = {
        type: "walletTrust",
        provider: "example-provider",
        checkedAt: "2026-03-11T12:00:00Z",
        ttlSeconds: 300,
        compositeScore: 0.72,
      };

      const signature = signBuffer(
        "sha256",
        Buffer.from(canonicalizeColdStartSignal(unsignedSignal), "utf8"),
        {
          key: privateKey,
          dsaEncoding: "ieee-p1363",
        },
      ).toString("base64url");

      const result = await verifyColdStartSignalSignature(
        {
          ...unsignedSignal,
          sig: signature,
          kid: "p256-key-1",
          alg: "ES256",
        },
        {
          jwk: publicKey.export({ format: "jwk" }) as JsonWebKey,
        },
      );

      expect(result).toEqual({
        valid: true,
        algorithm: "ES256",
        keyId: "p256-key-1",
      });
    });

    it("verifies a real Ed25519 detached signature via EdDSA", async () => {
      const { publicKey, privateKey } = generateKeyPairSync("ed25519");

      const unsignedSignal = {
        type: "discoveryAttestation",
        provider: "x402-discovery",
        checkedAt: "2026-03-11T12:00:00Z",
        ttlSeconds: 300,
        serviceId: "legacy/cf-pay-per-crawl",
      };

      const signature = signBuffer(
        null,
        Buffer.from(canonicalizeColdStartSignal(unsignedSignal), "utf8"),
        privateKey,
      ).toString("base64url");

      const jwk = publicKey.export({ format: "jwk" }) as JsonWebKey;

      const result = await verifyColdStartSignalSignature(
        {
          ...unsignedSignal,
          sig: signature,
          kid: "ed25519-key-1",
          alg: "EdDSA",
        },
        {
          jwk,
        },
      );

      expect(result).toEqual({
        valid: true,
        algorithm: "EdDSA",
        keyId: "ed25519-key-1",
      });
    });

    it("infers EdDSA when the JWK curve is Ed25519", async () => {
      const { publicKey, privateKey } = generateKeyPairSync("ed25519");

      const unsignedSignal = {
        type: "reasoningAttestation",
        provider: "thoughtproof",
        checkedAt: "2026-03-11T12:00:00Z",
        ttlSeconds: 300,
        verdict: "PASS",
      };

      const signature = signBuffer(
        null,
        Buffer.from(canonicalizeColdStartSignal(unsignedSignal), "utf8"),
        privateKey,
      ).toString("base64url");

      const result = await verifyColdStartSignalSignature(
        {
          ...unsignedSignal,
          sig: signature,
          kid: "ed25519-key-2",
        },
        {
          jwk: publicKey.export({ format: "jwk" }) as JsonWebKey,
        },
      );

      expect(result).toEqual({
        valid: true,
        algorithm: "EdDSA",
        keyId: "ed25519-key-2",
      });
    });

    it("returns an error for unsupported algorithms", async () => {
      const result = await verifyColdStartSignalSignature(
        {
          type: "serviceHealth",
          sig: "ZmFrZQ",
          kid: "provider-key-1",
          alg: "HS256",
        },
        {
          jwk: {
            kty: "oct",
            alg: "HS256",
            k: "ZmFrZQ",
          },
        },
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Unsupported signature algorithm");
    });

    it("returns an error when the signal is not signed", async () => {
      const result = await verifyColdStartSignalSignature({
        type: "serviceHealth",
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("sig and kid");
    });
  });
});

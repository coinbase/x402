/**
 * Specification-driven tests for x402 Offer/Receipt Extension
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as jose from "jose";
import { privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress } from "viem";
import type { Hex } from "viem";

import {
  canonicalize,
  createOfferJWS,
  createOfferEIP712,
  extractOfferPayloadUnsafe,
  createReceiptJWS,
  createReceiptEIP712,
  extractReceiptPayloadUnsafe,
  createOfferDomain,
  OFFER_TYPES,
  prepareOfferForEIP712,
  extractPayload,
  parseNetworkToCAIP2,
  extractChainIdFromCAIP2,
  type JWSSigner,
  type ReceiptPayload,
} from "../src/offer-receipt";

import { createJWSSignerFromJWK, generateES256KKeyPair } from "./offer-receipt-test-utils";

const TEST_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;

describe("x402 Offer/Receipt Extension", () => {
  describe("§3.1 Common Object Shape", () => {
    describe("JWS format", () => {
      let signer: JWSSigner;
      beforeAll(async () => {
        const keyPair = await generateES256KKeyPair();
        signer = await createJWSSignerFromJWK(keyPair.privateKey, "did:web:example.com");
      });

      it("JWS offer has format='jws', signature field, no payload field", async () => {
        const offer = await createOfferJWS(
          "https://api.example.com/resource",
          {
            scheme: "exact",
            settlement: "txid",
            network: "eip155:8453",
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            payTo: "0x1234567890123456789012345678901234567890",
            amount: "10000",
          },
          signer,
        );
        expect(offer.format).toBe("jws");
        expect(offer.signature).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
        expect(offer).not.toHaveProperty("payload");
      });
    });

    describe("EIP-712 format", () => {
      const account = privateKeyToAccount(TEST_PRIVATE_KEY);
      it("EIP-712 offer has format='eip712', payload field, hex signature", async () => {
        const offer = await createOfferEIP712(
          "https://api.example.com/resource",
          {
            scheme: "exact",
            settlement: "txid",
            network: "eip155:8453",
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            payTo: "0x1234567890123456789012345678901234567890",
            amount: "10000",
          },
          8453,
          p => account.signTypedData(p),
        );
        expect(offer.format).toBe("eip712");
        expect(offer).toHaveProperty("payload");
        expect(offer.signature).toMatch(/^0x[a-fA-F0-9]{130}$/);
      });
    });
  });

  describe("§3.2 EIP-712 Domain", () => {
    const account = privateKeyToAccount(TEST_PRIVATE_KEY);
    it("Offer domain: name='x402 offer', version='1', chainId from network", async () => {
      await createOfferEIP712(
        "https://api.example.com/resource",
        {
          scheme: "exact",
          settlement: "txid",
          network: "eip155:8453",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1234567890123456789012345678901234567890",
          amount: "10000",
        },
        8453,
        p => {
          expect(p.domain.name).toBe("x402 offer");
          expect(p.domain.version).toBe("1");
          expect(Number(p.domain.chainId)).toBe(8453);
          return account.signTypedData(p);
        },
      );
    });

    it("Receipt domain: name='x402 receipt', version='1'", async () => {
      await createReceiptEIP712(
        { resourceUrl: "https://api.example.com/resource", payer: "0xabc123" },
        8453,
        p => {
          expect(p.domain.name).toBe("x402 receipt");
          expect(p.domain.version).toBe("1");
          return account.signTypedData(p);
        },
      );
    });
  });

  describe("§3.3 JWS Header Requirements", () => {
    it("JWS header MUST include alg and kid", async () => {
      const keyPair = await generateES256KKeyPair();
      const expectedKid = "did:web:api.example.com#key-1";
      const signer = await createJWSSignerFromJWK(keyPair.privateKey, expectedKid);
      const offer = await createOfferJWS(
        "https://api.example.com/resource",
        {
          scheme: "exact",
          settlement: "txid",
          network: "eip155:8453",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1234567890123456789012345678901234567890",
          amount: "10000",
        },
        signer,
      );
      const header = JSON.parse(
        new TextDecoder().decode(jose.base64url.decode(offer.signature.split(".")[0])),
      );
      expect(header.alg).toBe("ES256K");
      expect(header.kid).toBe(expectedKid);
    });
  });

  describe("§4.2 Offer Payload Fields", () => {
    it("Offer payload includes all required fields", async () => {
      const keyPair = await generateES256KKeyPair();
      const signer = await createJWSSignerFromJWK(keyPair.privateKey, "did:web:example.com");
      const offer = await createOfferJWS(
        "https://api.example.com/premium",
        {
          scheme: "exact",
          settlement: "txid",
          network: "eip155:8453",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
          amount: "10000",
          maxTimeoutSeconds: 60,
        },
        signer,
      );
      const payload = extractOfferPayloadUnsafe(offer);
      expect(payload.resourceUrl).toBe("https://api.example.com/premium");
      expect(payload.scheme).toBe("exact");
      expect(payload.settlement).toBe("txid");
      expect(payload.network).toBe("eip155:8453");
      expect(payload.asset).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
      expect(payload.payTo).toBe("0x209693Bc6afc0C5328bA36FaF03C514EF312287C");
      expect(payload.amount).toBe("10000");
      expect(payload.maxTimeoutSeconds).toBe(60);
      expect(typeof payload.issuedAt).toBe("number");
    });
  });

  describe("§5.2 Receipt Payload Fields (Privacy-Minimal)", () => {
    it("Receipt includes only resourceUrl, payer, issuedAt", async () => {
      const keyPair = await generateES256KKeyPair();
      const signer = await createJWSSignerFromJWK(keyPair.privateKey, "did:web:example.com");
      const receipt = await createReceiptJWS(
        {
          resourceUrl: "https://api.example.com/resource",
          payer: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
        },
        signer,
      );
      const payload = extractReceiptPayloadUnsafe(receipt);
      expect(payload.resourceUrl).toBe("https://api.example.com/resource");
      expect(payload.payer).toBe("0x857b06519E91e3A54538791bDbb0E22373e36b66");
      expect(typeof payload.issuedAt).toBe("number");
      expect(payload).not.toHaveProperty("transaction");
      expect(payload).not.toHaveProperty("amount");
      expect(payload).not.toHaveProperty("asset");
      expect(payload).not.toHaveProperty("network");
    });
  });

  describe("JCS Canonicalization (RFC 8785)", () => {
    it("sorts object keys lexicographically", () => {
      expect(canonicalize({ z: 1, a: 2 })).toBe('{"a":2,"z":1}');
    });
    it("handles nested objects", () => {
      expect(canonicalize({ b: { d: 1, c: 2 }, a: 3 })).toBe('{"a":3,"b":{"c":2,"d":1}}');
    });
    it("handles arrays (preserves order)", () => {
      expect(canonicalize({ arr: [3, 1, 2] })).toBe('{"arr":[3,1,2]}');
    });
    it("handles -0 as 0", () => {
      expect(canonicalize({ n: -0 })).toBe('{"n":0}');
    });
  });

  describe("Cryptographic Verification", () => {
    it("JWS signature verifies with jose.compactVerify", async () => {
      const keyPair = await generateES256KKeyPair();
      const signer = await createJWSSignerFromJWK(keyPair.privateKey, "did:web:example.com");
      const publicKey = await jose.importJWK(keyPair.publicKey);

      const offer = await createOfferJWS(
        "https://api.example.com/resource",
        {
          scheme: "exact",
          settlement: "txid",
          network: "eip155:8453",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1234567890123456789012345678901234567890",
          amount: "10000",
        },
        signer,
      );

      const { payload } = await jose.compactVerify(offer.signature, publicKey);
      const decoded = JSON.parse(new TextDecoder().decode(payload));
      expect(decoded.resourceUrl).toBe("https://api.example.com/resource");
    });

    it("EIP-712 signature recovers correct signer", async () => {
      const account = privateKeyToAccount(TEST_PRIVATE_KEY);
      const chainId = 8453;

      const offer = await createOfferEIP712(
        "https://api.example.com/resource",
        {
          scheme: "exact",
          settlement: "txid",
          network: "eip155:8453",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1234567890123456789012345678901234567890",
          amount: "10000",
        },
        chainId,
        p => account.signTypedData(p),
      );

      const recovered = await recoverTypedDataAddress({
        domain: createOfferDomain(chainId),
        types: OFFER_TYPES,
        primaryType: "Offer",
        message: prepareOfferForEIP712(offer.payload),
        signature: offer.signature as Hex,
      });

      expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
    });
  });
});

describe("Attestation Helper", () => {
  describe("parseNetworkToCAIP2", () => {
    it("passes through CAIP-2 format unchanged", () => {
      expect(parseNetworkToCAIP2("eip155:8453")).toBe("eip155:8453");
      expect(parseNetworkToCAIP2("eip155:1")).toBe("eip155:1");
      expect(parseNetworkToCAIP2("solana:mainnet")).toBe("solana:mainnet");
    });

    it("converts 'solana' to 'solana:mainnet'", () => {
      expect(parseNetworkToCAIP2("solana")).toBe("solana:mainnet");
      expect(parseNetworkToCAIP2("Solana")).toBe("solana:mainnet");
      expect(parseNetworkToCAIP2("SOLANA")).toBe("solana:mainnet");
    });

    it("converts legacy v1 EVM names to eip155:1", () => {
      expect(parseNetworkToCAIP2("base")).toBe("eip155:1");
      expect(parseNetworkToCAIP2("base-sepolia")).toBe("eip155:1");
      expect(parseNetworkToCAIP2("ethereum")).toBe("eip155:1");
    });
  });

  describe("extractChainIdFromCAIP2", () => {
    it("extracts chain ID from EVM networks", () => {
      expect(extractChainIdFromCAIP2("eip155:8453")).toBe(8453);
      expect(extractChainIdFromCAIP2("eip155:1")).toBe(1);
      expect(extractChainIdFromCAIP2("eip155:137")).toBe(137);
    });

    it("returns undefined for non-EVM networks", () => {
      expect(extractChainIdFromCAIP2("solana:mainnet")).toBeUndefined();
      expect(extractChainIdFromCAIP2("cosmos:cosmoshub-4")).toBeUndefined();
    });
  });

  describe("extractPayload", () => {
    it("extracts payload from JWS receipt", async () => {
      const keyPair = await generateES256KKeyPair();
      const signer = await createJWSSignerFromJWK(keyPair.privateKey, "did:web:example.com");
      const receipt = await createReceiptJWS(
        {
          resourceUrl: "https://api.example.com/resource",
          payer: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
        },
        signer,
      );

      const payload = extractPayload<ReceiptPayload>(receipt);
      expect(payload.resourceUrl).toBe("https://api.example.com/resource");
      expect(payload.payer).toBe("0x857b06519E91e3A54538791bDbb0E22373e36b66");
      expect(typeof payload.issuedAt).toBe("number");
    });

    it("extracts payload from EIP-712 receipt", async () => {
      const account = privateKeyToAccount(TEST_PRIVATE_KEY);
      const receipt = await createReceiptEIP712(
        {
          resourceUrl: "https://api.example.com/resource",
          payer: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
        },
        8453,
        p => account.signTypedData(p),
      );

      const payload = extractPayload<ReceiptPayload>(receipt);
      expect(payload.resourceUrl).toBe("https://api.example.com/resource");
      expect(payload.payer).toBe("0x857b06519E91e3A54538791bDbb0E22373e36b66");
    });
  });
});

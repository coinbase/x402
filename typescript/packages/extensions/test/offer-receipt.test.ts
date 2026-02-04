/**
 * Specification-driven tests for x402 Offer/Receipt Extension
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, beforeAll } from "vitest";
import * as jose from "jose";
import { privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress } from "viem";
import type { Hex } from "viem";

import {
  canonicalize,
  hashCanonical,
  getCanonicalBytes,
  createOfferJWS,
  createOfferEIP712,
  extractOfferPayload,
  createReceiptJWS,
  createReceiptEIP712,
  extractReceiptPayload,
  createOfferDomain,
  createReceiptDomain,
  OFFER_TYPES,
  RECEIPT_TYPES,
  prepareOfferForEIP712,
  prepareReceiptForEIP712,
  hashOfferTypedData,
  hashReceiptTypedData,
  convertNetworkStringToCAIP2,
  extractChainIdFromCAIP2,
  extractEIP155ChainId,
  extractOffersFromPaymentRequired,
  decodeSignedOffers,
  findAcceptsObjectFromSignedOffer,
  extractReceiptFromResponse,
  declareOfferReceiptExtension,
  createJWSOfferReceiptIssuer,
  createEIP712OfferReceiptIssuer,
  verifyReceiptMatchesOffer,
  OFFER_RECEIPT,
  type JWSSigner,
  type OfferPayload,
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
            acceptIndex: 0,
            scheme: "exact",
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
            acceptIndex: 0,
            scheme: "exact",
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
          acceptIndex: 0,
          scheme: "exact",
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
        {
          resourceUrl: "https://api.example.com/resource",
          payer: "0xabc123",
          network: "eip155:8453",
        },
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
          acceptIndex: 0,
          scheme: "exact",
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
    it("Offer payload includes all required fields per spec v1.0", async () => {
      const keyPair = await generateES256KKeyPair();
      const signer = await createJWSSignerFromJWK(keyPair.privateKey, "did:web:example.com");
      const beforeCreate = Math.floor(Date.now() / 1000);
      const offer = await createOfferJWS(
        "https://api.example.com/premium",
        {
          acceptIndex: 0,
          scheme: "exact",
          network: "eip155:8453",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
          amount: "10000",
          offerValiditySeconds: 60,
        },
        signer,
      );
      const payload = extractOfferPayload(offer);
      // Required fields per spec §4.2
      expect(payload.version).toBe(1);
      expect(payload.resourceUrl).toBe("https://api.example.com/premium");
      expect(payload.scheme).toBe("exact");
      expect(payload.network).toBe("eip155:8453");
      expect(payload.asset).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
      expect(payload.payTo).toBe("0x209693Bc6afc0C5328bA36FaF03C514EF312287C");
      expect(payload.amount).toBe("10000");
      // validUntil should be approximately now + offerValiditySeconds
      expect(payload.validUntil).toBeGreaterThanOrEqual(beforeCreate + 60);
      expect(payload.validUntil).toBeLessThanOrEqual(beforeCreate + 62); // Allow 2s tolerance
    });
  });

  describe("§5.2 Receipt Payload Fields (Privacy-Minimal)", () => {
    it("JWS receipt omits transaction when not provided (privacy-minimal)", async () => {
      const keyPair = await generateES256KKeyPair();
      const signer = await createJWSSignerFromJWK(keyPair.privateKey, "did:web:example.com");
      const receipt = await createReceiptJWS(
        {
          resourceUrl: "https://api.example.com/resource",
          payer: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
          network: "eip155:8453",
        },
        signer,
      );
      const payload = extractReceiptPayload(receipt);
      // Required fields per spec §5.2
      expect(payload.version).toBe(1);
      expect(payload.network).toBe("eip155:8453");
      expect(payload.resourceUrl).toBe("https://api.example.com/resource");
      expect(payload.payer).toBe("0x857b06519E91e3A54538791bDbb0E22373e36b66");
      expect(typeof payload.issuedAt).toBe("number");
      // Per spec: transaction is optional, should be omitted in JWS when not provided
      expect(payload).not.toHaveProperty("transaction");
    });

    it("JWS receipt includes transaction when provided", async () => {
      const keyPair = await generateES256KKeyPair();
      const signer = await createJWSSignerFromJWK(keyPair.privateKey, "did:web:example.com");
      const receipt = await createReceiptJWS(
        {
          resourceUrl: "https://api.example.com/resource",
          payer: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
          network: "eip155:8453",
          transaction: "0xabc123",
        },
        signer,
      );
      const payload = extractReceiptPayload(receipt);
      expect(payload.transaction).toBe("0xabc123");
    });

    it("EIP-712 receipt uses empty string for transaction when not provided", async () => {
      const account = privateKeyToAccount(TEST_PRIVATE_KEY);
      const receipt = await createReceiptEIP712(
        {
          resourceUrl: "https://api.example.com/resource",
          payer: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
          network: "eip155:8453",
        },
        8453,
        p => account.signTypedData(p),
      );
      const payload = extractReceiptPayload(receipt);
      // Per spec §5.3: EIP-712 MUST set unused optional fields to empty string
      expect(payload.transaction).toBe("");
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
          acceptIndex: 0,
          scheme: "exact",
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
          acceptIndex: 0,
          scheme: "exact",
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
  describe("convertNetworkStringToCAIP2", () => {
    it("passes through CAIP-2 format unchanged", () => {
      expect(convertNetworkStringToCAIP2("eip155:8453")).toBe("eip155:8453");
      expect(convertNetworkStringToCAIP2("eip155:1")).toBe("eip155:1");
      expect(convertNetworkStringToCAIP2("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")).toBe(
        "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      );
    });

    it("converts v1 Solana network names", () => {
      expect(convertNetworkStringToCAIP2("solana")).toBe("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
      expect(convertNetworkStringToCAIP2("Solana")).toBe("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
      expect(convertNetworkStringToCAIP2("solana-devnet")).toBe(
        "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
      );
    });

    it("converts v1 EVM network names to CAIP-2", () => {
      expect(convertNetworkStringToCAIP2("base")).toBe("eip155:8453");
      expect(convertNetworkStringToCAIP2("base-sepolia")).toBe("eip155:84532");
      expect(convertNetworkStringToCAIP2("ethereum")).toBe("eip155:1");
      expect(convertNetworkStringToCAIP2("polygon")).toBe("eip155:137");
      expect(convertNetworkStringToCAIP2("avalanche")).toBe("eip155:43114");
    });

    it("throws for unknown network identifiers", () => {
      expect(() => convertNetworkStringToCAIP2("unknown-network")).toThrow(
        'Unknown network identifier: "unknown-network"',
      );
      expect(() => convertNetworkStringToCAIP2("foo")).toThrow('Unknown network identifier: "foo"');
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

  describe("extractReceiptPayload", () => {
    it("extracts payload from JWS receipt", async () => {
      const keyPair = await generateES256KKeyPair();
      const signer = await createJWSSignerFromJWK(keyPair.privateKey, "did:web:example.com");
      const receipt = await createReceiptJWS(
        {
          resourceUrl: "https://api.example.com/resource",
          payer: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
          network: "eip155:8453",
        },
        signer,
      );

      const payload = extractReceiptPayload(receipt);
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
          network: "eip155:8453",
        },
        8453,
        p => account.signTypedData(p),
      );

      const payload = extractReceiptPayload(receipt);
      expect(payload.resourceUrl).toBe("https://api.example.com/resource");
      expect(payload.payer).toBe("0x857b06519E91e3A54538791bDbb0E22373e36b66");
    });
  });
});

describe("Client Utilities", () => {
  describe("extractOffersFromPaymentRequired", () => {
    it("extracts offers from PaymentRequired extensions", async () => {
      const keyPair = await generateES256KKeyPair();
      const signer = await createJWSSignerFromJWK(keyPair.privateKey, "did:web:example.com");

      const offer1 = await createOfferJWS(
        "https://api.example.com/resource",
        {
          acceptIndex: 0,
          scheme: "exact",
          network: "eip155:8453",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1234567890123456789012345678901234567890",
          amount: "10000",
        },
        signer,
      );

      const paymentRequired = {
        accepts: [
          {
            scheme: "exact",
            network: "eip155:8453",
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            payTo: "0x1234567890123456789012345678901234567890",
            amount: "10000",
          },
        ],
        extensions: {
          [OFFER_RECEIPT]: {
            info: {
              offers: [offer1],
            },
          },
        },
      };

      const offers = extractOffersFromPaymentRequired(paymentRequired as any);
      expect(offers).toHaveLength(1);
      expect(offers[0].format).toBe("jws");
    });

    it("returns empty array when no offers present", () => {
      const paymentRequired = {
        accepts: [],
        extensions: {},
      };

      const offers = extractOffersFromPaymentRequired(paymentRequired as any);
      expect(offers).toEqual([]);
    });

    it("returns empty array when extensions is undefined", () => {
      const paymentRequired = {
        accepts: [],
      };

      const offers = extractOffersFromPaymentRequired(paymentRequired as any);
      expect(offers).toEqual([]);
    });
  });

  describe("decodeSignedOffers", () => {
    it("decodes JWS offers with payload fields at top level", async () => {
      const keyPair = await generateES256KKeyPair();
      const signer = await createJWSSignerFromJWK(keyPair.privateKey, "did:web:example.com");

      const offer = await createOfferJWS(
        "https://api.example.com/resource",
        {
          acceptIndex: 0,
          scheme: "exact",
          network: "eip155:8453",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1234567890123456789012345678901234567890",
          amount: "10000",
        },
        signer,
      );

      const decoded = decodeSignedOffers([offer]);
      expect(decoded).toHaveLength(1);
      expect(decoded[0].network).toBe("eip155:8453");
      expect(decoded[0].amount).toBe("10000");
      expect(decoded[0].format).toBe("jws");
      expect(decoded[0].acceptIndex).toBe(0);
      expect(decoded[0].signedOffer).toBe(offer);
    });

    it("decodes EIP-712 offers", async () => {
      const account = privateKeyToAccount(TEST_PRIVATE_KEY);
      const offer = await createOfferEIP712(
        "https://api.example.com/resource",
        {
          acceptIndex: 1,
          scheme: "exact",
          network: "eip155:8453",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1234567890123456789012345678901234567890",
          amount: "5000",
        },
        8453,
        p => account.signTypedData(p),
      );

      const decoded = decodeSignedOffers([offer]);
      expect(decoded).toHaveLength(1);
      expect(decoded[0].network).toBe("eip155:8453");
      expect(decoded[0].amount).toBe("5000");
      expect(decoded[0].format).toBe("eip712");
      expect(decoded[0].acceptIndex).toBe(1);
    });

    it("returns empty array for empty input", () => {
      const decoded = decodeSignedOffers([]);
      expect(decoded).toEqual([]);
    });
  });

  describe("findAcceptsObjectFromSignedOffer", () => {
    it("finds matching accepts entry using acceptIndex hint", async () => {
      const keyPair = await generateES256KKeyPair();
      const signer = await createJWSSignerFromJWK(keyPair.privateKey, "did:web:example.com");

      const offer = await createOfferJWS(
        "https://api.example.com/resource",
        {
          acceptIndex: 0,
          scheme: "exact",
          network: "eip155:8453",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1234567890123456789012345678901234567890",
          amount: "10000",
        },
        signer,
      );

      const accepts = [
        {
          scheme: "exact",
          network: "eip155:8453",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1234567890123456789012345678901234567890",
          amount: "10000",
          maxAmountRequired: "10000",
        },
      ];

      const found = findAcceptsObjectFromSignedOffer(offer, accepts as any);
      expect(found).toBeDefined();
      expect(found?.network).toBe("eip155:8453");
    });

    it("finds matching accepts entry with DecodedOffer", async () => {
      const keyPair = await generateES256KKeyPair();
      const signer = await createJWSSignerFromJWK(keyPair.privateKey, "did:web:example.com");

      const offer = await createOfferJWS(
        "https://api.example.com/resource",
        {
          acceptIndex: 0,
          scheme: "exact",
          network: "eip155:8453",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1234567890123456789012345678901234567890",
          amount: "10000",
        },
        signer,
      );

      const decoded = decodeSignedOffers([offer])[0];
      const accepts = [
        {
          scheme: "exact",
          network: "eip155:8453",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1234567890123456789012345678901234567890",
          amount: "10000",
          maxAmountRequired: "10000",
        },
      ];

      const found = findAcceptsObjectFromSignedOffer(decoded, accepts as any);
      expect(found).toBeDefined();
      expect(found?.network).toBe("eip155:8453");
    });

    it("falls back to searching all accepts when hint misses", async () => {
      const keyPair = await generateES256KKeyPair();
      const signer = await createJWSSignerFromJWK(keyPair.privateKey, "did:web:example.com");

      const offer = await createOfferJWS(
        "https://api.example.com/resource",
        {
          acceptIndex: 5, // Wrong index
          scheme: "exact",
          network: "eip155:8453",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1234567890123456789012345678901234567890",
          amount: "10000",
        },
        signer,
      );

      const accepts = [
        {
          scheme: "exact",
          network: "eip155:8453",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1234567890123456789012345678901234567890",
          amount: "10000",
          maxAmountRequired: "10000",
        },
      ];

      const found = findAcceptsObjectFromSignedOffer(offer, accepts as any);
      expect(found).toBeDefined();
      expect(found?.network).toBe("eip155:8453");
    });

    it("returns undefined when no match found", async () => {
      const keyPair = await generateES256KKeyPair();
      const signer = await createJWSSignerFromJWK(keyPair.privateKey, "did:web:example.com");

      const offer = await createOfferJWS(
        "https://api.example.com/resource",
        {
          acceptIndex: 0,
          scheme: "exact",
          network: "eip155:8453",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1234567890123456789012345678901234567890",
          amount: "10000",
        },
        signer,
      );

      const accepts = [
        {
          scheme: "exact",
          network: "eip155:1", // Different network
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1234567890123456789012345678901234567890",
          amount: "10000",
          maxAmountRequired: "10000",
        },
      ];

      const found = findAcceptsObjectFromSignedOffer(offer, accepts as any);
      expect(found).toBeUndefined();
    });
  });

  describe("extractReceiptFromResponse", () => {
    it("extracts receipt from PAYMENT-RESPONSE header", async () => {
      const keyPair = await generateES256KKeyPair();
      const signer = await createJWSSignerFromJWK(keyPair.privateKey, "did:web:example.com");

      const receipt = await createReceiptJWS(
        {
          resourceUrl: "https://api.example.com/resource",
          payer: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
          network: "eip155:8453",
        },
        signer,
      );

      const settlementResponse = {
        success: true,
        extensions: {
          [OFFER_RECEIPT]: {
            info: { receipt },
          },
        },
      };

      const headers = new Headers();
      headers.set("PAYMENT-RESPONSE", btoa(JSON.stringify(settlementResponse)));

      const response = new Response("OK", { headers });
      const extracted = extractReceiptFromResponse(response);

      expect(extracted).toBeDefined();
      expect(extracted?.format).toBe("jws");
    });

    it("extracts receipt from X-PAYMENT-RESPONSE header", async () => {
      const keyPair = await generateES256KKeyPair();
      const signer = await createJWSSignerFromJWK(keyPair.privateKey, "did:web:example.com");

      const receipt = await createReceiptJWS(
        {
          resourceUrl: "https://api.example.com/resource",
          payer: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
          network: "eip155:8453",
        },
        signer,
      );

      const settlementResponse = {
        success: true,
        extensions: {
          [OFFER_RECEIPT]: {
            info: { receipt },
          },
        },
      };

      const headers = new Headers();
      headers.set("X-PAYMENT-RESPONSE", btoa(JSON.stringify(settlementResponse)));

      const response = new Response("OK", { headers });
      const extracted = extractReceiptFromResponse(response);

      expect(extracted).toBeDefined();
      expect(extracted?.format).toBe("jws");
    });

    it("returns undefined when no header present", () => {
      const response = new Response("OK");
      const extracted = extractReceiptFromResponse(response);
      expect(extracted).toBeUndefined();
    });

    it("returns undefined when header has no receipt", () => {
      const settlementResponse = {
        success: true,
        extensions: {},
      };

      const headers = new Headers();
      headers.set("PAYMENT-RESPONSE", btoa(JSON.stringify(settlementResponse)));

      const response = new Response("OK", { headers });
      const extracted = extractReceiptFromResponse(response);
      expect(extracted).toBeUndefined();
    });
  });

  describe("verifyReceiptMatchesOffer", () => {
    it("returns true when receipt matches offer and payer", async () => {
      const keyPair = await generateES256KKeyPair();
      const signer = await createJWSSignerFromJWK(keyPair.privateKey, "did:web:example.com");
      const payerAddress = "0x857b06519E91e3A54538791bDbb0E22373e36b66";

      const offer = await createOfferJWS(
        "https://api.example.com/resource",
        {
          acceptIndex: 0,
          scheme: "exact",
          network: "eip155:8453",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1234567890123456789012345678901234567890",
          amount: "10000",
        },
        signer,
      );

      const receipt = await createReceiptJWS(
        {
          resourceUrl: "https://api.example.com/resource",
          payer: payerAddress,
          network: "eip155:8453",
        },
        signer,
      );

      const decoded = decodeSignedOffers([offer])[0];
      const result = verifyReceiptMatchesOffer(receipt, decoded, [payerAddress]);
      expect(result).toBe(true);
    });

    it("returns true with case-insensitive payer address match", async () => {
      const keyPair = await generateES256KKeyPair();
      const signer = await createJWSSignerFromJWK(keyPair.privateKey, "did:web:example.com");

      const offer = await createOfferJWS(
        "https://api.example.com/resource",
        {
          acceptIndex: 0,
          scheme: "exact",
          network: "eip155:8453",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1234567890123456789012345678901234567890",
          amount: "10000",
        },
        signer,
      );

      const receipt = await createReceiptJWS(
        {
          resourceUrl: "https://api.example.com/resource",
          payer: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
          network: "eip155:8453",
        },
        signer,
      );

      const decoded = decodeSignedOffers([offer])[0];
      // Uppercase payer address should still match
      const result = verifyReceiptMatchesOffer(receipt, decoded, [
        "0x857B06519E91E3A54538791BDBB0E22373E36B66",
      ]);
      expect(result).toBe(true);
    });

    it("returns false when resourceUrl does not match", async () => {
      const keyPair = await generateES256KKeyPair();
      const signer = await createJWSSignerFromJWK(keyPair.privateKey, "did:web:example.com");
      const payerAddress = "0x857b06519E91e3A54538791bDbb0E22373e36b66";

      const offer = await createOfferJWS(
        "https://api.example.com/resource",
        {
          acceptIndex: 0,
          scheme: "exact",
          network: "eip155:8453",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1234567890123456789012345678901234567890",
          amount: "10000",
        },
        signer,
      );

      const receipt = await createReceiptJWS(
        {
          resourceUrl: "https://api.example.com/different-resource",
          payer: payerAddress,
          network: "eip155:8453",
        },
        signer,
      );

      const decoded = decodeSignedOffers([offer])[0];
      const result = verifyReceiptMatchesOffer(receipt, decoded, [payerAddress]);
      expect(result).toBe(false);
    });

    it("returns false when network does not match", async () => {
      const keyPair = await generateES256KKeyPair();
      const signer = await createJWSSignerFromJWK(keyPair.privateKey, "did:web:example.com");
      const payerAddress = "0x857b06519E91e3A54538791bDbb0E22373e36b66";

      const offer = await createOfferJWS(
        "https://api.example.com/resource",
        {
          acceptIndex: 0,
          scheme: "exact",
          network: "eip155:8453",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1234567890123456789012345678901234567890",
          amount: "10000",
        },
        signer,
      );

      const receipt = await createReceiptJWS(
        {
          resourceUrl: "https://api.example.com/resource",
          payer: payerAddress,
          network: "eip155:1", // Different network
        },
        signer,
      );

      const decoded = decodeSignedOffers([offer])[0];
      const result = verifyReceiptMatchesOffer(receipt, decoded, [payerAddress]);
      expect(result).toBe(false);
    });

    it("returns false when payer does not match any address", async () => {
      const keyPair = await generateES256KKeyPair();
      const signer = await createJWSSignerFromJWK(keyPair.privateKey, "did:web:example.com");

      const offer = await createOfferJWS(
        "https://api.example.com/resource",
        {
          acceptIndex: 0,
          scheme: "exact",
          network: "eip155:8453",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1234567890123456789012345678901234567890",
          amount: "10000",
        },
        signer,
      );

      const receipt = await createReceiptJWS(
        {
          resourceUrl: "https://api.example.com/resource",
          payer: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
          network: "eip155:8453",
        },
        signer,
      );

      const decoded = decodeSignedOffers([offer])[0];
      // Different payer address
      const result = verifyReceiptMatchesOffer(receipt, decoded, [
        "0xDifferentAddress1234567890123456789012345",
      ]);
      expect(result).toBe(false);
    });

    it("returns true when payer matches one of multiple addresses", async () => {
      const keyPair = await generateES256KKeyPair();
      const signer = await createJWSSignerFromJWK(keyPair.privateKey, "did:web:example.com");
      const payerAddress = "0x857b06519E91e3A54538791bDbb0E22373e36b66";

      const offer = await createOfferJWS(
        "https://api.example.com/resource",
        {
          acceptIndex: 0,
          scheme: "exact",
          network: "eip155:8453",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1234567890123456789012345678901234567890",
          amount: "10000",
        },
        signer,
      );

      const receipt = await createReceiptJWS(
        {
          resourceUrl: "https://api.example.com/resource",
          payer: payerAddress,
          network: "eip155:8453",
        },
        signer,
      );

      const decoded = decodeSignedOffers([offer])[0];
      // Multiple addresses, one matches
      const result = verifyReceiptMatchesOffer(receipt, decoded, [
        "0xOtherAddress12345678901234567890123456789",
        payerAddress,
        "SolanaAddressHere",
      ]);
      expect(result).toBe(true);
    });
  });
});

describe("Utility Functions", () => {
  describe("hashCanonical", () => {
    it("returns SHA-256 hash of canonicalized object", async () => {
      const hash = await hashCanonical({ b: 2, a: 1 });
      expect(hash).toBeInstanceOf(Uint8Array);
      expect(hash.length).toBe(32); // SHA-256 produces 32 bytes
    });

    it("produces same hash for equivalent objects with different key order", async () => {
      const hash1 = await hashCanonical({ z: 1, a: 2 });
      const hash2 = await hashCanonical({ a: 2, z: 1 });
      expect(hash1).toEqual(hash2);
    });

    it("produces different hashes for different objects", async () => {
      const hash1 = await hashCanonical({ a: 1 });
      const hash2 = await hashCanonical({ a: 2 });
      expect(hash1).not.toEqual(hash2);
    });
  });

  describe("getCanonicalBytes", () => {
    it("returns UTF-8 encoded canonical JSON", () => {
      const bytes = getCanonicalBytes({ b: 2, a: 1 });
      expect(bytes).toBeInstanceOf(Uint8Array);
      const decoded = new TextDecoder().decode(bytes);
      expect(decoded).toBe('{"a":1,"b":2}');
    });

    it("handles nested objects", () => {
      const bytes = getCanonicalBytes({ outer: { z: 1, a: 2 } });
      const decoded = new TextDecoder().decode(bytes);
      expect(decoded).toBe('{"outer":{"a":2,"z":1}}');
    });
  });

  describe("hashOfferTypedData", () => {
    it("returns EIP-712 hash for offer payload", () => {
      const payload: OfferPayload = {
        version: 1,
        resourceUrl: "https://api.example.com/resource",
        scheme: "exact",
        network: "eip155:8453",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x1234567890123456789012345678901234567890",
        amount: "10000",
        validUntil: 1700000000,
      };
      const hash = hashOfferTypedData(payload, 8453);
      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("produces different hashes for different chain IDs", () => {
      const payload: OfferPayload = {
        version: 1,
        resourceUrl: "https://api.example.com/resource",
        scheme: "exact",
        network: "eip155:8453",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x1234567890123456789012345678901234567890",
        amount: "10000",
        validUntil: 1700000000,
      };
      const hash1 = hashOfferTypedData(payload, 8453);
      const hash2 = hashOfferTypedData(payload, 1);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("hashReceiptTypedData", () => {
    it("returns EIP-712 hash for receipt payload", () => {
      const payload: ReceiptPayload = {
        version: 1,
        network: "eip155:8453",
        resourceUrl: "https://api.example.com/resource",
        payer: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
        issuedAt: 1700000000,
        transaction: "",
      };
      const hash = hashReceiptTypedData(payload, 8453);
      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("produces different hashes for different payloads", () => {
      const payload1: ReceiptPayload = {
        version: 1,
        network: "eip155:8453",
        resourceUrl: "https://api.example.com/resource",
        payer: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
        issuedAt: 1700000000,
        transaction: "",
      };
      const payload2: ReceiptPayload = {
        ...payload1,
        payer: "0x1234567890123456789012345678901234567890",
      };
      const hash1 = hashReceiptTypedData(payload1, 8453);
      const hash2 = hashReceiptTypedData(payload2, 8453);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("extractEIP155ChainId", () => {
    it("extracts chain ID from valid eip155 network string", () => {
      expect(extractEIP155ChainId("eip155:8453")).toBe(8453);
      expect(extractEIP155ChainId("eip155:1")).toBe(1);
      expect(extractEIP155ChainId("eip155:137")).toBe(137);
    });

    it("throws for non-eip155 networks", () => {
      expect(() => extractEIP155ChainId("solana:mainnet")).toThrow(
        'Invalid network format: solana:mainnet. Expected "eip155:<chainId>"',
      );
    });

    it("throws for malformed eip155 strings", () => {
      expect(() => extractEIP155ChainId("eip155:")).toThrow(
        'Invalid network format: eip155:. Expected "eip155:<chainId>"',
      );
      expect(() => extractEIP155ChainId("eip155:abc")).toThrow(
        'Invalid network format: eip155:abc. Expected "eip155:<chainId>"',
      );
    });

    it("throws for strings without colon", () => {
      expect(() => extractEIP155ChainId("base")).toThrow(
        'Invalid network format: base. Expected "eip155:<chainId>"',
      );
    });
  });

  describe("createReceiptDomain", () => {
    it("creates receipt domain with correct name and version", () => {
      const domain = createReceiptDomain(8453);
      expect(domain.name).toBe("x402 receipt");
      expect(domain.version).toBe("1");
      expect(domain.chainId).toBe(8453);
    });
  });

  describe("prepareReceiptForEIP712", () => {
    it("converts receipt payload to EIP-712 message format", () => {
      const payload: ReceiptPayload = {
        version: 1,
        network: "eip155:8453",
        resourceUrl: "https://api.example.com/resource",
        payer: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
        issuedAt: 1700000000,
        transaction: "0xabc123",
      };
      const prepared = prepareReceiptForEIP712(payload);
      expect(prepared.version).toBe(BigInt(1));
      expect(prepared.network).toBe("eip155:8453");
      expect(prepared.resourceUrl).toBe("https://api.example.com/resource");
      expect(prepared.payer).toBe("0x857b06519E91e3A54538791bDbb0E22373e36b66");
      expect(prepared.issuedAt).toBe(BigInt(1700000000));
      expect(prepared.transaction).toBe("0xabc123");
    });
  });

  describe("RECEIPT_TYPES", () => {
    it("has correct EIP-712 type definition", () => {
      expect(RECEIPT_TYPES.Receipt).toBeDefined();
      expect(RECEIPT_TYPES.Receipt).toHaveLength(6);
      const fieldNames = RECEIPT_TYPES.Receipt.map(f => f.name);
      expect(fieldNames).toContain("version");
      expect(fieldNames).toContain("network");
      expect(fieldNames).toContain("resourceUrl");
      expect(fieldNames).toContain("payer");
      expect(fieldNames).toContain("issuedAt");
      expect(fieldNames).toContain("transaction");
    });
  });
});

describe("Server Extension Utilities", () => {
  describe("declareOfferReceiptExtension", () => {
    it("returns extension declaration with default values", () => {
      const declaration = declareOfferReceiptExtension();
      expect(declaration).toHaveProperty(OFFER_RECEIPT);
      expect(declaration[OFFER_RECEIPT].includeTxHash).toBeUndefined();
      expect(declaration[OFFER_RECEIPT].offerValiditySeconds).toBeUndefined();
    });

    it("returns extension declaration with custom config", () => {
      const declaration = declareOfferReceiptExtension({
        includeTxHash: true,
        offerValiditySeconds: 120,
      });
      expect(declaration[OFFER_RECEIPT].includeTxHash).toBe(true);
      expect(declaration[OFFER_RECEIPT].offerValiditySeconds).toBe(120);
    });
  });

  describe("createJWSOfferReceiptIssuer", () => {
    it("creates issuer with correct properties", async () => {
      const keyPair = await generateES256KKeyPair();
      const jwsSigner = await createJWSSignerFromJWK(
        keyPair.privateKey,
        "did:web:api.example.com#key-1",
      );

      const issuer = createJWSOfferReceiptIssuer("did:web:api.example.com#key-1", jwsSigner);

      expect(issuer.kid).toBe("did:web:api.example.com#key-1");
      expect(issuer.format).toBe("jws");
      expect(typeof issuer.issueOffer).toBe("function");
      expect(typeof issuer.issueReceipt).toBe("function");
    });

    it("issueOffer creates valid JWS offer", async () => {
      const keyPair = await generateES256KKeyPair();
      const jwsSigner = await createJWSSignerFromJWK(
        keyPair.privateKey,
        "did:web:api.example.com#key-1",
      );
      const issuer = createJWSOfferReceiptIssuer("did:web:api.example.com#key-1", jwsSigner);

      const offer = await issuer.issueOffer("https://api.example.com/resource", {
        acceptIndex: 0,
        scheme: "exact",
        network: "eip155:8453",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x1234567890123456789012345678901234567890",
        amount: "10000",
      });

      expect(offer.format).toBe("jws");
      expect(offer.signature).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    });

    it("issueReceipt creates valid JWS receipt", async () => {
      const keyPair = await generateES256KKeyPair();
      const jwsSigner = await createJWSSignerFromJWK(
        keyPair.privateKey,
        "did:web:api.example.com#key-1",
      );
      const issuer = createJWSOfferReceiptIssuer("did:web:api.example.com#key-1", jwsSigner);

      const receipt = await issuer.issueReceipt(
        "https://api.example.com/resource",
        "0x857b06519E91e3A54538791bDbb0E22373e36b66",
        "eip155:8453",
        "0xabc123",
      );

      expect(receipt.format).toBe("jws");
      expect(receipt.signature).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    });
  });

  describe("createEIP712OfferReceiptIssuer", () => {
    const account = privateKeyToAccount(TEST_PRIVATE_KEY);

    it("creates issuer with correct properties", () => {
      const issuer = createEIP712OfferReceiptIssuer(`did:pkh:eip155:8453:${account.address}`, p =>
        account.signTypedData(p),
      );

      expect(issuer.kid).toBe(`did:pkh:eip155:8453:${account.address}`);
      expect(issuer.format).toBe("eip712");
      expect(typeof issuer.issueOffer).toBe("function");
      expect(typeof issuer.issueReceipt).toBe("function");
    });

    it("issueOffer creates valid EIP-712 offer", async () => {
      const issuer = createEIP712OfferReceiptIssuer(`did:pkh:eip155:8453:${account.address}`, p =>
        account.signTypedData(p),
      );

      const offer = await issuer.issueOffer("https://api.example.com/resource", {
        acceptIndex: 0,
        scheme: "exact",
        network: "eip155:8453",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x1234567890123456789012345678901234567890",
        amount: "10000",
      });

      expect(offer.format).toBe("eip712");
      expect(offer).toHaveProperty("payload");
      expect(offer.signature).toMatch(/^0x[a-fA-F0-9]{130}$/);
    });

    it("issueReceipt creates valid EIP-712 receipt", async () => {
      const issuer = createEIP712OfferReceiptIssuer(`did:pkh:eip155:8453:${account.address}`, p =>
        account.signTypedData(p),
      );

      const receipt = await issuer.issueReceipt(
        "https://api.example.com/resource",
        "0x857b06519E91e3A54538791bDbb0E22373e36b66",
        "eip155:8453",
        "0xabc123",
      );

      expect(receipt.format).toBe("eip712");
      expect(receipt).toHaveProperty("payload");
      expect(receipt.signature).toMatch(/^0x[a-fA-F0-9]{130}$/);
    });
  });

  /**
   * NOTE: createOfferReceiptExtension is not tested here because it requires
   * a mock ResourceServer with PaymentRequiredContext and SettleResultContext.
   * The extension hooks (enrichPaymentRequiredResponse, enrichSettlementResponse)
   * depend on the full server context which would require significant mocking.
   * The signer factories above test the core signing functionality.
   */
});

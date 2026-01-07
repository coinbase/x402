/**
 * Tests for Sign-In-With-X Extension
 */

import { describe, it, expect } from "vitest";
import {
  SIGN_IN_WITH_X,
  SIWxPayloadSchema,
  parseSIWxHeader,
  encodeSIWxHeader,
  encodeSIWxHeaderRaw,
  declareSIWxExtension,
  validateSIWxMessage,
  createSIWxMessage,
  createSIWxPayload,
  verifySIWxSignature,
} from "../src/sign-in-with-x/index";
import { safeBase64Encode } from "@x402/core/utils";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const validPayload = {
  domain: "api.example.com",
  address: "0x1234567890123456789012345678901234567890",
  statement: "Sign in to access your content",
  uri: "https://api.example.com/data",
  version: "1",
  chainId: "eip155:8453",
  nonce: "abc123def456",
  issuedAt: new Date().toISOString(),
  expirationTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  resources: ["https://api.example.com/data"],
  signature: "0xabcdef1234567890",
};

describe("Sign-In-With-X Extension", () => {
  describe("SIGN_IN_WITH_X constant", () => {
    it("should export the correct extension identifier", () => {
      expect(SIGN_IN_WITH_X).toBe("sign-in-with-x");
    });
  });

  describe("SIWxPayloadSchema", () => {
    it("should validate a correct payload", () => {
      const result = SIWxPayloadSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it("should reject payload missing required fields", () => {
      const invalidPayload = { domain: "example.com" };
      const result = SIWxPayloadSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it("should accept payload with optional fields omitted", () => {
      const minimalPayload = {
        domain: "api.example.com",
        address: "0x1234567890123456789012345678901234567890",
        uri: "https://api.example.com",
        version: "1",
        chainId: "eip155:8453",
        nonce: "abc123",
        issuedAt: new Date().toISOString(),
        signature: "0xabcdef",
      };
      const result = SIWxPayloadSchema.safeParse(minimalPayload);
      expect(result.success).toBe(true);
    });
  });

  describe("parseSIWxHeader", () => {
    it("should parse base64-encoded header", () => {
      const encoded = safeBase64Encode(JSON.stringify(validPayload));
      const parsed = parseSIWxHeader(encoded);
      expect(parsed.domain).toBe(validPayload.domain);
      expect(parsed.address).toBe(validPayload.address);
      expect(parsed.signature).toBe(validPayload.signature);
    });

    it("should parse raw JSON header (backwards compatibility)", () => {
      const raw = JSON.stringify(validPayload);
      const parsed = parseSIWxHeader(raw);
      expect(parsed.domain).toBe(validPayload.domain);
      expect(parsed.signature).toBe(validPayload.signature);
    });

    it("should throw on invalid JSON", () => {
      expect(() => parseSIWxHeader("not-valid-json")).toThrow("Invalid SIWX header");
    });

    it("should throw on missing required fields", () => {
      const incomplete = JSON.stringify({ domain: "example.com" });
      expect(() => parseSIWxHeader(incomplete)).toThrow("Invalid SIWX header");
    });
  });

  describe("encodeSIWxHeader", () => {
    it("should encode payload as base64", () => {
      const encoded = encodeSIWxHeader(validPayload);
      expect(() => Buffer.from(encoded, "base64")).not.toThrow();
      const decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf-8"));
      expect(decoded.domain).toBe(validPayload.domain);
    });
  });

  describe("encodeSIWxHeaderRaw", () => {
    it("should encode payload as raw JSON", () => {
      const encoded = encodeSIWxHeaderRaw(validPayload);
      const decoded = JSON.parse(encoded);
      expect(decoded.domain).toBe(validPayload.domain);
    });
  });

  describe("declareSIWxExtension", () => {
    it("should create extension with auto-generated fields", () => {
      const result = declareSIWxExtension({
        resourceUri: "https://api.example.com/data",
        network: "eip155:8453",
        statement: "Sign in to access",
      });

      expect(result).toHaveProperty("sign-in-with-x");
      const extension = result["sign-in-with-x"];
      expect(extension.info.domain).toBe("api.example.com");
      expect(extension.info.uri).toBe("https://api.example.com/data");
      expect(extension.info.chainId).toBe("eip155:8453");
      expect(extension.info.nonce).toBeDefined();
      expect(extension.info.nonce.length).toBe(32);
      expect(extension.info.issuedAt).toBeDefined();
      expect(extension.schema).toBeDefined();
    });
  });

  describe("validateSIWxMessage", () => {
    it("should validate correct message", async () => {
      const now = new Date();
      const payload = {
        ...validPayload,
        issuedAt: now.toISOString(),
        expirationTime: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
      };

      const result = await validateSIWxMessage(payload, "https://api.example.com/data");
      expect(result.valid).toBe(true);
    });

    it("should reject domain mismatch", async () => {
      const result = await validateSIWxMessage(validPayload, "https://different.example.com/data");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Domain mismatch");
    });
  });

  describe("createSIWxMessage", () => {
    it("should create EIP-4361 format message", () => {
      const serverInfo = {
        domain: "api.example.com",
        uri: "https://api.example.com",
        statement: "Sign in to access",
        version: "1",
        chainId: "eip155:8453",
        nonce: "abc12345def67890",
        issuedAt: "2024-01-01T00:00:00.000Z",
        resources: ["https://api.example.com"],
      };

      const message = createSIWxMessage(serverInfo, "0x1234567890123456789012345678901234567890");

      expect(message).toContain("api.example.com wants you to sign in");
      expect(message).toContain("0x1234567890123456789012345678901234567890");
      expect(message).toContain("Nonce: abc12345def67890");
      expect(message).toContain("Chain ID: 8453");
    });
  });

  describe("Integration - encode/parse roundtrip", () => {
    it("should roundtrip through encode and parse", () => {
      const encoded = encodeSIWxHeader(validPayload);
      const parsed = parseSIWxHeader(encoded);

      expect(parsed.domain).toBe(validPayload.domain);
      expect(parsed.address).toBe(validPayload.address);
      expect(parsed.signature).toBe(validPayload.signature);
    });
  });

  describe("Integration - full signing and verification", () => {
    it("should sign and verify a message with a real wallet", async () => {
      const account = privateKeyToAccount(generatePrivateKey());

      const extension = declareSIWxExtension({
        resourceUri: "https://api.example.com/resource",
        network: "eip155:8453",
        statement: "Sign in to access your content",
      });

      const payload = await createSIWxPayload(extension["sign-in-with-x"].info, account);
      const header = encodeSIWxHeader(payload);
      const parsed = parseSIWxHeader(header);

      const validation = await validateSIWxMessage(parsed, "https://api.example.com/resource");
      expect(validation.valid).toBe(true);

      const verification = await verifySIWxSignature(parsed);
      expect(verification.valid).toBe(true);
      expect(verification.address?.toLowerCase()).toBe(account.address.toLowerCase());
    });

    it("should reject tampered signature", async () => {
      const account = privateKeyToAccount(generatePrivateKey());

      const extension = declareSIWxExtension({
        resourceUri: "https://api.example.com/resource",
        network: "eip155:8453",
      });

      const payload = await createSIWxPayload(extension["sign-in-with-x"].info, account);
      payload.signature = "0x" + "00".repeat(65); // Invalid signature

      const verification = await verifySIWxSignature(payload);
      expect(verification.valid).toBe(false);
    });
  });
});

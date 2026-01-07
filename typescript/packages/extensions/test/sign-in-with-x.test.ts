/**
 * Tests for Sign-In-With-X Extension
 */

import { describe, it, expect } from "vitest";
import {
  SIWxPayloadSchema,
  parseSIWxHeader,
  encodeSIWxHeader,
  encodeSIWxHeaderRaw,
  declareSIWxExtension,
  validateSIWxMessage,
  createSIWxMessage,
  createSIWxPayload,
  verifySIWxSignature,
  SOLANA_MAINNET,
  SOLANA_DEVNET,
  formatSIWSMessage,
  decodeBase58,
  encodeBase58,
  extractSolanaNetwork,
  verifySolanaSignature,
} from "../src/sign-in-with-x/index";
import { safeBase64Encode } from "@x402/core/utils";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import nacl from "tweetnacl";

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

    it("should throw on invalid base64", () => {
      expect(() => parseSIWxHeader("not-valid-base64!@#")).toThrow("not valid base64");
    });

    it("should throw on invalid JSON in base64", () => {
      const invalidJson = safeBase64Encode("not valid json");
      expect(() => parseSIWxHeader(invalidJson)).toThrow("not valid JSON");
    });

    it("should throw on missing required fields", () => {
      const incomplete = safeBase64Encode(JSON.stringify({ domain: "example.com" }));
      expect(() => parseSIWxHeader(incomplete)).toThrow("Invalid SIWX header");
    });
  });

  describe("encodeSIWxHeader", () => {
    it("should encode payload as base64 and round-trip correctly", () => {
      const encoded = encodeSIWxHeader(validPayload);
      const decoded = parseSIWxHeader(encoded);
      expect(decoded.domain).toBe(validPayload.domain);
      expect(decoded.address).toBe(validPayload.address);
      expect(decoded.signature).toBe(validPayload.signature);
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

  describe("Solana constants", () => {
    it("should export Solana network constants", () => {
      expect(SOLANA_MAINNET).toBe("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
      expect(SOLANA_DEVNET).toBe("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1");
    });
  });

  describe("Base58 encoding/decoding", () => {
    it("should roundtrip encode/decode", () => {
      const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const encoded = encodeBase58(original);
      const decoded = decodeBase58(encoded);
      expect(decoded).toEqual(original);
    });

    it("should handle leading zeros", () => {
      const withLeadingZeros = new Uint8Array([0, 0, 1, 2, 3]);
      const encoded = encodeBase58(withLeadingZeros);
      const decoded = decodeBase58(encoded);
      expect(decoded).toEqual(withLeadingZeros);
    });

    it("should decode known Solana addresses", () => {
      // This is a valid 32-byte Solana public key
      const address = "11111111111111111111111111111111";
      const decoded = decodeBase58(address);
      expect(decoded.length).toBe(32);
    });

    it("should throw on invalid Base58 characters", () => {
      expect(() => decodeBase58("invalid0OIl")).toThrow("Unknown letter");
    });
  });

  describe("extractSolanaNetwork", () => {
    it("should extract mainnet", () => {
      expect(extractSolanaNetwork(SOLANA_MAINNET)).toBe("mainnet");
    });

    it("should extract devnet", () => {
      expect(extractSolanaNetwork(SOLANA_DEVNET)).toBe("devnet");
    });

    it("should return reference for unknown networks", () => {
      expect(extractSolanaNetwork("solana:customnetwork123")).toBe("customnetwork123");
    });
  });

  describe("formatSIWSMessage", () => {
    it("should format SIWS message correctly", () => {
      const info = {
        domain: "api.example.com",
        uri: "https://api.example.com/data",
        statement: "Sign in to access",
        version: "1",
        chainId: SOLANA_MAINNET,
        nonce: "abc123",
        issuedAt: "2024-01-01T00:00:00.000Z",
        resources: ["https://api.example.com/data"],
      };

      const message = formatSIWSMessage(info, "BSmWDgE9ex6dZYbiTsJGcwMEgFp8q4aWh92hdErQPeVW");

      expect(message).toContain("wants you to sign in with your Solana account:");
      expect(message).toContain("BSmWDgE9ex6dZYbiTsJGcwMEgFp8q4aWh92hdErQPeVW");
      expect(message).toContain("Chain ID: mainnet");
      expect(message).toContain("Nonce: abc123");
      expect(message).toContain("Sign in to access");
    });

    it("should handle message without statement", () => {
      const info = {
        domain: "api.example.com",
        uri: "https://api.example.com",
        version: "1",
        chainId: SOLANA_DEVNET,
        nonce: "xyz789",
        issuedAt: "2024-01-01T00:00:00.000Z",
      };

      const message = formatSIWSMessage(info, "TestAddress123");

      expect(message).toContain("wants you to sign in with your Solana account:");
      expect(message).toContain("Chain ID: devnet");
      expect(message).not.toContain("Sign in to access");
    });
  });

  describe("createSIWxMessage - chain routing", () => {
    it("should route EVM chains to SIWE format", () => {
      const info = {
        domain: "api.example.com",
        uri: "https://api.example.com",
        version: "1",
        chainId: "eip155:1",
        nonce: "abc12345678",
        issuedAt: "2024-01-01T00:00:00.000Z",
      };

      const message = createSIWxMessage(info, "0x1234567890123456789012345678901234567890");

      expect(message).toContain("wants you to sign in with your Ethereum account:");
      expect(message).toContain("Chain ID: 1");
    });

    it("should route Solana chains to SIWS format", () => {
      const info = {
        domain: "api.example.com",
        uri: "https://api.example.com",
        version: "1",
        chainId: SOLANA_MAINNET,
        nonce: "abc12345678",
        issuedAt: "2024-01-01T00:00:00.000Z",
      };

      const message = createSIWxMessage(info, "BSmWDgE9ex6dZYbiTsJGcwMEgFp8q4aWh92hdErQPeVW");

      expect(message).toContain("wants you to sign in with your Solana account:");
      expect(message).toContain("Chain ID: mainnet");
    });

    it("should throw for unsupported chain namespaces", () => {
      const info = {
        domain: "api.example.com",
        uri: "https://api.example.com",
        version: "1",
        chainId: "cosmos:cosmoshub-4",
        nonce: "abc12345678",
        issuedAt: "2024-01-01T00:00:00.000Z",
      };

      expect(() => createSIWxMessage(info, "cosmos1...")).toThrow("Unsupported chain namespace");
    });
  });

  describe("Solana signature verification", () => {
    it("should verify valid Ed25519 signature", () => {
      // Generate a test keypair
      const keypair = nacl.sign.keyPair();
      const message = "Test message for signing";
      const messageBytes = new TextEncoder().encode(message);
      const signature = nacl.sign.detached(messageBytes, keypair.secretKey);

      const valid = verifySolanaSignature(message, signature, keypair.publicKey);
      expect(valid).toBe(true);
    });

    it("should reject invalid signature", () => {
      const keypair = nacl.sign.keyPair();
      const message = "Test message";
      const wrongSignature = new Uint8Array(64).fill(0);

      const valid = verifySolanaSignature(message, wrongSignature, keypair.publicKey);
      expect(valid).toBe(false);
    });

    it("should reject signature from different key", () => {
      const keypair1 = nacl.sign.keyPair();
      const keypair2 = nacl.sign.keyPair();
      const message = "Test message";
      const messageBytes = new TextEncoder().encode(message);
      const signature = nacl.sign.detached(messageBytes, keypair1.secretKey);

      // Verify with different public key
      const valid = verifySolanaSignature(message, signature, keypair2.publicKey);
      expect(valid).toBe(false);
    });
  });

  describe("verifySIWxSignature - chain routing", () => {
    it("should reject unsupported chain namespace", async () => {
      const payload = {
        ...validPayload,
        chainId: "cosmos:cosmoshub-4",
      };

      const result = await verifySIWxSignature(payload);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Unsupported chain namespace");
    });

    it("should verify Solana signatures", async () => {
      // Generate Solana keypair
      const keypair = nacl.sign.keyPair();
      const address = encodeBase58(keypair.publicKey);

      const serverInfo = {
        domain: "api.example.com",
        uri: "https://api.example.com/data",
        version: "1",
        chainId: SOLANA_MAINNET,
        nonce: "test123",
        issuedAt: new Date().toISOString(),
      };

      // Create and sign SIWS message
      const message = formatSIWSMessage(serverInfo, address);
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
      const signature = encodeBase58(signatureBytes);

      const payload = {
        ...serverInfo,
        address,
        signature,
      };

      const result = await verifySIWxSignature(payload);
      expect(result.valid).toBe(true);
      expect(result.address).toBe(address);
    });

    it("should reject invalid Solana signature length", async () => {
      const payload = {
        domain: "api.example.com",
        uri: "https://api.example.com",
        version: "1",
        chainId: SOLANA_MAINNET,
        nonce: "test123",
        issuedAt: new Date().toISOString(),
        address: encodeBase58(new Uint8Array(32).fill(1)), // Valid 32-byte key
        signature: encodeBase58(new Uint8Array(32).fill(0)), // Invalid 32-byte sig (should be 64)
      };

      const result = await verifySIWxSignature(payload);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid signature length");
    });
  });
});

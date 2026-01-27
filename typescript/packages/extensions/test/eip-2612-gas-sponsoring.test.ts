/**
 * Tests for EIP-2612 Gas Sponsoring Extension
 *
 * Tests the extension helpers for gasless ERC-20 approval via EIP-2612 permit.
 */

import { describe, it, expect } from "vitest";
import {
  // Constants
  EIP2612_GAS_SPONSORING,
  CANONICAL_PERMIT2,
  MAX_UINT256,
  DEFAULT_PERMIT_VALIDITY_SECONDS,
  MIN_DEADLINE_BUFFER_SECONDS,
  // Types
  type EIP2612GasSponsoringInfo,
  type EIP2612GasSponsoringDeclaration,
  // Schemas
  EIP2612_GAS_SPONSORING_SCHEMA,
  EIP2612_GAS_SPONSORING_DECLARATION_SCHEMA,
  // Declaration
  declareEIP2612GasSponsoringExtension,
  supportsEIP2612GasSponsoring,
  // Validation
  validateEIP2612GasSponsoringSchema,
  validateEIP2612GasSponsoringInfo,
  validateEIP2612DomainRequirements,
  // Extraction
  extractEIP2612GasSponsoring,
  hasEIP2612GasSponsoring,
  extractValidEIP2612GasSponsoring,
} from "../src/eip-2612-gas-sponsoring";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";

// Test fixtures
const VALID_ADDRESS = "0x1234567890123456789012345678901234567890";
const VALID_ASSET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on Base
const VALID_NONCE = "0";
const FUTURE_DEADLINE = String(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now
const PAST_DEADLINE = String(Math.floor(Date.now() / 1000) - 3600); // 1 hour ago
const SOON_DEADLINE = String(Math.floor(Date.now() / 1000) + 30); // 30 seconds from now (less than buffer)

// Valid 65-byte signature (130 hex chars + 0x prefix)
const VALID_SIGNATURE = "0x" + "a".repeat(128) + "1c"; // r (64) + s (64) + v (2) = 130 hex chars

const createValidInfo = (
  overrides: Partial<EIP2612GasSponsoringInfo> = {},
): EIP2612GasSponsoringInfo => ({
  from: VALID_ADDRESS,
  asset: VALID_ASSET,
  spender: CANONICAL_PERMIT2,
  amount: MAX_UINT256,
  nonce: VALID_NONCE,
  deadline: FUTURE_DEADLINE,
  signature: VALID_SIGNATURE,
  version: "1",
  ...overrides,
});

const createValidRequirements = (
  overrides: Partial<PaymentRequirements> = {},
): PaymentRequirements =>
  ({
    scheme: "exact",
    network: "eip155:8453",
    asset: VALID_ASSET,
    amount: "10000",
    payTo: VALID_ADDRESS,
    maxTimeoutSeconds: 60,
    extra: {
      name: "USD Coin",
      version: "2",
    },
    ...overrides,
  }) as PaymentRequirements;

const createValidPayload = (
  info: EIP2612GasSponsoringInfo | null = null,
  overrides: Partial<PaymentPayload> = {},
): PaymentPayload =>
  ({
    x402Version: 2,
    scheme: "exact",
    network: "eip155:8453",
    payload: {
      signature: VALID_SIGNATURE,
      permit2Authorization: {
        permitted: { token: VALID_ASSET, amount: "10000" },
        from: VALID_ADDRESS,
        spender: VALID_ADDRESS,
        nonce: "123",
        deadline: FUTURE_DEADLINE,
        witness: { to: VALID_ADDRESS, validAfter: "0", extra: {} },
      },
    },
    accepted: {} as PaymentRequirements,
    ...(info
      ? {
          extensions: {
            [EIP2612_GAS_SPONSORING]: { info },
          },
        }
      : {}),
    ...overrides,
  }) as PaymentPayload;

describe("EIP-2612 Gas Sponsoring Extension", () => {
  describe("Constants", () => {
    it("should export the correct extension identifier", () => {
      expect(EIP2612_GAS_SPONSORING).toBe("eip2612GasSponsoring");
    });

    it("should export the canonical Permit2 address", () => {
      expect(CANONICAL_PERMIT2).toBe("0x000000000022D473030F116dDEE9F6B43aC78BA3");
    });

    it("should export MAX_UINT256", () => {
      expect(MAX_UINT256).toBe(
        "115792089237316195423570985008687907853269984665640564039457584007913129639935",
      );
    });

    it("should export timing constants", () => {
      expect(DEFAULT_PERMIT_VALIDITY_SECONDS).toBe(3600);
      expect(MIN_DEADLINE_BUFFER_SECONDS).toBe(60);
    });
  });

  describe("Schemas", () => {
    it("should have correct structure for info schema", () => {
      expect(EIP2612_GAS_SPONSORING_SCHEMA.$schema).toBe(
        "https://json-schema.org/draft/2020-12/schema",
      );
      expect(EIP2612_GAS_SPONSORING_SCHEMA.type).toBe("object");
      expect(EIP2612_GAS_SPONSORING_SCHEMA.required).toContain("from");
      expect(EIP2612_GAS_SPONSORING_SCHEMA.required).toContain("asset");
      expect(EIP2612_GAS_SPONSORING_SCHEMA.required).toContain("spender");
      expect(EIP2612_GAS_SPONSORING_SCHEMA.required).toContain("amount");
      expect(EIP2612_GAS_SPONSORING_SCHEMA.required).toContain("nonce");
      expect(EIP2612_GAS_SPONSORING_SCHEMA.required).toContain("deadline");
      expect(EIP2612_GAS_SPONSORING_SCHEMA.required).toContain("signature");
      expect(EIP2612_GAS_SPONSORING_SCHEMA.required).toContain("version");
    });

    it("should have correct structure for declaration schema", () => {
      expect(EIP2612_GAS_SPONSORING_DECLARATION_SCHEMA.required).toContain("info");
      expect(EIP2612_GAS_SPONSORING_DECLARATION_SCHEMA.required).toContain("schema");
    });
  });

  describe("declareEIP2612GasSponsoringExtension", () => {
    it("should create a valid extension declaration with default description", () => {
      const result = declareEIP2612GasSponsoringExtension();

      expect(result).toHaveProperty(EIP2612_GAS_SPONSORING);
      const declaration = result[EIP2612_GAS_SPONSORING] as EIP2612GasSponsoringDeclaration;

      expect(declaration).toHaveProperty("info");
      expect(declaration).toHaveProperty("schema");
      expect(declaration.info.version).toBe("1");
      expect(declaration.info.description).toContain("EIP-2612");
      expect(declaration.info.description).toContain("Permit2");
    });

    it("should create a valid extension declaration with custom description", () => {
      const customDescription = "Custom gasless permit description";
      const result = declareEIP2612GasSponsoringExtension({ description: customDescription });

      const declaration = result[EIP2612_GAS_SPONSORING] as EIP2612GasSponsoringDeclaration;
      expect(declaration.info.description).toBe(customDescription);
    });

    it("should include the correct schema in declaration", () => {
      const result = declareEIP2612GasSponsoringExtension();
      const declaration = result[EIP2612_GAS_SPONSORING] as EIP2612GasSponsoringDeclaration;

      expect(declaration.schema).toEqual(EIP2612_GAS_SPONSORING_SCHEMA);
    });
  });

  describe("supportsEIP2612GasSponsoring", () => {
    it("should return true when extension is in the list", () => {
      const extensions = ["bazaar", "eip2612GasSponsoring", "other"];
      expect(supportsEIP2612GasSponsoring(extensions)).toBe(true);
    });

    it("should return false when extension is not in the list", () => {
      const extensions = ["bazaar", "other"];
      expect(supportsEIP2612GasSponsoring(extensions)).toBe(false);
    });

    it("should return false for empty list", () => {
      expect(supportsEIP2612GasSponsoring([])).toBe(false);
    });
  });

  describe("validateEIP2612GasSponsoringSchema", () => {
    it("should validate a correct info object", () => {
      const info = createValidInfo();
      const result = validateEIP2612GasSponsoringSchema(info);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it("should reject info with missing required field", () => {
      const info = createValidInfo();
      // @ts-expect-error - Testing invalid input
      delete info.from;

      const result = validateEIP2612GasSponsoringSchema(info);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it("should reject info with invalid address format", () => {
      const info = createValidInfo({ from: "invalid-address" });
      const result = validateEIP2612GasSponsoringSchema(info);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it("should reject info with invalid amount format", () => {
      const info = createValidInfo({ amount: "not-a-number" });
      const result = validateEIP2612GasSponsoringSchema(info);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it("should reject info with invalid signature format", () => {
      const info = createValidInfo({ signature: "not-hex" });
      const result = validateEIP2612GasSponsoringSchema(info);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it("should reject non-object input", () => {
      const result = validateEIP2612GasSponsoringSchema("not an object");

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it("should reject null input", () => {
      const result = validateEIP2612GasSponsoringSchema(null);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe("validateEIP2612GasSponsoringInfo", () => {
    it("should validate correct info against requirements", () => {
      const info = createValidInfo();
      const result = validateEIP2612GasSponsoringInfo(info, VALID_ASSET);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it("should reject info with wrong spender (not Permit2)", () => {
      const info = createValidInfo({ spender: VALID_ADDRESS }); // Not canonical Permit2
      const result = validateEIP2612GasSponsoringInfo(info, VALID_ASSET);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(e => e.includes("Permit2"))).toBe(true);
    });

    it("should reject info with mismatched asset", () => {
      const info = createValidInfo({ asset: VALID_ADDRESS }); // Different asset
      const result = validateEIP2612GasSponsoringInfo(info, VALID_ASSET);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(e => e.includes("asset mismatch"))).toBe(true);
    });

    it("should reject info with expired deadline", () => {
      const info = createValidInfo({ deadline: PAST_DEADLINE });
      const result = validateEIP2612GasSponsoringInfo(info, VALID_ASSET);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(e => e.includes("deadline"))).toBe(true);
    });

    it("should reject info with deadline too soon (less than buffer)", () => {
      const info = createValidInfo({ deadline: SOON_DEADLINE });
      const result = validateEIP2612GasSponsoringInfo(info, VALID_ASSET);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(e => e.includes("deadline"))).toBe(true);
    });

    it("should reject info with negative nonce", () => {
      const info = createValidInfo({ nonce: "-1" });
      const result = validateEIP2612GasSponsoringInfo(info, VALID_ASSET);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(e => e.includes("nonce"))).toBe(true);
    });

    it("should reject info with invalid nonce format", () => {
      const info = createValidInfo({ nonce: "not-a-number" });
      const result = validateEIP2612GasSponsoringInfo(info, VALID_ASSET);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it("should reject info with wrong signature length", () => {
      const info = createValidInfo({ signature: "0x" + "a".repeat(64) }); // Too short
      const result = validateEIP2612GasSponsoringInfo(info, VALID_ASSET);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(e => e.includes("65 bytes"))).toBe(true);
    });

    it("should reject info with wrong version", () => {
      // @ts-expect-error - Testing invalid version
      const info = createValidInfo({ version: "2" });
      const result = validateEIP2612GasSponsoringInfo(info, VALID_ASSET);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(e => e.includes("version"))).toBe(true);
    });

    it("should be case-insensitive for address comparison (hex characters only)", () => {
      // Note: The 0x prefix must remain lowercase per Ethereum convention
      // Only the hex characters (a-f) can be mixed case
      const info = createValidInfo({
        spender: CANONICAL_PERMIT2.toLowerCase(), // Already lowercase, valid
        asset: "0x" + VALID_ASSET.slice(2).toUpperCase(), // Uppercase hex only, keep 0x lowercase
      });
      const result = validateEIP2612GasSponsoringInfo(info, VALID_ASSET.toLowerCase());

      expect(result.valid).toBe(true);
    });
  });

  describe("validateEIP2612DomainRequirements", () => {
    it("should validate requirements with domain info", () => {
      const requirements = createValidRequirements();
      const result = validateEIP2612DomainRequirements(requirements);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it("should reject requirements missing extra.name", () => {
      const requirements = createValidRequirements({
        extra: { version: "2" },
      });
      const result = validateEIP2612DomainRequirements(requirements);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(e => e.includes("name"))).toBe(true);
    });

    it("should reject requirements missing extra.version", () => {
      const requirements = createValidRequirements({
        extra: { name: "USD Coin" },
      });
      const result = validateEIP2612DomainRequirements(requirements);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(e => e.includes("version"))).toBe(true);
    });

    it("should reject requirements with empty extra", () => {
      const requirements = createValidRequirements({ extra: {} });
      const result = validateEIP2612DomainRequirements(requirements);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it("should reject requirements with missing extra", () => {
      const requirements = createValidRequirements();
      delete requirements.extra;
      const result = validateEIP2612DomainRequirements(requirements);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe("hasEIP2612GasSponsoring", () => {
    it("should return true when extension is present", () => {
      const payload = createValidPayload(createValidInfo());
      expect(hasEIP2612GasSponsoring(payload)).toBe(true);
    });

    it("should return false when extension is not present", () => {
      const payload = createValidPayload(null);
      expect(hasEIP2612GasSponsoring(payload)).toBe(false);
    });

    it("should return false when extensions object is missing", () => {
      const payload = createValidPayload(null);
      delete payload.extensions;
      expect(hasEIP2612GasSponsoring(payload)).toBe(false);
    });

    it("should return false when extensions is empty", () => {
      const payload = createValidPayload(null, { extensions: {} });
      expect(hasEIP2612GasSponsoring(payload)).toBe(false);
    });
  });

  describe("extractEIP2612GasSponsoring", () => {
    it("should extract and validate info from valid payload", () => {
      const info = createValidInfo();
      const payload = createValidPayload(info);
      const requirements = createValidRequirements();

      const result = extractEIP2612GasSponsoring(payload, requirements);

      expect(result.found).toBe(true);
      expect(result.info).toEqual(info);
      expect(result.validation?.valid).toBe(true);
    });

    it("should return found=false when extension is not present", () => {
      const payload = createValidPayload(null);
      const requirements = createValidRequirements();

      const result = extractEIP2612GasSponsoring(payload, requirements);

      expect(result.found).toBe(false);
      expect(result.info).toBeUndefined();
      expect(result.validation).toBeUndefined();
    });

    it("should extract without validation when validate=false", () => {
      const info = createValidInfo({ spender: VALID_ADDRESS }); // Invalid spender
      const payload = createValidPayload(info);
      const requirements = createValidRequirements();

      const result = extractEIP2612GasSponsoring(payload, requirements, false);

      expect(result.found).toBe(true);
      expect(result.info).toEqual(info);
      expect(result.validation).toBeUndefined();
    });

    it("should return validation errors for invalid info", () => {
      const info = createValidInfo({ spender: VALID_ADDRESS }); // Invalid spender
      const payload = createValidPayload(info);
      const requirements = createValidRequirements();

      const result = extractEIP2612GasSponsoring(payload, requirements, true);

      expect(result.found).toBe(true);
      expect(result.info).toEqual(info);
      expect(result.validation?.valid).toBe(false);
      expect(result.validation?.errors).toBeDefined();
    });

    it("should handle payload with missing info in extension", () => {
      const payload = createValidPayload(null, {
        extensions: {
          [EIP2612_GAS_SPONSORING]: {}, // Extension present but no info
        },
      });
      const requirements = createValidRequirements();

      const result = extractEIP2612GasSponsoring(payload, requirements);

      expect(result.found).toBe(false);
    });
  });

  describe("extractValidEIP2612GasSponsoring", () => {
    it("should return info when valid", () => {
      const info = createValidInfo();
      const payload = createValidPayload(info);
      const requirements = createValidRequirements();

      const result = extractValidEIP2612GasSponsoring(payload, requirements);

      expect(result).toEqual(info);
    });

    it("should return null when extension is not present", () => {
      const payload = createValidPayload(null);
      const requirements = createValidRequirements();

      const result = extractValidEIP2612GasSponsoring(payload, requirements);

      expect(result).toBeNull();
    });

    it("should return null when validation fails", () => {
      const info = createValidInfo({ spender: VALID_ADDRESS }); // Invalid spender
      const payload = createValidPayload(info);
      const requirements = createValidRequirements();

      const result = extractValidEIP2612GasSponsoring(payload, requirements);

      expect(result).toBeNull();
    });

    it("should return null when deadline is expired", () => {
      const info = createValidInfo({ deadline: PAST_DEADLINE });
      const payload = createValidPayload(info);
      const requirements = createValidRequirements();

      const result = extractValidEIP2612GasSponsoring(payload, requirements);

      expect(result).toBeNull();
    });
  });

  describe("Integration - Full workflow", () => {
    it("should handle complete facilitator workflow", () => {
      // 1. Facilitator declares support
      const declaration = declareEIP2612GasSponsoringExtension();
      expect(declaration).toHaveProperty(EIP2612_GAS_SPONSORING);

      // 2. Check if facilitator supports extension
      const supportedExtensions = [EIP2612_GAS_SPONSORING, "bazaar"];
      expect(supportsEIP2612GasSponsoring(supportedExtensions)).toBe(true);

      // 3. Client creates payload with extension
      const info = createValidInfo();
      const payload = createValidPayload(info);
      const requirements = createValidRequirements();

      // 4. Facilitator checks if extension is used
      expect(hasEIP2612GasSponsoring(payload)).toBe(true);

      // 5. Facilitator extracts and validates
      const validInfo = extractValidEIP2612GasSponsoring(payload, requirements);
      expect(validInfo).not.toBeNull();
      expect(validInfo!.from).toBe(VALID_ADDRESS);
      expect(validInfo!.spender).toBe(CANONICAL_PERMIT2);
    });

    it("should handle workflow where client doesn't use extension", () => {
      const declaration = declareEIP2612GasSponsoringExtension();
      expect(declaration).toHaveProperty(EIP2612_GAS_SPONSORING);

      const payload = createValidPayload(null); // No extension
      const requirements = createValidRequirements();

      expect(hasEIP2612GasSponsoring(payload)).toBe(false);

      const validInfo = extractValidEIP2612GasSponsoring(payload, requirements);
      expect(validInfo).toBeNull();

      // Facilitator would use standard settle() instead of settleWithPermit()
    });

    it("should reject invalid extension data in workflow", () => {
      const info = createValidInfo({
        spender: VALID_ADDRESS, // Wrong spender!
        deadline: PAST_DEADLINE, // Expired!
      });
      const payload = createValidPayload(info);
      const requirements = createValidRequirements();

      expect(hasEIP2612GasSponsoring(payload)).toBe(true);

      const result = extractEIP2612GasSponsoring(payload, requirements);
      expect(result.found).toBe(true);
      expect(result.validation?.valid).toBe(false);
      expect(result.validation?.errors!.length).toBeGreaterThan(1); // Multiple errors

      const validInfo = extractValidEIP2612GasSponsoring(payload, requirements);
      expect(validInfo).toBeNull();
    });
  });
});

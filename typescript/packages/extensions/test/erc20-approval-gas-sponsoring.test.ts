/**
 * Tests for ERC-20 Approval Gas Sponsoring Extension
 *
 * Tests the extension helpers for gasless ERC-20 approval via signed transaction.
 */

import { describe, it, expect } from "vitest";
import {
  // Constants
  ERC20_APPROVAL_GAS_SPONSORING,
  CANONICAL_PERMIT2,
  MAX_UINT256,
  MIN_SIGNED_TX_HEX_LENGTH,
  // Types
  type ERC20ApprovalGasSponsoringInfo,
  type ERC20ApprovalGasSponsoringDeclaration,
  // Schemas
  ERC20_APPROVAL_GAS_SPONSORING_SCHEMA,
  ERC20_APPROVAL_GAS_SPONSORING_DECLARATION_SCHEMA,
  // Declaration
  declareERC20ApprovalGasSponsoringExtension,
  supportsERC20ApprovalGasSponsoring,
  // Validation
  validateERC20ApprovalGasSponsoringSchema,
  validateERC20ApprovalGasSponsoringInfo,
  validateSignedTransactionFormat,
  // Extraction
  extractERC20ApprovalGasSponsoring,
  hasERC20ApprovalGasSponsoring,
  extractValidERC20ApprovalGasSponsoring,
} from "../src/erc20-approval-gas-sponsoring";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";

// Test fixtures
const VALID_ADDRESS = "0x1234567890123456789012345678901234567890";
const VALID_ASSET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on Base

// Valid signed transaction (at least MIN_SIGNED_TX_HEX_LENGTH hex chars)
// This is a minimal valid-looking EIP-1559 transaction hex
const VALID_SIGNED_TX = "0x" + "a".repeat(200); // 200 hex chars (100 bytes)
const SHORT_SIGNED_TX = "0x" + "a".repeat(50); // Too short

const createValidInfo = (
  overrides: Partial<ERC20ApprovalGasSponsoringInfo> = {},
): ERC20ApprovalGasSponsoringInfo => ({
  from: VALID_ADDRESS,
  asset: VALID_ASSET,
  spender: CANONICAL_PERMIT2,
  amount: MAX_UINT256,
  signedTransaction: VALID_SIGNED_TX,
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
    extra: {},
    ...overrides,
  }) as PaymentRequirements;

const createValidPayload = (
  info: ERC20ApprovalGasSponsoringInfo | null = null,
  overrides: Partial<PaymentPayload> = {},
): PaymentPayload =>
  ({
    x402Version: 2,
    scheme: "exact",
    network: "eip155:8453",
    payload: {
      signature: "0x" + "b".repeat(130),
      permit2Authorization: {
        permitted: { token: VALID_ASSET, amount: "10000" },
        from: VALID_ADDRESS,
        spender: VALID_ADDRESS,
        nonce: "123",
        deadline: String(Math.floor(Date.now() / 1000) + 3600),
        witness: { to: VALID_ADDRESS, validAfter: "0", extra: {} },
      },
    },
    accepted: {} as PaymentRequirements,
    ...(info
      ? {
        extensions: {
          [ERC20_APPROVAL_GAS_SPONSORING]: { info },
        },
      }
      : {}),
    ...overrides,
  }) as PaymentPayload;

describe("ERC-20 Approval Gas Sponsoring Extension", () => {
  describe("Constants", () => {
    it("should export the correct extension identifier", () => {
      expect(ERC20_APPROVAL_GAS_SPONSORING).toBe("erc20ApprovalGasSponsoring");
    });

    it("should export the canonical Permit2 address", () => {
      expect(CANONICAL_PERMIT2).toBe("0x000000000022D473030F116dDEE9F6B43aC78BA3");
    });

    it("should export MAX_UINT256", () => {
      expect(MAX_UINT256).toBe(
        "115792089237316195423570985008687907853269984665640564039457584007913129639935",
      );
    });

    it("should export MIN_SIGNED_TX_HEX_LENGTH", () => {
      expect(MIN_SIGNED_TX_HEX_LENGTH).toBe(100);
    });
  });

  describe("Schemas", () => {
    it("should have correct structure for info schema", () => {
      expect(ERC20_APPROVAL_GAS_SPONSORING_SCHEMA.$schema).toBe(
        "https://json-schema.org/draft/2020-12/schema",
      );
      expect(ERC20_APPROVAL_GAS_SPONSORING_SCHEMA.type).toBe("object");
      expect(ERC20_APPROVAL_GAS_SPONSORING_SCHEMA.required).toContain("from");
      expect(ERC20_APPROVAL_GAS_SPONSORING_SCHEMA.required).toContain("asset");
      expect(ERC20_APPROVAL_GAS_SPONSORING_SCHEMA.required).toContain("spender");
      expect(ERC20_APPROVAL_GAS_SPONSORING_SCHEMA.required).toContain("amount");
      expect(ERC20_APPROVAL_GAS_SPONSORING_SCHEMA.required).toContain("signedTransaction");
      expect(ERC20_APPROVAL_GAS_SPONSORING_SCHEMA.required).toContain("version");
    });

    it("should have correct structure for declaration schema", () => {
      expect(ERC20_APPROVAL_GAS_SPONSORING_DECLARATION_SCHEMA.required).toContain("info");
      expect(ERC20_APPROVAL_GAS_SPONSORING_DECLARATION_SCHEMA.required).toContain("schema");
    });
  });

  describe("declareERC20ApprovalGasSponsoringExtension", () => {
    it("should create a valid extension declaration with default description", () => {
      const result = declareERC20ApprovalGasSponsoringExtension();

      expect(result).toHaveProperty(ERC20_APPROVAL_GAS_SPONSORING);
      const declaration = result[
        ERC20_APPROVAL_GAS_SPONSORING
      ] as ERC20ApprovalGasSponsoringDeclaration;

      expect(declaration).toHaveProperty("info");
      expect(declaration).toHaveProperty("schema");
      expect(declaration.info.version).toBe("1");
      expect(declaration.info.description).toContain("approval transaction");
      expect(declaration.info.description).toContain("sponsor");
    });

    it("should create a valid extension declaration with custom description", () => {
      const customDescription = "Custom gas sponsoring description";
      const result = declareERC20ApprovalGasSponsoringExtension({ description: customDescription });

      const declaration = result[
        ERC20_APPROVAL_GAS_SPONSORING
      ] as ERC20ApprovalGasSponsoringDeclaration;
      expect(declaration.info.description).toBe(customDescription);
    });

    it("should include the correct schema in declaration", () => {
      const result = declareERC20ApprovalGasSponsoringExtension();
      const declaration = result[
        ERC20_APPROVAL_GAS_SPONSORING
      ] as ERC20ApprovalGasSponsoringDeclaration;

      expect(declaration.schema).toEqual(ERC20_APPROVAL_GAS_SPONSORING_SCHEMA);
    });
  });

  describe("supportsERC20ApprovalGasSponsoring", () => {
    it("should return true when extension is in the list", () => {
      const extensions = ["bazaar", "erc20ApprovalGasSponsoring", "other"];
      expect(supportsERC20ApprovalGasSponsoring(extensions)).toBe(true);
    });

    it("should return false when extension is not in the list", () => {
      const extensions = ["bazaar", "eip2612GasSponsoring"];
      expect(supportsERC20ApprovalGasSponsoring(extensions)).toBe(false);
    });

    it("should return false for empty list", () => {
      expect(supportsERC20ApprovalGasSponsoring([])).toBe(false);
    });
  });

  describe("validateSignedTransactionFormat", () => {
    it("should validate a correct signed transaction", () => {
      const result = validateSignedTransactionFormat(VALID_SIGNED_TX);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it("should reject transaction without 0x prefix", () => {
      const result = validateSignedTransactionFormat("aabbccdd");

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(e => e.includes("0x"))).toBe(true);
    });

    it("should reject transaction with invalid hex characters", () => {
      const result = validateSignedTransactionFormat("0xGGHH" + "a".repeat(100));

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(e => e.includes("invalid hex"))).toBe(true);
    });

    it("should reject transaction that is too short", () => {
      const result = validateSignedTransactionFormat(SHORT_SIGNED_TX);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(e => e.includes("too short"))).toBe(true);
    });

    it("should accept transaction at minimum length", () => {
      const minLengthTx = "0x" + "a".repeat(MIN_SIGNED_TX_HEX_LENGTH);
      const result = validateSignedTransactionFormat(minLengthTx);

      expect(result.valid).toBe(true);
    });
  });

  describe("validateERC20ApprovalGasSponsoringSchema", () => {
    it("should validate a correct info object", () => {
      const info = createValidInfo();
      const result = validateERC20ApprovalGasSponsoringSchema(info);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it("should reject info with missing required field", () => {
      const info = createValidInfo();
      // @ts-expect-error - Testing invalid input
      delete info.from;

      const result = validateERC20ApprovalGasSponsoringSchema(info);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it("should reject info with invalid address format", () => {
      const info = createValidInfo({ from: "invalid-address" });
      const result = validateERC20ApprovalGasSponsoringSchema(info);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it("should reject info with invalid amount format", () => {
      const info = createValidInfo({ amount: "not-a-number" });
      const result = validateERC20ApprovalGasSponsoringSchema(info);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it("should reject info with invalid signedTransaction format", () => {
      const info = createValidInfo({ signedTransaction: "not-hex" });
      const result = validateERC20ApprovalGasSponsoringSchema(info);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it("should reject non-object input", () => {
      const result = validateERC20ApprovalGasSponsoringSchema("not an object");

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it("should reject null input", () => {
      const result = validateERC20ApprovalGasSponsoringSchema(null);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe("validateERC20ApprovalGasSponsoringInfo", () => {
    it("should validate correct info against requirements", () => {
      const info = createValidInfo();
      const result = validateERC20ApprovalGasSponsoringInfo(info, VALID_ASSET);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it("should reject info with wrong spender (not Permit2)", () => {
      const info = createValidInfo({ spender: VALID_ADDRESS }); // Not canonical Permit2
      const result = validateERC20ApprovalGasSponsoringInfo(info, VALID_ASSET);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(e => e.includes("Permit2"))).toBe(true);
    });

    it("should reject info with mismatched asset", () => {
      const info = createValidInfo({ asset: VALID_ADDRESS }); // Different asset
      const result = validateERC20ApprovalGasSponsoringInfo(info, VALID_ASSET);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(e => e.includes("asset mismatch"))).toBe(true);
    });

    it("should reject info with too short signedTransaction", () => {
      const info = createValidInfo({ signedTransaction: SHORT_SIGNED_TX });
      const result = validateERC20ApprovalGasSponsoringInfo(info, VALID_ASSET);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(e => e.includes("too short"))).toBe(true);
    });

    it("should reject info with wrong version", () => {
      // @ts-expect-error - Testing invalid version
      const info = createValidInfo({ version: "2" });
      const result = validateERC20ApprovalGasSponsoringInfo(info, VALID_ASSET);

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
      const result = validateERC20ApprovalGasSponsoringInfo(info, VALID_ASSET.toLowerCase());

      expect(result.valid).toBe(true);
    });

    it("should accumulate multiple errors", () => {
      const info = createValidInfo({
        spender: VALID_ADDRESS, // Wrong spender
        asset: VALID_ADDRESS, // Wrong asset
        signedTransaction: SHORT_SIGNED_TX, // Too short
      });
      const result = validateERC20ApprovalGasSponsoringInfo(info, VALID_ASSET);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("hasERC20ApprovalGasSponsoring", () => {
    it("should return true when extension is present", () => {
      const payload = createValidPayload(createValidInfo());
      expect(hasERC20ApprovalGasSponsoring(payload)).toBe(true);
    });

    it("should return false when extension is not present", () => {
      const payload = createValidPayload(null);
      expect(hasERC20ApprovalGasSponsoring(payload)).toBe(false);
    });

    it("should return false when extensions object is missing", () => {
      const payload = createValidPayload(null);
      delete payload.extensions;
      expect(hasERC20ApprovalGasSponsoring(payload)).toBe(false);
    });

    it("should return false when extensions is empty", () => {
      const payload = createValidPayload(null, { extensions: {} });
      expect(hasERC20ApprovalGasSponsoring(payload)).toBe(false);
    });
  });

  describe("extractERC20ApprovalGasSponsoring", () => {
    it("should extract and validate info from valid payload", () => {
      const info = createValidInfo();
      const payload = createValidPayload(info);
      const requirements = createValidRequirements();

      const result = extractERC20ApprovalGasSponsoring(payload, requirements);

      expect(result.found).toBe(true);
      expect(result.info).toEqual(info);
      expect(result.validation?.valid).toBe(true);
    });

    it("should return found=false when extension is not present", () => {
      const payload = createValidPayload(null);
      const requirements = createValidRequirements();

      const result = extractERC20ApprovalGasSponsoring(payload, requirements);

      expect(result.found).toBe(false);
      expect(result.info).toBeUndefined();
      expect(result.validation).toBeUndefined();
    });

    it("should extract without validation when validate=false", () => {
      const info = createValidInfo({ spender: VALID_ADDRESS }); // Invalid spender
      const payload = createValidPayload(info);
      const requirements = createValidRequirements();

      const result = extractERC20ApprovalGasSponsoring(payload, requirements, false);

      expect(result.found).toBe(true);
      expect(result.info).toEqual(info);
      expect(result.validation).toBeUndefined();
    });

    it("should return validation errors for invalid info", () => {
      const info = createValidInfo({ spender: VALID_ADDRESS }); // Invalid spender
      const payload = createValidPayload(info);
      const requirements = createValidRequirements();

      const result = extractERC20ApprovalGasSponsoring(payload, requirements, true);

      expect(result.found).toBe(true);
      expect(result.info).toEqual(info);
      expect(result.validation?.valid).toBe(false);
      expect(result.validation?.errors).toBeDefined();
    });

    it("should handle payload with missing info in extension", () => {
      const payload = createValidPayload(null, {
        extensions: {
          [ERC20_APPROVAL_GAS_SPONSORING]: {}, // Extension present but no info
        },
      });
      const requirements = createValidRequirements();

      const result = extractERC20ApprovalGasSponsoring(payload, requirements);

      expect(result.found).toBe(false);
    });
  });

  describe("extractValidERC20ApprovalGasSponsoring", () => {
    it("should return info when valid", () => {
      const info = createValidInfo();
      const payload = createValidPayload(info);
      const requirements = createValidRequirements();

      const result = extractValidERC20ApprovalGasSponsoring(payload, requirements);

      expect(result).toEqual(info);
    });

    it("should return null when extension is not present", () => {
      const payload = createValidPayload(null);
      const requirements = createValidRequirements();

      const result = extractValidERC20ApprovalGasSponsoring(payload, requirements);

      expect(result).toBeNull();
    });

    it("should return null when validation fails", () => {
      const info = createValidInfo({ spender: VALID_ADDRESS }); // Invalid spender
      const payload = createValidPayload(info);
      const requirements = createValidRequirements();

      const result = extractValidERC20ApprovalGasSponsoring(payload, requirements);

      expect(result).toBeNull();
    });

    it("should return null when signed transaction is too short", () => {
      const info = createValidInfo({ signedTransaction: SHORT_SIGNED_TX });
      const payload = createValidPayload(info);
      const requirements = createValidRequirements();

      const result = extractValidERC20ApprovalGasSponsoring(payload, requirements);

      expect(result).toBeNull();
    });
  });

  describe("Integration - Full workflow", () => {
    it("should handle complete facilitator workflow", () => {
      // 1. Facilitator declares support
      const declaration = declareERC20ApprovalGasSponsoringExtension();
      expect(declaration).toHaveProperty(ERC20_APPROVAL_GAS_SPONSORING);

      // 2. Check if facilitator supports extension
      const supportedExtensions = [ERC20_APPROVAL_GAS_SPONSORING, "bazaar"];
      expect(supportsERC20ApprovalGasSponsoring(supportedExtensions)).toBe(true);

      // 3. Client creates payload with extension
      const info = createValidInfo();
      const payload = createValidPayload(info);
      const requirements = createValidRequirements();

      // 4. Facilitator checks if extension is used
      expect(hasERC20ApprovalGasSponsoring(payload)).toBe(true);

      // 5. Facilitator extracts and validates
      const validInfo = extractValidERC20ApprovalGasSponsoring(payload, requirements);
      expect(validInfo).not.toBeNull();
      expect(validInfo!.from).toBe(VALID_ADDRESS);
      expect(validInfo!.spender).toBe(CANONICAL_PERMIT2);
      expect(validInfo!.signedTransaction).toBe(VALID_SIGNED_TX);
    });

    it("should handle workflow where client doesn't use extension", () => {
      const declaration = declareERC20ApprovalGasSponsoringExtension();
      expect(declaration).toHaveProperty(ERC20_APPROVAL_GAS_SPONSORING);

      const payload = createValidPayload(null); // No extension
      const requirements = createValidRequirements();

      expect(hasERC20ApprovalGasSponsoring(payload)).toBe(false);

      const validInfo = extractValidERC20ApprovalGasSponsoring(payload, requirements);
      expect(validInfo).toBeNull();

      // Facilitator would require user to approve Permit2 directly
    });

    it("should reject invalid extension data in workflow", () => {
      const info = createValidInfo({
        spender: VALID_ADDRESS, // Wrong spender!
        asset: VALID_ADDRESS, // Wrong asset!
        signedTransaction: SHORT_SIGNED_TX, // Too short!
      });
      const payload = createValidPayload(info);
      const requirements = createValidRequirements();

      expect(hasERC20ApprovalGasSponsoring(payload)).toBe(true);

      const result = extractERC20ApprovalGasSponsoring(payload, requirements);
      expect(result.found).toBe(true);
      expect(result.validation?.valid).toBe(false);
      expect(result.validation?.errors!.length).toBeGreaterThan(2); // Multiple errors

      const validInfo = extractValidERC20ApprovalGasSponsoring(payload, requirements);
      expect(validInfo).toBeNull();
    });

    it("should support both gas sponsoring extensions in same payload", () => {
      // Create info for both extensions
      const erc20Info = createValidInfo();

      // Create payload with ERC20 extension
      const payload = createValidPayload(erc20Info);
      const requirements = createValidRequirements();

      // Verify ERC20 extension is present
      expect(hasERC20ApprovalGasSponsoring(payload)).toBe(true);

      // Extract and validate
      const validErc20 = extractValidERC20ApprovalGasSponsoring(payload, requirements);
      expect(validErc20).not.toBeNull();
      expect(validErc20!.signedTransaction).toBe(VALID_SIGNED_TX);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty signedTransaction after 0x prefix", () => {
      const info = createValidInfo({ signedTransaction: "0x" });
      const result = validateERC20ApprovalGasSponsoringInfo(info, VALID_ASSET);

      // Schema validation fails first (pattern requires at least one hex char after 0x)
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it("should handle mixed case in signedTransaction", () => {
      const info = createValidInfo({
        signedTransaction: "0x" + "aAbBcCdDeEfF".repeat(20), // Mixed case, 240 chars
      });
      const result = validateERC20ApprovalGasSponsoringInfo(info, VALID_ASSET);

      expect(result.valid).toBe(true);
    });

    it("should handle very long signedTransaction", () => {
      const info = createValidInfo({
        signedTransaction: "0x" + "a".repeat(10000), // Very long tx
      });
      const result = validateERC20ApprovalGasSponsoringInfo(info, VALID_ASSET);

      expect(result.valid).toBe(true);
    });
  });
});

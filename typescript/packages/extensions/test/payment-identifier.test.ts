import { describe, it, expect } from "vitest";
import type { PaymentPayload } from "@x402/core";
import {
  PAYMENT_IDENTIFIER,
  PAYMENT_ID_MIN_LENGTH,
  PAYMENT_ID_MAX_LENGTH,
  generatePaymentId,
  isValidPaymentId,
  createPaymentIdentifierPayload,
  declarePaymentIdentifierExtension,
  validatePaymentIdentifier,
  extractPaymentIdentifier,
  extractAndValidatePaymentIdentifier,
  hasPaymentIdentifier,
  paymentIdentifierSchema,
} from "../src/payment-identifier";

describe("Payment-Identifier Extension", () => {
  describe("Constants", () => {
    it("should export the correct extension key", () => {
      expect(PAYMENT_IDENTIFIER).toBe("payment-identifier");
    });

    it("should export correct length constraints", () => {
      expect(PAYMENT_ID_MIN_LENGTH).toBe(16);
      expect(PAYMENT_ID_MAX_LENGTH).toBe(128);
    });
  });

  describe("generatePaymentId", () => {
    it("should generate an ID with default prefix", () => {
      const id = generatePaymentId();
      expect(id).toMatch(/^pay_[a-f0-9]{32}$/);
    });

    it("should generate an ID with custom prefix", () => {
      const id = generatePaymentId("txn_");
      expect(id).toMatch(/^txn_[a-f0-9]{32}$/);
    });

    it("should generate an ID without prefix when empty string provided", () => {
      const id = generatePaymentId("");
      expect(id).toMatch(/^[a-f0-9]{32}$/);
    });

    it("should generate unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generatePaymentId());
      }
      expect(ids.size).toBe(100);
    });

    it("should generate IDs that pass validation", () => {
      const id = generatePaymentId();
      expect(isValidPaymentId(id)).toBe(true);
    });
  });

  describe("isValidPaymentId", () => {
    it("should accept valid IDs", () => {
      expect(isValidPaymentId("pay_7d5d747be160e280")).toBe(true);
      expect(isValidPaymentId("1234567890123456")).toBe(true);
      expect(isValidPaymentId("abcdefghijklmnop")).toBe(true);
      expect(isValidPaymentId("test_with-hyphens")).toBe(true);
      expect(isValidPaymentId("test_with_underscores")).toBe(true);
    });

    it("should reject IDs that are too short", () => {
      expect(isValidPaymentId("abc")).toBe(false);
      expect(isValidPaymentId("123456789012345")).toBe(false); // 15 chars
    });

    it("should reject IDs that are too long", () => {
      const longId = "a".repeat(129);
      expect(isValidPaymentId(longId)).toBe(false);
    });

    it("should accept IDs at boundary lengths", () => {
      const minId = "a".repeat(16);
      const maxId = "a".repeat(128);
      expect(isValidPaymentId(minId)).toBe(true);
      expect(isValidPaymentId(maxId)).toBe(true);
    });

    it("should reject IDs with invalid characters", () => {
      expect(isValidPaymentId("pay_abc!@#$%^&*()")).toBe(false);
      expect(isValidPaymentId("pay_abc def ghij")).toBe(false);
      expect(isValidPaymentId("pay_abc.def.ghij")).toBe(false);
    });

    it("should reject non-string values", () => {
      expect(isValidPaymentId(null as unknown as string)).toBe(false);
      expect(isValidPaymentId(undefined as unknown as string)).toBe(false);
      expect(isValidPaymentId(123 as unknown as string)).toBe(false);
    });
  });

  describe("createPaymentIdentifierPayload", () => {
    it("should create a payload with auto-generated ID", () => {
      const payload = createPaymentIdentifierPayload();
      expect(payload.info.id).toMatch(/^pay_[a-f0-9]{32}$/);
      expect(payload.schema).toBeDefined();
      expect(payload.schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    });

    it("should create a payload with custom ID", () => {
      const customId = "custom_id_1234567890";
      const payload = createPaymentIdentifierPayload(customId);
      expect(payload.info.id).toBe(customId);
    });

    it("should throw error for invalid custom ID", () => {
      expect(() => createPaymentIdentifierPayload("short")).toThrow();
      expect(() => createPaymentIdentifierPayload("invalid!@#$%^&")).toThrow();
    });
  });

  describe("declarePaymentIdentifierExtension", () => {
    it("should return a declaration with empty info", () => {
      const declaration = declarePaymentIdentifierExtension();
      expect(declaration.info).toEqual({});
    });

    it("should include the schema", () => {
      const declaration = declarePaymentIdentifierExtension();
      expect(declaration.schema).toBeDefined();
      expect(declaration.schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(declaration.schema.properties.id.minLength).toBe(16);
      expect(declaration.schema.properties.id.maxLength).toBe(128);
    });
  });

  describe("validatePaymentIdentifier", () => {
    it("should validate a correct extension", () => {
      const extension = createPaymentIdentifierPayload();
      const result = validatePaymentIdentifier(extension);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it("should reject non-object extension", () => {
      expect(validatePaymentIdentifier(null).valid).toBe(false);
      expect(validatePaymentIdentifier(undefined).valid).toBe(false);
      expect(validatePaymentIdentifier("string").valid).toBe(false);
    });

    it("should reject extension without info", () => {
      const result = validatePaymentIdentifier({ schema: paymentIdentifierSchema });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Extension must have an 'info' property");
    });

    it("should reject extension without id in info", () => {
      const result = validatePaymentIdentifier({ info: {}, schema: paymentIdentifierSchema });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Extension info must have an 'id' string property");
    });

    it("should reject extension with invalid id format", () => {
      const result = validatePaymentIdentifier({
        info: { id: "short" },
        schema: paymentIdentifierSchema,
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("extractPaymentIdentifier", () => {
    const createMockPayload = (extensions?: Record<string, unknown>): PaymentPayload => ({
      x402Version: 2,
      resource: { url: "https://example.com/resource", method: "GET" },
      accepted: {
        scheme: "exact",
        network: "base-sepolia",
        asset: "0x...",
        amount: "1000000",
        payTo: "0x...",
        maxTimeoutSeconds: 300,
        extra: {},
      },
      payload: {},
      extensions,
    });

    it("should extract ID from valid payload", () => {
      const extension = createPaymentIdentifierPayload("pay_test_id_12345678");
      const payload = createMockPayload({ [PAYMENT_IDENTIFIER]: extension });
      const id = extractPaymentIdentifier(payload);
      expect(id).toBe("pay_test_id_12345678");
    });

    it("should return null when no extensions", () => {
      const payload = createMockPayload();
      const id = extractPaymentIdentifier(payload);
      expect(id).toBeNull();
    });

    it("should return null when payment-identifier extension is missing", () => {
      const payload = createMockPayload({ other: {} });
      const id = extractPaymentIdentifier(payload);
      expect(id).toBeNull();
    });

    it("should return null for invalid ID when validate=true", () => {
      const payload = createMockPayload({
        [PAYMENT_IDENTIFIER]: { info: { id: "short" } },
      });
      const id = extractPaymentIdentifier(payload, true);
      expect(id).toBeNull();
    });

    it("should return ID for invalid format when validate=false", () => {
      const payload = createMockPayload({
        [PAYMENT_IDENTIFIER]: { info: { id: "short" } },
      });
      const id = extractPaymentIdentifier(payload, false);
      expect(id).toBe("short");
    });
  });

  describe("extractAndValidatePaymentIdentifier", () => {
    const createMockPayload = (extensions?: Record<string, unknown>): PaymentPayload => ({
      x402Version: 2,
      resource: { url: "https://example.com/resource", method: "GET" },
      accepted: {
        scheme: "exact",
        network: "base-sepolia",
        asset: "0x...",
        amount: "1000000",
        payTo: "0x...",
        maxTimeoutSeconds: 300,
        extra: {},
      },
      payload: {},
      extensions,
    });

    it("should extract and validate a valid extension", () => {
      const extension = createPaymentIdentifierPayload("pay_test_id_12345678");
      const payload = createMockPayload({ [PAYMENT_IDENTIFIER]: extension });
      const { id, validation } = extractAndValidatePaymentIdentifier(payload);
      expect(id).toBe("pay_test_id_12345678");
      expect(validation.valid).toBe(true);
    });

    it("should return null id and valid=true when no extensions", () => {
      const payload = createMockPayload();
      const { id, validation } = extractAndValidatePaymentIdentifier(payload);
      expect(id).toBeNull();
      expect(validation.valid).toBe(true);
    });

    it("should return validation errors for invalid extension", () => {
      const payload = createMockPayload({
        [PAYMENT_IDENTIFIER]: { info: { id: "short" } },
      });
      const { id, validation } = extractAndValidatePaymentIdentifier(payload);
      expect(id).toBeNull();
      expect(validation.valid).toBe(false);
      expect(validation.errors).toBeDefined();
    });
  });

  describe("hasPaymentIdentifier", () => {
    const createMockPayload = (extensions?: Record<string, unknown>): PaymentPayload => ({
      x402Version: 2,
      resource: { url: "https://example.com/resource", method: "GET" },
      accepted: {
        scheme: "exact",
        network: "base-sepolia",
        asset: "0x...",
        amount: "1000000",
        payTo: "0x...",
        maxTimeoutSeconds: 300,
        extra: {},
      },
      payload: {},
      extensions,
    });

    it("should return true when extension is present", () => {
      const extension = createPaymentIdentifierPayload();
      const payload = createMockPayload({ [PAYMENT_IDENTIFIER]: extension });
      expect(hasPaymentIdentifier(payload)).toBe(true);
    });

    it("should return false when no extensions", () => {
      const payload = createMockPayload();
      expect(hasPaymentIdentifier(payload)).toBe(false);
    });

    it("should return false when different extension present", () => {
      const payload = createMockPayload({ bazaar: {} });
      expect(hasPaymentIdentifier(payload)).toBe(false);
    });
  });

  describe("paymentIdentifierSchema", () => {
    it("should have correct JSON Schema draft", () => {
      expect(paymentIdentifierSchema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    });

    it("should require id property", () => {
      expect(paymentIdentifierSchema.required).toContain("id");
    });

    it("should have correct id constraints", () => {
      expect(paymentIdentifierSchema.properties.id.type).toBe("string");
      expect(paymentIdentifierSchema.properties.id.minLength).toBe(16);
      expect(paymentIdentifierSchema.properties.id.maxLength).toBe(128);
      expect(paymentIdentifierSchema.properties.id.pattern).toBe("^[a-zA-Z0-9_-]+$");
    });
  });
});

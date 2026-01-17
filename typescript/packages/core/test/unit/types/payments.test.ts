import { describe, it, expect } from "vitest";
import {
  validatePaymentRequired,
  validatePaymentRequirements,
  validateResourceInfo,
  PaymentRequired,
  PaymentRequirements,
  ResourceInfo,
} from "../../../src/types/payments";
import { Network } from "../../../src/types";

describe("Payment Validation", () => {
  describe("validateResourceInfo", () => {
    it("should pass validation for valid resource info", () => {
      const resource: ResourceInfo = {
        url: "https://example.com/api",
        description: "Test API endpoint",
        mimeType: "application/json",
      };

      expect(() => validateResourceInfo(resource)).not.toThrow();
    });

    it("should throw error if url is missing", () => {
      const resource: ResourceInfo = {
        url: "",
        description: "Test",
        mimeType: "application/json",
      };

      expect(() => validateResourceInfo(resource)).toThrow(
        "ResourceInfo validation failed: url is required and must be a non-empty string",
      );
    });

    it("should throw error if url is whitespace only", () => {
      const resource: ResourceInfo = {
        url: "   ",
        description: "Test",
        mimeType: "application/json",
      };

      expect(() => validateResourceInfo(resource)).toThrow(
        "ResourceInfo validation failed: url is required and must be a non-empty string",
      );
    });

    it("should throw error if description is not a string", () => {
      const resource = {
        url: "https://example.com",
        description: 123,
        mimeType: "application/json",
      } as unknown as ResourceInfo;

      expect(() => validateResourceInfo(resource)).toThrow(
        "ResourceInfo validation failed: description is required and must be a string",
      );
    });

    it("should throw error if mimeType is not a string", () => {
      const resource = {
        url: "https://example.com",
        description: "Test",
        mimeType: null,
      } as unknown as ResourceInfo;

      expect(() => validateResourceInfo(resource)).toThrow(
        "ResourceInfo validation failed: mimeType is required and must be a string",
      );
    });
  });

  describe("validatePaymentRequirements", () => {
    const validRequirements: PaymentRequirements = {
      scheme: "exact",
      network: "eip155:8453" as Network,
      asset: "0x1234567890abcdef",
      amount: "1000000",
      payTo: "0xabcdef1234567890",
      maxTimeoutSeconds: 60,
      extra: {},
    };

    it("should pass validation for valid payment requirements", () => {
      expect(() => validatePaymentRequirements(validRequirements)).not.toThrow();
    });

    it("should throw error if scheme is missing", () => {
      const invalid = { ...validRequirements, scheme: "" };
      expect(() => validatePaymentRequirements(invalid)).toThrow(
        "PaymentRequirements validation failed: scheme is required and must be a non-empty string",
      );
    });

    it("should throw error if network is missing", () => {
      const invalid = { ...validRequirements, network: "" as Network };
      expect(() => validatePaymentRequirements(invalid)).toThrow(
        "PaymentRequirements validation failed: network is required and must be a non-empty string",
      );
    });

    it("should throw error if asset is missing", () => {
      const invalid = { ...validRequirements, asset: "" };
      expect(() => validatePaymentRequirements(invalid)).toThrow(
        "PaymentRequirements validation failed: asset is required and must be a non-empty string",
      );
    });

    it("should throw error if amount is missing", () => {
      const invalid = { ...validRequirements, amount: "" };
      expect(() => validatePaymentRequirements(invalid)).toThrow(
        "PaymentRequirements validation failed: amount is required and must be a non-empty string",
      );
    });

    it("should throw error if payTo is missing", () => {
      const invalid = { ...validRequirements, payTo: "" };
      expect(() => validatePaymentRequirements(invalid)).toThrow(
        "PaymentRequirements validation failed: payTo is required and must be a non-empty string",
      );
    });

    it("should throw error if maxTimeoutSeconds is zero", () => {
      const invalid = { ...validRequirements, maxTimeoutSeconds: 0 };
      expect(() => validatePaymentRequirements(invalid)).toThrow(
        "PaymentRequirements validation failed: maxTimeoutSeconds is required and must be a positive integer",
      );
    });

    it("should throw error if maxTimeoutSeconds is negative", () => {
      const invalid = { ...validRequirements, maxTimeoutSeconds: -1 };
      expect(() => validatePaymentRequirements(invalid)).toThrow(
        "PaymentRequirements validation failed: maxTimeoutSeconds is required and must be a positive integer",
      );
    });

    it("should throw error if maxTimeoutSeconds is not an integer", () => {
      const invalid = { ...validRequirements, maxTimeoutSeconds: 60.5 };
      expect(() => validatePaymentRequirements(invalid)).toThrow(
        "PaymentRequirements validation failed: maxTimeoutSeconds is required and must be a positive integer",
      );
    });

    it("should throw error if extra is not an object", () => {
      const invalid = { ...validRequirements, extra: null as unknown as Record<string, unknown> };
      expect(() => validatePaymentRequirements(invalid)).toThrow(
        "PaymentRequirements validation failed: extra is required and must be an object",
      );
    });

    it("should throw error if extra is an array", () => {
      const invalid = { ...validRequirements, extra: [] as unknown as Record<string, unknown> };
      expect(() => validatePaymentRequirements(invalid)).toThrow(
        "PaymentRequirements validation failed: extra is required and must be an object",
      );
    });
  });

  describe("validatePaymentRequired", () => {
    const validResource: ResourceInfo = {
      url: "https://example.com/api",
      description: "Test API",
      mimeType: "application/json",
    };

    const validRequirements: PaymentRequirements = {
      scheme: "exact",
      network: "eip155:8453" as Network,
      asset: "0x1234567890abcdef",
      amount: "1000000",
      payTo: "0xabcdef1234567890",
      maxTimeoutSeconds: 60,
      extra: {},
    };

    const validPaymentRequired: PaymentRequired = {
      x402Version: 2,
      error: "Payment required",
      resource: validResource,
      accepts: [validRequirements],
      extensions: {},
    };

    it("should pass validation for valid payment required", () => {
      expect(() => validatePaymentRequired(validPaymentRequired)).not.toThrow();
    });

    it("should pass validation without error field", () => {
      const withoutError = { ...validPaymentRequired };
      delete withoutError.error;
      expect(() => validatePaymentRequired(withoutError)).not.toThrow();
    });

    it("should pass validation without extensions field", () => {
      const withoutExtensions = { ...validPaymentRequired };
      delete withoutExtensions.extensions;
      expect(() => validatePaymentRequired(withoutExtensions)).not.toThrow();
    });

    it("should throw error if x402Version is invalid", () => {
      const invalid = { ...validPaymentRequired, x402Version: 0 };
      expect(() => validatePaymentRequired(invalid)).toThrow(
        "PaymentRequired validation failed: x402Version is required and must be 1 or 2, got 0",
      );
    });

    it("should throw error if x402Version is 3", () => {
      const invalid = { ...validPaymentRequired, x402Version: 3 };
      expect(() => validatePaymentRequired(invalid)).toThrow(
        "PaymentRequired validation failed: x402Version is required and must be 1 or 2, got 3",
      );
    });

    it("should throw error if resource is missing", () => {
      const invalid = { ...validPaymentRequired, resource: undefined as unknown as ResourceInfo };
      expect(() => validatePaymentRequired(invalid)).toThrow(
        "PaymentRequired validation failed: resource is required",
      );
    });

    it("should throw error if accepts is empty array", () => {
      const invalid = { ...validPaymentRequired, accepts: [] };
      expect(() => validatePaymentRequired(invalid)).toThrow(
        "PaymentRequired validation failed: accepts is required and must be a non-empty array",
      );
    });

    it("should throw error if accepts is not an array", () => {
      const invalid = { ...validPaymentRequired, accepts: null as unknown as PaymentRequirements[] };
      expect(() => validatePaymentRequired(invalid)).toThrow(
        "PaymentRequired validation failed: accepts is required and must be a non-empty array",
      );
    });

    it("should throw error if error is not a string when provided", () => {
      const invalid = { ...validPaymentRequired, error: 123 as unknown as string };
      expect(() => validatePaymentRequired(invalid)).toThrow(
        "PaymentRequired validation failed: error must be a string if provided",
      );
    });

    it("should throw error if extensions is not an object when provided", () => {
      const invalid = { ...validPaymentRequired, extensions: [] as unknown as Record<string, unknown> };
      expect(() => validatePaymentRequired(invalid)).toThrow(
        "PaymentRequired validation failed: extensions must be an object if provided",
      );
    });

    it("should validate all requirements in accepts array", () => {
      const invalidRequirement = { ...validRequirements, scheme: "" };
      const invalid = { ...validPaymentRequired, accepts: [invalidRequirement] };
      expect(() => validatePaymentRequired(invalid)).toThrow(
        "PaymentRequired validation failed: accepts[0] is invalid",
      );
    });
  });
});

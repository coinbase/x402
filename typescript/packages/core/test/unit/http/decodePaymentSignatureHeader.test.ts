import { describe, it, expect } from "vitest";
import { decodePaymentSignatureHeader } from "../../../src/http";

describe("decodePaymentSignatureHeader - Validation", () => {
  describe("Empty/Invalid Base64", () => {
    it("should reject empty string", () => {
      expect(() => decodePaymentSignatureHeader("")).toThrow("Payment header is empty");
    });

    it("should reject whitespace-only string", () => {
      expect(() => decodePaymentSignatureHeader("   ")).toThrow("Payment header is empty");
    });

    it("should reject invalid base64 characters", () => {
      expect(() => decodePaymentSignatureHeader("invalid@#$%")).toThrow(
        "Invalid payment header format: not valid base64"
      );
    });
  });

  describe("Valid Base64 but Invalid JSON", () => {
    it("should reject non-JSON content", () => {
      const invalidJson = Buffer.from("not json at all").toString("base64");
      expect(() => decodePaymentSignatureHeader(invalidJson)).toThrow(
        "Invalid payment header format: not valid JSON"
      );
    });

    it("should reject malformed JSON", () => {
      const malformedJson = Buffer.from("{invalid json}").toString("base64");
      expect(() => decodePaymentSignatureHeader(malformedJson)).toThrow(
        "Invalid payment header format: not valid JSON"
      );
    });

    it("should reject JSON array instead of object", () => {
      const jsonArray = Buffer.from("[]").toString("base64");
      expect(() => decodePaymentSignatureHeader(jsonArray)).toThrow(
        "Invalid payment header format: must be a JSON object"
      );
    });

    it("should reject JSON primitive", () => {
      const jsonString = Buffer.from('"string"').toString("base64");
      expect(() => decodePaymentSignatureHeader(jsonString)).toThrow(
        "Invalid payment header format: must be a JSON object"
      );
    });
  });

  describe("Missing Required Fields", () => {
    it("should reject missing x402Version", () => {
      const payload = {
        resource: { url: "http://test.com", description: "Test", mimeType: "application/json" },
        accepted: {},
        payload: {},
      };
      const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
      expect(() => decodePaymentSignatureHeader(encoded)).toThrow(
        "Missing required field: x402Version"
      );
    });

    it("should reject missing resource", () => {
      const payload = {
        x402Version: 1,
        accepted: {},
        payload: {},
      };
      const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
      expect(() => decodePaymentSignatureHeader(encoded)).toThrow("Missing required field: resource");
    });

    it("should reject missing resource.url", () => {
      const payload = {
        x402Version: 1,
        resource: { description: "Test", mimeType: "application/json" },
        accepted: {},
        payload: {},
      };
      const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
      expect(() => decodePaymentSignatureHeader(encoded)).toThrow(
        "Missing required field: resource.url"
      );
    });

    it("should reject missing resource.description", () => {
      const payload = {
        x402Version: 1,
        resource: { url: "http://test.com", mimeType: "application/json" },
        accepted: {},
        payload: {},
      };
      const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
      expect(() => decodePaymentSignatureHeader(encoded)).toThrow(
        "Missing required field: resource.description"
      );
    });

    it("should reject missing resource.mimeType", () => {
      const payload = {
        x402Version: 1,
        resource: { url: "http://test.com", description: "Test" },
        accepted: {},
        payload: {},
      };
      const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
      expect(() => decodePaymentSignatureHeader(encoded)).toThrow(
        "Missing required field: resource.mimeType"
      );
    });

    it("should reject missing accepted", () => {
      const payload = {
        x402Version: 1,
        resource: { url: "http://test.com", description: "Test", mimeType: "application/json" },
        payload: {},
      };
      const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
      expect(() => decodePaymentSignatureHeader(encoded)).toThrow("Missing required field: accepted");
    });

    it("should reject missing payload", () => {
      const payload = {
        x402Version: 1,
        resource: { url: "http://test.com", description: "Test", mimeType: "application/json" },
        accepted: {},
      };
      const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
      expect(() => decodePaymentSignatureHeader(encoded)).toThrow("Missing required field: payload");
    });
  });

  describe("Invalid Field Types", () => {
    it("should reject x402Version as string", () => {
      const payload = {
        x402Version: "1",
        resource: { url: "http://test.com", description: "Test", mimeType: "application/json" },
        accepted: {},
        payload: {},
      };
      const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
      expect(() => decodePaymentSignatureHeader(encoded)).toThrow(
        "Invalid field type: x402Version must be a number"
      );
    });

    it("should reject resource as string", () => {
      const payload = {
        x402Version: 1,
        resource: "not an object",
        accepted: {},
        payload: {},
      };
      const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
      expect(() => decodePaymentSignatureHeader(encoded)).toThrow(
        "Invalid field type: resource must be an object"
      );
    });

    it("should reject resource.url as number", () => {
      const payload = {
        x402Version: 1,
        resource: { url: 123, description: "Test", mimeType: "application/json" },
        accepted: {},
        payload: {},
      };
      const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
      expect(() => decodePaymentSignatureHeader(encoded)).toThrow(
        "Invalid field type: resource.url must be a string"
      );
    });

    it("should reject accepted as array", () => {
      const payload = {
        x402Version: 1,
        resource: { url: "http://test.com", description: "Test", mimeType: "application/json" },
        accepted: [],
        payload: {},
      };
      const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
      expect(() => decodePaymentSignatureHeader(encoded)).toThrow(
        "Invalid field type: accepted must be an object"
      );
    });

    it("should reject payload as string", () => {
      const payload = {
        x402Version: 1,
        resource: { url: "http://test.com", description: "Test", mimeType: "application/json" },
        accepted: {},
        payload: "not an object",
      };
      const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
      expect(() => decodePaymentSignatureHeader(encoded)).toThrow(
        "Invalid field type: payload must be an object"
      );
    });
  });

  describe("Valid Payload", () => {
    it("should successfully decode a valid payment payload", () => {
      const payload = {
        x402Version: 1,
        resource: {
          url: "http://test.com/api",
          description: "Test API",
          mimeType: "application/json",
        },
        accepted: {
          scheme: "exact",
          network: "eip155:84532",
          asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          amount: "10000",
          payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
          maxTimeoutSeconds: 60,
        },
        payload: {
          signature: "0x123...",
        },
      };
      const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
      const decoded = decodePaymentSignatureHeader(encoded);

      expect(decoded).toBeDefined();
      expect(decoded.x402Version).toBe(1);
      expect(decoded.resource.url).toBe("http://test.com/api");
      expect(decoded.resource.description).toBe("Test API");
      expect(decoded.accepted).toBeDefined();
      expect(decoded.payload).toBeDefined();
    });
  });
});

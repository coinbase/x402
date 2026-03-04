import { describe, it, expect } from "vitest";
import {
  formatAmount,
  parseAmount,
  isValidAddress,
  isValidToken,
  isNonceFresh,
  normalizeAddress,
} from "../../src/utils.js";

describe("utils", () => {
  describe("formatAmount", () => {
    it("should format 8-decimal integer to USD string", () => {
      expect(formatAmount("10000")).toBe("0.00010000");
      expect(formatAmount("1000000")).toBe("0.01000000");
      expect(formatAmount("1")).toBe("0.00000001");
    });
  });

  describe("parseAmount", () => {
    it("should parse USD string to 8-decimal integer", () => {
      expect(parseAmount("0.01")).toBe("1000000");
      expect(parseAmount("1")).toBe("100000000");
      expect(parseAmount("0.00000001")).toBe("1");
    });

    it("should handle $ prefix", () => {
      expect(parseAmount("$0.01")).toBe("1000000");
      expect(parseAmount("$ 1.50")).toBe("150000000");
    });

    it("should handle numbers", () => {
      expect(parseAmount(0.01)).toBe("1000000");
      expect(parseAmount(1)).toBe("100000000");
    });

    it("should throw on invalid amounts", () => {
      expect(() => parseAmount("invalid")).toThrow();
      expect(() => parseAmount(-1)).toThrow();
    });
  });

  describe("isValidAddress", () => {
    it("should validate Ethereum addresses", () => {
      expect(isValidAddress("0x0000000000000000000000000000000000000000")).toBe(true);
      expect(isValidAddress("0xAbCdEf0123456789AbCdEf0123456789AbCdEf01")).toBe(true);
    });

    it("should reject invalid addresses", () => {
      expect(isValidAddress("0x123")).toBe(false);
      expect(isValidAddress("not an address")).toBe(false);
      expect(isValidAddress("0xZZZZ000000000000000000000000000000000000")).toBe(false);
    });
  });

  describe("isValidToken", () => {
    it("should validate USDH token format", () => {
      expect(isValidToken("USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b")).toBe(true);
      expect(isValidToken("USDH:0x00000000000000000000000000000000")).toBe(true);
    });

    it("should reject invalid token formats", () => {
      expect(isValidToken("USDC:0x123")).toBe(false);
      expect(isValidToken("USDH:123")).toBe(false);
      expect(isValidToken("not a token")).toBe(false);
    });
  });

  describe("isNonceFresh", () => {
    it("should accept recent nonces", () => {
      const now = Date.now();
      expect(isNonceFresh(now)).toBe(true);
      expect(isNonceFresh(now - 1000)).toBe(true);
      expect(isNonceFresh(now - 60000)).toBe(true);
    });

    it("should reject old nonces", () => {
      const oneHourAgo = Date.now() - 3600000 - 1000;
      expect(isNonceFresh(oneHourAgo)).toBe(false);
    });

    it("should reject future nonces", () => {
      const future = Date.now() + 1000;
      expect(isNonceFresh(future)).toBe(false);
    });

    it("should respect custom max age", () => {
      const now = Date.now();
      const fiveMinutesAgo = now - 300000;
      expect(isNonceFresh(fiveMinutesAgo, 600000)).toBe(true);
      expect(isNonceFresh(fiveMinutesAgo, 60000)).toBe(false);
    });
  });

  describe("normalizeAddress", () => {
    it("should convert addresses to lowercase", () => {
      expect(normalizeAddress("0xAbCdEf0123456789AbCdEf0123456789AbCdEf01")).toBe(
        "0xabcdef0123456789abcdef0123456789abcdef01",
      );
    });
  });
});

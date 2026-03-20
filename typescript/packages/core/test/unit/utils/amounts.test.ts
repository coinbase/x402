import { describe, it, expect } from "vitest";
import {
  dollarStringToAtomic,
  atomicToDollarString,
  isValidAtomicAmount,
  compareAtomicAmounts,
  TOKEN_DECIMALS,
} from "../../../src/utils/amounts";

describe("Amount Utilities", () => {
  describe("dollarStringToAtomic", () => {
    it("should convert simple dollar amounts to USDC atomic units", () => {
      expect(dollarStringToAtomic("$0.01", TOKEN_DECIMALS.USDC)).toBe("10000");
      expect(dollarStringToAtomic("$1.00", TOKEN_DECIMALS.USDC)).toBe("1000000");
      expect(dollarStringToAtomic("$1.50", TOKEN_DECIMALS.USDC)).toBe("1500000");
      expect(dollarStringToAtomic("$0.001", TOKEN_DECIMALS.USDC)).toBe("1000");
    });

    it("should convert dollar amounts to ETH atomic units (wei)", () => {
      expect(dollarStringToAtomic("$1.00", TOKEN_DECIMALS.ETH)).toBe("1000000000000000000");
      expect(dollarStringToAtomic("$0.01", TOKEN_DECIMALS.ETH)).toBe("10000000000000000");
      expect(dollarStringToAtomic("$0.001", TOKEN_DECIMALS.ETH)).toBe("1000000000000000");
    });

    it("should convert dollar amounts to SOL atomic units (lamports)", () => {
      expect(dollarStringToAtomic("$1.00", TOKEN_DECIMALS.SOL)).toBe("1000000000");
      expect(dollarStringToAtomic("$0.01", TOKEN_DECIMALS.SOL)).toBe("10000000");
      expect(dollarStringToAtomic("$0.001", TOKEN_DECIMALS.SOL)).toBe("1000000");
    });

    it("should handle zero amounts", () => {
      expect(dollarStringToAtomic("$0", TOKEN_DECIMALS.USDC)).toBe("0");
      expect(dollarStringToAtomic("$0.00", TOKEN_DECIMALS.USDC)).toBe("0");
    });

    it("should handle amounts without $ prefix", () => {
      expect(dollarStringToAtomic("1.00", TOKEN_DECIMALS.USDC)).toBe("1000000");
      expect(dollarStringToAtomic("0.01", TOKEN_DECIMALS.USDC)).toBe("10000");
    });

    it("should throw on invalid dollar amounts", () => {
      expect(() => dollarStringToAtomic("$abc", TOKEN_DECIMALS.USDC)).toThrow("Invalid dollar amount");
      expect(() => dollarStringToAtomic("$-1.00", TOKEN_DECIMALS.USDC)).toThrow("Invalid dollar amount");
      expect(() => dollarStringToAtomic("", TOKEN_DECIMALS.USDC)).toThrow("Invalid dollar amount");
    });

    it("should throw on invalid token decimals", () => {
      expect(() => dollarStringToAtomic("$1.00", -1)).toThrow("Invalid token decimals");
      expect(() => dollarStringToAtomic("$1.00", 256)).toThrow("Invalid token decimals");
    });
  });

  describe("atomicToDollarString", () => {
    it("should convert USDC atomic units back to dollar strings", () => {
      expect(atomicToDollarString("10000", TOKEN_DECIMALS.USDC)).toBe("$0.01");
      expect(atomicToDollarString("1000000", TOKEN_DECIMALS.USDC)).toBe("$1");
      expect(atomicToDollarString("1500000", TOKEN_DECIMALS.USDC)).toBe("$1.5");
      expect(atomicToDollarString("1000", TOKEN_DECIMALS.USDC)).toBe("$0.001");
      expect(atomicToDollarString("1", TOKEN_DECIMALS.USDC)).toBe("$0.000001");
    });

    it("should convert ETH atomic units (wei) back to dollar strings", () => {
      expect(atomicToDollarString("1000000000000000000", TOKEN_DECIMALS.ETH)).toBe("$1");
      expect(atomicToDollarString("10000000000000000", TOKEN_DECIMALS.ETH)).toBe("$0.01");
      expect(atomicToDollarString("1", TOKEN_DECIMALS.ETH)).toBe("$0.000000000000000001");
    });

    it("should handle zero amounts", () => {
      expect(atomicToDollarString("0", TOKEN_DECIMALS.USDC)).toBe("$0");
      expect(atomicToDollarString("0", TOKEN_DECIMALS.ETH)).toBe("$0");
    });

    it("should handle very large amounts", () => {
      const largeAmount = "999999999999999999999999";
      const result = atomicToDollarString(largeAmount, TOKEN_DECIMALS.USDC);
      expect(result).toContain("$999999999999999999");
    });

    it("should throw on negative amounts", () => {
      expect(() => atomicToDollarString("-100", TOKEN_DECIMALS.USDC)).toThrow("Invalid atomic amount");
    });

    it("should throw on invalid token decimals", () => {
      expect(() => atomicToDollarString("100", -1)).toThrow("Invalid token decimals");
      expect(() => atomicToDollarString("100", 256)).toThrow("Invalid token decimals");
    });

    it("should properly format amounts without trailing zeros", () => {
      expect(atomicToDollarString("1010000", TOKEN_DECIMALS.USDC)).toBe("$1.01");
      expect(atomicToDollarString("1000000", TOKEN_DECIMALS.USDC)).toBe("$1");
      expect(atomicToDollarString("1000001", TOKEN_DECIMALS.USDC)).toBe("$1.000001");
    });
  });

  describe("Round-trip conversions", () => {
    it("should preserve amounts through round-trip conversion", () => {
      const testAmounts = ["$0.01", "$1.00", "$1.50", "$0.001", "$10.25"];
      
      testAmounts.forEach(amount => {
        const atomic = dollarStringToAtomic(amount, TOKEN_DECIMALS.USDC);
        const backToDollar = atomicToDollarString(atomic, TOKEN_DECIMALS.USDC);
        
        // Normalize the original amount for comparison (remove trailing zeros)
        const normalizedOriginal = amount.replace(/\.?0+$/, '');
        expect(backToDollar).toBe(normalizedOriginal === "$" ? "$0" : normalizedOriginal);
      });
    });
  });

  describe("isValidAtomicAmount", () => {
    it("should return true for valid atomic amounts", () => {
      expect(isValidAtomicAmount("0")).toBe(true);
      expect(isValidAtomicAmount("1")).toBe(true);
      expect(isValidAtomicAmount("1000000")).toBe(true);
      expect(isValidAtomicAmount("999999999999999999999999")).toBe(true);
    });

    it("should return false for invalid atomic amounts", () => {
      expect(isValidAtomicAmount("-1")).toBe(false);
      expect(isValidAtomicAmount("1.5")).toBe(false);
      expect(isValidAtomicAmount("abc")).toBe(false);
      expect(isValidAtomicAmount("")).toBe(false);
      expect(isValidAtomicAmount("1e10")).toBe(false);
      expect(isValidAtomicAmount("01")).toBe(false); // leading zeros not allowed
    });
  });

  describe("compareAtomicAmounts", () => {
    it("should correctly compare equal amounts", () => {
      expect(compareAtomicAmounts("1000000", "1000000")).toBe(0);
      expect(compareAtomicAmounts("0", "0")).toBe(0);
    });

    it("should correctly identify smaller amounts", () => {
      expect(compareAtomicAmounts("500000", "1000000")).toBe(-1);
      expect(compareAtomicAmounts("0", "1")).toBe(-1);
      expect(compareAtomicAmounts("999", "1000")).toBe(-1);
    });

    it("should correctly identify larger amounts", () => {
      expect(compareAtomicAmounts("1000000", "500000")).toBe(1);
      expect(compareAtomicAmounts("1", "0")).toBe(1);
      expect(compareAtomicAmounts("1000", "999")).toBe(1);
    });

    it("should handle very large amounts", () => {
      const large1 = "999999999999999999999999";
      const large2 = "1000000000000000000000000";
      expect(compareAtomicAmounts(large1, large2)).toBe(-1);
      expect(compareAtomicAmounts(large2, large1)).toBe(1);
    });
  });

  describe("TOKEN_DECIMALS constants", () => {
    it("should have correct decimal values for common tokens", () => {
      expect(TOKEN_DECIMALS.ETH).toBe(18);
      expect(TOKEN_DECIMALS.USDC).toBe(6);
      expect(TOKEN_DECIMALS.USDT).toBe(6);
      expect(TOKEN_DECIMALS.DAI).toBe(18);
      expect(TOKEN_DECIMALS.WBTC).toBe(8);
      expect(TOKEN_DECIMALS.SOL).toBe(9);
    });

    it("should work correctly with dollarStringToAtomic", () => {
      expect(dollarStringToAtomic("$1.00", TOKEN_DECIMALS.USDC)).toBe("1000000");
      expect(dollarStringToAtomic("$1.00", TOKEN_DECIMALS.ETH)).toBe("1000000000000000000");
      expect(dollarStringToAtomic("$1.00", TOKEN_DECIMALS.WBTC)).toBe("100000000");
    });
  });

  describe("Edge cases", () => {
    it("should handle maximum precision for different tokens", () => {
      // Test minimum unit for each token type
      expect(atomicToDollarString("1", TOKEN_DECIMALS.USDC)).toBe("$0.000001");
      expect(atomicToDollarString("1", TOKEN_DECIMALS.ETH)).toBe("$0.000000000000000001");
      expect(atomicToDollarString("1", TOKEN_DECIMALS.WBTC)).toBe("$0.00000001");
    });

    it("should handle tokens with 0 decimals", () => {
      expect(dollarStringToAtomic("$5", 0)).toBe("5");
      expect(atomicToDollarString("5", 0)).toBe("$5");
    });

    it("should handle very high precision tokens", () => {
      const highPrecision = 18;
      expect(dollarStringToAtomic("$0.000000000000000001", highPrecision)).toBe("1");
      expect(atomicToDollarString("1", highPrecision)).toBe("$0.000000000000000001");
    });
  });
});
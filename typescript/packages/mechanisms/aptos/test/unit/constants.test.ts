import { describe, it, expect } from "vitest";
import { Network } from "@aptos-labs/ts-sdk";
import {
  APTOS_MAINNET_CAIP2,
  APTOS_TESTNET_CAIP2,
  APTOS_ADDRESS_REGEX,
  TRANSFER_FUNCTION,
  getAptosNetwork,
  getAptosRpcUrl,
} from "../../src/constants";

describe("Aptos Constants", () => {
  describe("Network identifiers", () => {
    it("should have correct CAIP-2 format for mainnet", () => {
      expect(APTOS_MAINNET_CAIP2).toBe("aptos:1");
    });

    it("should have correct CAIP-2 format for testnet", () => {
      expect(APTOS_TESTNET_CAIP2).toBe("aptos:2");
    });
  });

  describe("APTOS_ADDRESS_REGEX", () => {
    it("should match valid Aptos addresses", () => {
      const validAddress = "0x0000000000000000000000000000000000000000000000000000000000000001";
      expect(APTOS_ADDRESS_REGEX.test(validAddress)).toBe(true);
    });

    it("should match addresses with mixed case hex", () => {
      const validAddress = "0xABCDef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
      expect(APTOS_ADDRESS_REGEX.test(validAddress)).toBe(true);
    });

    it("should reject addresses without 0x prefix", () => {
      const invalidAddress = "0000000000000000000000000000000000000000000000000000000000000001";
      expect(APTOS_ADDRESS_REGEX.test(invalidAddress)).toBe(false);
    });

    it("should reject addresses with wrong length", () => {
      expect(APTOS_ADDRESS_REGEX.test("0x1234")).toBe(false);
      expect(APTOS_ADDRESS_REGEX.test("0x" + "a".repeat(65))).toBe(false);
    });

    it("should reject addresses with invalid characters", () => {
      const invalidAddress = "0xGGGG000000000000000000000000000000000000000000000000000000000001";
      expect(APTOS_ADDRESS_REGEX.test(invalidAddress)).toBe(false);
    });
  });

  describe("TRANSFER_FUNCTION", () => {
    it("should be the correct primary fungible store transfer function", () => {
      expect(TRANSFER_FUNCTION).toBe("0x1::primary_fungible_store::transfer");
    });
  });

  describe("getAptosNetwork", () => {
    it("should return MAINNET for aptos:1", () => {
      expect(getAptosNetwork("aptos:1")).toBe(Network.MAINNET);
    });

    it("should return TESTNET for aptos:2", () => {
      expect(getAptosNetwork("aptos:2")).toBe(Network.TESTNET);
    });

    it("should throw for unsupported networks", () => {
      expect(() => getAptosNetwork("aptos:99")).toThrow("Unsupported Aptos network");
      expect(() => getAptosNetwork("ethereum:1")).toThrow("Unsupported Aptos network");
      expect(() => getAptosNetwork("invalid")).toThrow("Unsupported Aptos network");
    });
  });

  describe("getAptosRpcUrl", () => {
    it("should return a valid URL for mainnet", () => {
      const url = getAptosRpcUrl(Network.MAINNET);
      expect(url).toContain("aptos");
      expect(url.startsWith("https://")).toBe(true);
    });

    it("should return a valid URL for testnet", () => {
      const url = getAptosRpcUrl(Network.TESTNET);
      expect(url).toContain("aptos");
      expect(url.startsWith("https://")).toBe(true);
    });

    it("should return different URLs for different networks", () => {
      const mainnetUrl = getAptosRpcUrl(Network.MAINNET);
      const testnetUrl = getAptosRpcUrl(Network.TESTNET);
      expect(mainnetUrl).not.toBe(testnetUrl);
    });
  });
});

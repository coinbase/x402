import { describe, it, expect } from "vitest";
import {
  ExactAptosClient,
  ExactAptosFacilitator,
  ExactAptosServer,
  APTOS_MAINNET_CAIP2,
  APTOS_TESTNET_CAIP2,
  APTOS_ADDRESS_REGEX,
  TRANSFER_FUNCTION,
  getAptosNetwork,
  getAptosRpcUrl,
} from "../../src/index";

describe("@x402/aptos", () => {
  describe("exports", () => {
    it("should export main scheme classes", () => {
      expect(ExactAptosClient).toBeDefined();
      expect(ExactAptosFacilitator).toBeDefined();
      expect(ExactAptosServer).toBeDefined();
    });

    it("should export constants", () => {
      expect(APTOS_MAINNET_CAIP2).toBe("aptos:1");
      expect(APTOS_TESTNET_CAIP2).toBe("aptos:2");
      expect(APTOS_ADDRESS_REGEX).toBeDefined();
      expect(TRANSFER_FUNCTION).toBe("0x1::primary_fungible_store::transfer");
    });

    it("should export utility functions", () => {
      expect(getAptosNetwork).toBeDefined();
      expect(getAptosRpcUrl).toBeDefined();
    });
  });

  describe("ExactAptosServer", () => {
    it("should have scheme property set to exact", () => {
      const server = new ExactAptosServer();
      expect(server.scheme).toBe("exact");
    });
  });
});

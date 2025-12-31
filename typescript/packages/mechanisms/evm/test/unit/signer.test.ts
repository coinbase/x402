import { describe, it, expect } from "vitest";
import { toClientEvmSigner, toFacilitatorEvmSigner } from "../../src/signer";
import type { ClientEvmSigner } from "../../src/signer";

describe("EVM Signer Converters", () => {
  describe("toClientEvmSigner", () => {
    it("should return the same signer (identity function)", () => {
      const mockSigner: ClientEvmSigner = {
        address: "0x1234567890123456789012345678901234567890",
        signTypedData: async () => "0xsignature" as `0x${string}`,
      };

      const result = toClientEvmSigner(mockSigner);
      expect(result).toBe(mockSigner);
      expect(result.address).toBe(mockSigner.address);
    });
  });

  describe("toFacilitatorEvmSigner", () => {
    it("should wrap client with getAddresses() method", () => {
      const mockClient = {
        address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        readContract: async () => BigInt(0),
        verifyTypedData: async () => true,
        writeContract: async () => "0xtxhash" as `0x${string}`,
        waitForTransactionReceipt: async () => ({ status: "success" }),
        getCode: async () => "0x" as `0x${string}`,
      };

      const result = toFacilitatorEvmSigner(mockClient);

      // Should add getAddresses() method
      expect(result.getAddresses).toBeDefined();
      expect(result.getAddresses()).toEqual([mockClient.address]);

      // Should preserve all other methods
      expect(result.readContract).toBe(mockClient.readContract);
      expect(result.verifyTypedData).toBe(mockClient.verifyTypedData);
      expect(result.writeContract).toBe(mockClient.writeContract);
      expect(result.waitForTransactionReceipt).toBe(mockClient.waitForTransactionReceipt);
      expect(result.getCode).toBe(mockClient.getCode);
    });
  });
});

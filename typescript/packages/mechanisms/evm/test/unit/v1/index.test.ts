import { describe, it, expect } from "vitest";
import { ExactEvmClientV1, ExactEvmFacilitatorV1 } from "../../../src/v1";

describe("@x402/evm/v1", () => {
  it("should export ExactEvmClientV1", () => {
    expect(ExactEvmClientV1).toBeDefined();
    expect(typeof ExactEvmClientV1).toBe("function");
  });

  it("should export ExactEvmFacilitatorV1", () => {
    expect(ExactEvmFacilitatorV1).toBeDefined();
    expect(typeof ExactEvmFacilitatorV1).toBe("function");
  });

  it("should create ExactEvmClientV1 instance with correct scheme", () => {
    const mockSigner = {
      address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
      signTypedData: async () => "0xsig" as `0x${string}`,
    };

    const client = new ExactEvmClientV1(mockSigner);
    expect(client.scheme).toBe("exact");
  });

  it("should create ExactEvmFacilitatorV1 instance with correct scheme", () => {
    const mockSigner = {
      readContract: async () => BigInt(0),
      verifyTypedData: async () => true,
      writeContract: async () => "0x" as `0x${string}`,
      waitForTransactionReceipt: async () => ({ status: "success" }),
    };

    const facilitator = new ExactEvmFacilitatorV1(mockSigner);
    expect(facilitator.scheme).toBe("exact");
  });
});

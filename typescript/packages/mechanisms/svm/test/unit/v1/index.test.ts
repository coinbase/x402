import { describe, it, expect } from "vitest";
import { ExactSvmClientV1, ExactSvmFacilitatorV1 } from "../../../src/v1";

describe("@x402/svm/v1", () => {
  it("should export ExactSvmClientV1", () => {
    expect(ExactSvmClientV1).toBeDefined();
    expect(typeof ExactSvmClientV1).toBe("function");
  });

  it("should export ExactSvmFacilitatorV1", () => {
    expect(ExactSvmFacilitatorV1).toBeDefined();
    expect(typeof ExactSvmFacilitatorV1).toBe("function");
  });

  it("should create ExactSvmClientV1 instance with correct scheme", () => {
    const mockSigner = {
      address: "9xAXssX9j7vuK99c7cFwqbixzL3bFrzPy9PUhCtDPAYJ" as never,
      signTransactions: async () => [] as never,
    };

    const client = new ExactSvmClientV1(mockSigner);
    expect(client.scheme).toBe("exact");
  });

  it("should create ExactSvmFacilitatorV1 instance with correct scheme", () => {
    const mockSigner = {
      address: "FacilitatorAddress1111111111111111111" as never,
      signTransactions: async () => [] as never,
      signMessages: async () => [] as never,
      getRpcForNetwork: () =>
        ({
          getBalance: async () => BigInt(0),
        }) as never,
    };

    const facilitator = new ExactSvmFacilitatorV1(mockSigner as never);
    expect(facilitator.scheme).toBe("exact");
  });
});


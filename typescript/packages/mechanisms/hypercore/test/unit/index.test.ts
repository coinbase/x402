import { describe, it, expect } from "vitest";
import { ExactHypercoreScheme } from "../../src/index.js";

describe("@x402/hypercore", () => {
  it("should export ExactHypercoreScheme", () => {
    expect(ExactHypercoreScheme).toBeDefined();
    expect(typeof ExactHypercoreScheme).toBe("function");
  });

  it("should create an instance", () => {
    const mockSigner = {
      signSendAsset: async () => ({ r: "0x", s: "0x", v: 27 }),
      getAddress: () => "0x0000000000000000000000000000000000000000",
    };
    const instance = new ExactHypercoreScheme(mockSigner as any);
    expect(instance).toBeDefined();
    expect(instance.scheme).toBe("exact");
  });
});

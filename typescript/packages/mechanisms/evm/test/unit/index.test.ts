import { describe, it, expect } from "vitest";
import { ExactEvmClient, ExactEvmFacilitator, ExactEvmService } from "../../src";

describe("@x402/evm", () => {
  it("should export ExactEvmClient", () => {
    expect(ExactEvmClient).toBeDefined();
    expect(typeof ExactEvmClient).toBe("function");
  });

  it("should export ExactEvmFacilitator", () => {
    expect(ExactEvmFacilitator).toBeDefined();
    expect(typeof ExactEvmFacilitator).toBe("function");
  });

  it("should export ExactEvmService", () => {
    expect(ExactEvmService).toBeDefined();
    expect(typeof ExactEvmService).toBe("function");
  });

  it("should create ExactEvmService instance", () => {
    const service = new ExactEvmService();
    expect(service.scheme).toBe("exact");
  });
});

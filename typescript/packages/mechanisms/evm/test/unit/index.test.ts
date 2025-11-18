import { describe, it, expect } from "vitest";
import { ExactEvmClient, ExactEvmFacilitator, ExactEvmServer } from "../../src";

describe("@x402/evm", () => {
  it("should export ExactEvmClient", () => {
    expect(ExactEvmClient).toBeDefined();
    expect(typeof ExactEvmClient).toBe("function");
  });

  it("should export ExactEvmFacilitator", () => {
    expect(ExactEvmFacilitator).toBeDefined();
    expect(typeof ExactEvmFacilitator).toBe("function");
  });

  it("should export ExactEvmServer", () => {
    expect(ExactEvmServer).toBeDefined();
    expect(typeof ExactEvmServer).toBe("function");
  });

  it("should create ExactEvmServer instance", () => {
    const server = new ExactEvmServer();
    expect(server.scheme).toBe("exact");
  });
});

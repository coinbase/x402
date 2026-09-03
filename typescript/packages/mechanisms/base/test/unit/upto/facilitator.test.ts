import { describe, it, expect, vi } from "vitest";
import { BaseScheme, type BaseFacilitatorSigner } from "../../../src/upto/facilitator/scheme";

/**
 * `BaseScheme` (upto facilitator) is a thin pass-through wrapper around `@x402/evm`'s
 * `UptoEvmScheme`. Verify/settle logic (Permit2, gas sponsoring, etc.) is covered by
 * `@x402/evm`'s own test suite - these tests only verify that the wrapper actually
 * delegates and doesn't diverge from the underlying implementation.
 */
describe("BaseScheme (Upto Facilitator)", () => {
  const mockSigner: BaseFacilitatorSigner = {
    getAddresses: vi.fn().mockReturnValue(["0x1234567890123456789012345678901234567890"]),
    readContract: vi.fn(),
    verifyTypedData: vi.fn(),
    writeContract: vi.fn(),
    sendTransaction: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
    getCode: vi.fn(),
  };

  it("exposes scheme = 'upto' and caipFamily = 'eip155:*'", () => {
    const facilitator = new BaseScheme(mockSigner);
    expect(facilitator.scheme).toBe("upto");
    expect(facilitator.caipFamily).toBe("eip155:*");
  });

  it("delegates getSigners to the underlying UptoEvmScheme", () => {
    const facilitator = new BaseScheme(mockSigner);
    expect(facilitator.getSigners("eip155:8453")).toEqual([
      "0x1234567890123456789012345678901234567890",
    ]);
  });

  it("delegates getExtra to the underlying UptoEvmScheme (facilitatorAddress)", () => {
    const facilitator = new BaseScheme(mockSigner);
    expect(facilitator.getExtra("eip155:8453")).toEqual({
      facilitatorAddress: "0x1234567890123456789012345678901234567890",
    });
  });

  it("returns [] from getSigners and undefined from getExtra for a network outside Base's scope", () => {
    const facilitator = new BaseScheme(mockSigner);
    expect(facilitator.getSigners("eip155:1")).toEqual([]);
    expect(facilitator.getExtra("eip155:1")).toBeUndefined();
  });

  const requirements = {
    scheme: "upto",
    network: "eip155:1" as const,
    amount: "1000000",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
    maxTimeoutSeconds: 300,
    extra: {},
  };

  it("rejects verify for a network outside Base's scope", async () => {
    const facilitator = new BaseScheme(mockSigner);
    await expect(facilitator.verify({ x402Version: 2 } as never, requirements)).rejects.toThrow(
      /eip155:1/,
    );
  });

  it("rejects settle for a network outside Base's scope", async () => {
    const facilitator = new BaseScheme(mockSigner);
    await expect(facilitator.settle({ x402Version: 2 } as never, requirements)).rejects.toThrow(
      /eip155:1/,
    );
  });
});

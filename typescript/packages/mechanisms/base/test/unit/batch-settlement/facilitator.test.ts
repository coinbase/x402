import { describe, it, expect, vi } from "vitest";
import {
  BaseScheme,
  type BaseAuthorizerSigner,
  type BaseFacilitatorSigner,
} from "../../../src/batch-settlement/facilitator/scheme";

/**
 * `BaseScheme` (batch-settlement facilitator) is a thin pass-through wrapper
 * around `@x402/evm`'s `BatchSettlementEvmScheme`. Deposit/voucher verification and
 * onchain settlement details are covered by `@x402/evm`'s own test suite - these
 * tests only verify that the wrapper actually delegates and doesn't diverge from
 * the underlying implementation.
 */
describe("BaseScheme (Batch-Settlement Facilitator)", () => {
  const mockSigner: BaseFacilitatorSigner = {
    getAddresses: vi.fn().mockReturnValue(["0x1234567890123456789012345678901234567890"]),
    readContract: vi.fn(),
    verifyTypedData: vi.fn(),
    writeContract: vi.fn(),
    sendTransaction: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
    getCode: vi.fn(),
  };

  it("exposes scheme = 'batch-settlement' and caipFamily = 'eip155:*'", () => {
    const facilitator = new BaseScheme(mockSigner);
    expect(facilitator.scheme).toBe("batch-settlement");
    expect(facilitator.caipFamily).toBe("eip155:*");
  });

  it("delegates getSigners to the underlying BatchSettlementEvmScheme", () => {
    const facilitator = new BaseScheme(mockSigner);
    expect(facilitator.getSigners("eip155:84532")).toEqual([
      "0x1234567890123456789012345678901234567890",
    ]);
  });

  it("delegates getExtra to the underlying BatchSettlementEvmScheme (undefined with no authorizerSigner)", () => {
    const facilitator = new BaseScheme(mockSigner);
    expect(facilitator.getExtra("eip155:84532")).toBeUndefined();
  });

  it("delegates getExtra to the underlying BatchSettlementEvmScheme (receiverAuthorizer when configured)", () => {
    const authorizerSigner: BaseAuthorizerSigner = {
      address: "0x9876543210987654321098765432109876543210",
      signTypedData: vi.fn().mockResolvedValue("0xmocksignature"),
    };
    const facilitator = new BaseScheme(mockSigner, authorizerSigner);
    expect(facilitator.getExtra("eip155:84532")).toEqual({
      receiverAuthorizer: "0x9876543210987654321098765432109876543210",
    });
  });

  it("returns [] from getSigners and undefined from getExtra for a network outside Base's scope", () => {
    const facilitator = new BaseScheme(mockSigner);
    expect(facilitator.getSigners("eip155:1")).toEqual([]);
    expect(facilitator.getExtra("eip155:1")).toBeUndefined();
  });

  const requirements = {
    scheme: "batch-settlement",
    network: "eip155:1" as const,
    amount: "1000000",
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
    maxTimeoutSeconds: 3600,
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

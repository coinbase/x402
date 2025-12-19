import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExactStellarScheme } from "../../src/exact/facilitator/scheme";
import { STELLAR_TESTNET_CAIP2 } from "../../src/constants";
import { createEd25519Signer } from "../../src/signer";
import * as stellarUtils from "../../src/utils";

vi.mock("../../src/utils", async () => {
  const actual = await vi.importActual<typeof stellarUtils>("../../src/utils");
  return {
    ...actual,
    getRpcClient: vi.fn(),
  };
});

describe("ExactStellarScheme - getExtra", () => {
  const mockRpcClient = {
    getLatestLedger: vi.fn(),
  };
  let scheme: ExactStellarScheme;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(stellarUtils.getRpcClient).mockReturnValue(mockRpcClient as never);
  });

  it("should fetch latest ledger and return maxLedger", async () => {
    const signer = createEd25519Signer(
      "SDV3OZOPGIO6GQAVI7T6ZJ7NSNFB26JX6QZYCI64TBC7BAZY6FQVAXXK",
      STELLAR_TESTNET_CAIP2,
    );
    mockRpcClient.getLatestLedger.mockResolvedValue({ sequence: 1000 });

    scheme = new ExactStellarScheme(signer);

    const result = await scheme.getExtra(STELLAR_TESTNET_CAIP2);

    expect(result).toEqual({
      maxLedger: 1012, // 1000 + 12 (default buffer)
    });
    expect(mockRpcClient.getLatestLedger).toHaveBeenCalledTimes(1);
  });

  it("should always fetch fresh ledger value on each call", async () => {
    const signer = createEd25519Signer(
      "SDV3OZOPGIO6GQAVI7T6ZJ7NSNFB26JX6QZYCI64TBC7BAZY6FQVAXXK",
      STELLAR_TESTNET_CAIP2,
    );
    mockRpcClient.getLatestLedger
      .mockResolvedValueOnce({ sequence: 1000 })
      .mockResolvedValueOnce({ sequence: 2000 });

    scheme = new ExactStellarScheme(signer);

    const result1 = await scheme.getExtra(STELLAR_TESTNET_CAIP2);
    expect(result1).toEqual({ maxLedger: 1012 });

    const result2 = await scheme.getExtra(STELLAR_TESTNET_CAIP2);
    expect(result2).toEqual({ maxLedger: 2012 });

    expect(mockRpcClient.getLatestLedger).toHaveBeenCalledTimes(2);
  });

  it("should use custom ledger buffer", async () => {
    const signer = createEd25519Signer(
      "SDV3OZOPGIO6GQAVI7T6ZJ7NSNFB26JX6QZYCI64TBC7BAZY6FQVAXXK",
      STELLAR_TESTNET_CAIP2,
    );
    mockRpcClient.getLatestLedger.mockResolvedValue({ sequence: 2000 });

    scheme = new ExactStellarScheme(signer, undefined, 20);

    const result = await scheme.getExtra(STELLAR_TESTNET_CAIP2);
    expect(result).toEqual({
      maxLedger: 2020, // 2000 + 20 (custom buffer)
    });
  });
});

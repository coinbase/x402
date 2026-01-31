import { describe, it, expect, vi, beforeEach } from "vitest";
import { STELLAR_TESTNET_CAIP2 } from "../../src/constants";
import { ExactStellarScheme } from "../../src/exact/facilitator/scheme";
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

  it("should return areFeesSponsored", async () => {
    const signer = createEd25519Signer(
      "SDV3OZOPGIO6GQAVI7T6ZJ7NSNFB26JX6QZYCI64TBC7BAZY6FQVAXXK",
      STELLAR_TESTNET_CAIP2,
    );

    scheme = new ExactStellarScheme(signer);

    const result = await scheme.getExtra(STELLAR_TESTNET_CAIP2);

    expect(result).toEqual({ areFeesSponsored: true });
    expect(mockRpcClient.getLatestLedger).not.toHaveBeenCalled();
  });

  it("should return consistent areFeesSponsored on each call", async () => {
    const signer = createEd25519Signer(
      "SDV3OZOPGIO6GQAVI7T6ZJ7NSNFB26JX6QZYCI64TBC7BAZY6FQVAXXK",
      STELLAR_TESTNET_CAIP2,
    );

    scheme = new ExactStellarScheme(signer);

    const result1 = await scheme.getExtra(STELLAR_TESTNET_CAIP2);
    expect(result1).toEqual({ areFeesSponsored: true });

    const result2 = await scheme.getExtra(STELLAR_TESTNET_CAIP2);
    expect(result2).toEqual({ areFeesSponsored: true });

    expect(mockRpcClient.getLatestLedger).not.toHaveBeenCalled();
  });

  it("should use custom areFeesSponsored", async () => {
    const signer = createEd25519Signer(
      "SDV3OZOPGIO6GQAVI7T6ZJ7NSNFB26JX6QZYCI64TBC7BAZY6FQVAXXK",
      STELLAR_TESTNET_CAIP2,
    );

    scheme = new ExactStellarScheme(signer, undefined, false);

    const result = await scheme.getExtra(STELLAR_TESTNET_CAIP2);
    expect(result).toEqual({ areFeesSponsored: false });
  });
});

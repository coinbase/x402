import { describe, it, expect } from "vitest";
import { getDefaultAsset } from "./middleware";

describe("getDefaultAsset on BSC", () => {
  it("returns USDC config for bsc", () => {
    const asset = getDefaultAsset("bsc");
    expect(asset.address).toBe("0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d");
    expect(asset.decimals).toBe(6);
    expect(asset.eip712?.name).toBe("USD Coin");
  });

  it("returns SDT config for bsc-testnet (mock)", () => {
    const asset = getDefaultAsset("bsc-testnet");
    expect(String(asset.address).toLowerCase()).toBe(
      "0x64544969ed7ebf5f083679233325356ebe738930".toLowerCase(),
    );
    expect(asset.decimals).toBe(6);
    expect(asset.eip712?.name).toBe("SDT");
  });
});

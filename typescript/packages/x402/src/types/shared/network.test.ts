import { describe, it, expect } from "vitest";
import { NetworkSchema, SupportedEVMNetworks, EvmNetworkToChainId } from "./network";
import { getNetworkId } from "../../shared/network";

describe("BSC network support", () => {
  it("includes bsc and bsc-testnet in NetworkSchema", () => {
    expect(NetworkSchema.safeParse("bsc").success).toBe(true);
    expect(NetworkSchema.safeParse("bsc-testnet").success).toBe(true);
  });

  it("maps bsc/bsc-testnet to correct chainIds", () => {
    expect(EvmNetworkToChainId.get("bsc")).toBe(56);
    expect(EvmNetworkToChainId.get("bsc-testnet")).toBe(97);
  });

  it("getNetworkId returns correct ids for bsc and bsc-testnet", () => {
    expect(getNetworkId("bsc")).toBe(56);
    expect(getNetworkId("bsc-testnet")).toBe(97);
  });

  it("SupportedEVMNetworks contains bsc and bsc-testnet", () => {
    expect(SupportedEVMNetworks).toContain("bsc");
    expect(SupportedEVMNetworks).toContain("bsc-testnet");
  });
});

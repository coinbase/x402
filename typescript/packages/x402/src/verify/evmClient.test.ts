import { describe, it, expect, vi } from "vitest";
import type { PublicClient } from "viem";
import { makeBscClients, makeBscTestnetClients, withEvmClientsRetry } from "./evmClient";

// Note: these tests do not perform any network calls; they only validate builder/flow logic.

describe("evmClient (BSC) production helpers", () => {
  it("makeBscClients returns at least one client (uses default when no env)", () => {
    const list = makeBscClients();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
  });

  it("makeBscTestnetClients returns at least one client (uses default when no env)", () => {
    const list = makeBscTestnetClients();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
  });

  it("withEvmClientsRetry falls back to next client on error", async () => {
    const okResult = { height: 123n };
    const clients: PublicClient[] = [{} as unknown as PublicClient, {} as unknown as PublicClient];

    const op = vi
      .fn<(c: PublicClient) => Promise<typeof okResult>>()
      .mockRejectedValueOnce(new Error("primary failed"))
      .mockResolvedValueOnce(okResult);

    const res = await withEvmClientsRetry(clients, op, { onError: () => void 0 });

    expect(res).toBe(okResult);
    expect(op).toHaveBeenCalledTimes(2);
  });
});

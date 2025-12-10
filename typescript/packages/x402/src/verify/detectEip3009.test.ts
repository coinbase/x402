import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { Address, Hex, PublicClient } from "viem";
import { supportsEip3009 } from "./detectEip3009";

/**
 * Creates a minimal PublicClient mock exposing only the methods we use.
 *
 * @param overrides - optional partial overrides for the mock
 * @returns a PublicClient-like object with `call` and `chain.id`
 */
function makeClientMock(overrides?: Partial<PublicClient & { chain: { id: number } }>) {
  const base = {
    call: vi.fn(),
    // expose chain id for URL inference
    chain: { id: 56 },
  } as unknown as PublicClient & { chain: { id: number } };
  return Object.assign(base, overrides ?? {});
}

// Keep original fetch to restore
const originalFetch: typeof fetch | undefined = (global as unknown as { fetch?: typeof fetch })
  .fetch;

describe("supportsEip3009", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    if (originalFetch) {
      (global as unknown as { fetch: typeof fetch }).fetch = originalFetch;
    }
  });

  it("returns true when ABI contains transferWithAuthorization (Etherscan path)", async () => {
    const abi = [
      { type: "function", name: "balanceOf", inputs: [{ type: "address", name: "owner" }] },
      {
        type: "function",
        name: "transferWithAuthorization",
        inputs: new Array(9).fill(0).map(() => ({ type: "bytes32", name: "x" })),
      },
    ];

    const mockedFetch: typeof fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: "1", message: "OK", result: JSON.stringify(abi) }), {
          status: 200,
        }),
    ) as unknown as typeof fetch;
    (global as unknown as { fetch: typeof fetch }).fetch = mockedFetch;

    const client = makeClientMock();
    const token = "0x1111111111111111111111111111111111111111" as Address;
    const ok = await supportsEip3009(client, token, {
      etherscanApiUrl: "https://api.bscscan.com/api",
      etherscanApiKey: "test",
    });
    expect(ok).toBe(true);
  });
  it("falls back to eth_call heuristic and returns false when selector not recognized", async () => {
    // Fetch fails or no key -> forces fallback
    const mockedFetch: typeof fetch = vi.fn(
      async () => new Response("", { status: 400 }),
    ) as unknown as typeof fetch;
    (global as unknown as { fetch: typeof fetch }).fetch = mockedFetch;

    type CallError = Error & { shortMessage?: string; data?: Hex };
    const call = vi.fn(async () => {
      const err = new Error("selector was not recognized") as CallError;
      err.shortMessage = "Execution reverted: selector was not recognized";
      throw err;
    });
    const client = makeClientMock({ call });
    const token = "0x2222222222222222222222222222222222222222" as Address;
    const ok = await supportsEip3009(client, token);
    expect(ok).toBe(false);
    expect(call).toHaveBeenCalled();
  });

  it("falls back to eth_call heuristic and returns true when there is meaningful revert data", async () => {
    const mockedFetch: typeof fetch = vi.fn(
      async () => new Response("", { status: 400 }),
    ) as unknown as typeof fetch;
    (global as unknown as { fetch: typeof fetch }).fetch = mockedFetch;

    type CallError = Error & { shortMessage?: string; data?: Hex };
    const call = vi.fn(async () => {
      const err = new Error("Execution reverted with data") as CallError;
      // simulate revert data bytes
      err.data = "0xdeadbeef" as Hex;
      throw err;
    });
    const client = makeClientMock({ call });
    const token = "0x3333333333333333333333333333333333333333" as Address;
    const ok = await supportsEip3009(client, token);
    expect(ok).toBe(true);
  });
});

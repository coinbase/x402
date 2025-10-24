import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Address, PublicClient } from "viem";
import { detectErc20PaymentFlow, buildPullFlowPlan } from "./detectErc20Flow";
import * as eip3009 from "./detectEip3009";

/**
 * Creates a minimal PublicClient mock exposing only the methods used in tests.
 *
 * @param overrides - optional overrides
 * @returns a PublicClient-like object with `readContract` and `chain.id`
 */
function makeClientMock(overrides?: Partial<PublicClient & { chain: { id: number } }>) {
  const base = {
    readContract: vi.fn() as unknown as PublicClient["readContract"],
    chain: { id: 56 },
  } as unknown as PublicClient & { chain: { id: number } };
  return Object.assign(base, overrides ?? {});
}

describe("detectErc20PaymentFlow", () => {
  const token = "0x1111111111111111111111111111111111111111" as Address;
  const owner = "0x2222222222222222222222222222222222222222" as Address;
  const spender = "0x3333333333333333333333333333333333333333" as Address;
  const to = "0x4444444444444444444444444444444444444444" as Address;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("prefers eip3009 when supported", async () => {
    const client = makeClientMock();
    vi.spyOn(eip3009, "supportsEip3009").mockResolvedValue(true);
    const res = await detectErc20PaymentFlow(client, token);
    expect(res.kind).toBe("eip3009");
    expect(res.reason).toBe("HAS_EIP3009");
  });

  it("returns pull when no EIP-3009", async () => {
    const client = makeClientMock();
    vi.spyOn(eip3009, "supportsEip3009").mockResolvedValue(false);
    const res = await detectErc20PaymentFlow(client, token);
    expect(res.kind).toBe("pull");
    expect(res.reason).toBe("NO_EIP3009");
  });

  it("prefers pull when allowance is sufficient and preferPullIfAllowanceSufficient=true", async () => {
    const client = makeClientMock();
    vi.spyOn(client, "readContract").mockResolvedValue(
      1_000_000n as unknown as ReturnType<PublicClient["readContract"]>,
    );
    vi.spyOn(eip3009, "supportsEip3009").mockResolvedValue(true);
    const res = await detectErc20PaymentFlow(client, token, {
      owner,
      spender,
      amountAtomic: 1_000_000n,
      preferPullIfAllowanceSufficient: true,
    });
    expect(res.kind).toBe("pull");
    expect(res.reason).toBe("ALLOWANCE_READY");
    expect(res.suggestedSpender).toBe(spender);
  });

  it("buildPullFlowPlan returns correct calls", () => {
    const plan = buildPullFlowPlan({ token, owner, spender, to, amountAtomic: 123n });
    expect(plan.approve.to).toBe(token);
    expect(plan.approve.function).toBe("approve");
    expect(plan.approve.args).toEqual([spender, 123n]);
    expect(plan.transferFrom.to).toBe(token);
    expect(plan.transferFrom.function).toBe("transferFrom");
    expect(plan.transferFrom.args).toEqual([owner, to, 123n]);
  });
});

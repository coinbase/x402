import { describe, it, expect } from "vitest";
import { verifyNearHeader } from "../src/verify/near";

describe("NEAR verify (skeleton)", () => {
  it("rejects non-x402 prefix", async () => {
    const res = await verifyNearHeader("bad");
    expect(res.ok).toBe(false);
  });

  it("accepts placeholder", async () => {
    const res = await verifyNearHeader("x402:placeholder");
    expect(res.ok).toBe(true);
  });
});

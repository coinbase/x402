import { afterEach, describe, expect, it, vi } from "vitest";
import { HTTPFacilitatorClient } from "../../../src/http/httpFacilitatorClient";
import { FacilitatorResponseError, SettleError, VerifyError } from "../../../src/types";
import { PaymentPayload, PaymentRequirements } from "../../../src/types/payments";

const paymentRequirements: PaymentRequirements = {
  scheme: "exact",
  network: "eip155:8453",
  asset: "0x0000000000000000000000000000000000000000",
  amount: "1000000",
  payTo: "0x1234567890123456789012345678901234567890",
  maxTimeoutSeconds: 300,
  extra: {},
};

const paymentPayload: PaymentPayload = {
  x402Version: 2,
  accepted: paymentRequirements,
  payload: { signature: "0xmock" },
};

describe("HTTPFacilitatorClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("throws FacilitatorResponseError for invalid verify JSON on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })));

    const client = new HTTPFacilitatorClient({ url: "https://facilitator.test" });
    const error = await client
      .verify(paymentPayload, paymentRequirements)
      .catch(caught => caught as Error);

    expect(error).toBeInstanceOf(FacilitatorResponseError);
    expect(error.message).toContain("Facilitator verify returned invalid JSON");
  });

  it("throws FacilitatorResponseError for invalid settle data on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 })),
    );

    const client = new HTTPFacilitatorClient({ url: "https://facilitator.test" });
    const error = await client
      .settle(paymentPayload, paymentRequirements)
      .catch(caught => caught as Error);

    expect(error).toBeInstanceOf(FacilitatorResponseError);
    expect(error.message).toContain("Facilitator settle returned invalid data");
  });

  it("throws FacilitatorResponseError for invalid supported data on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ kinds: [{ scheme: "exact" }] }), { status: 200 }),
        ),
    );

    const client = new HTTPFacilitatorClient({ url: "https://facilitator.test" });
    const error = await client.getSupported().catch(caught => caught as Error);

    expect(error).toBeInstanceOf(FacilitatorResponseError);
    expect(error.message).toContain("Facilitator supported returned invalid data");
  });

  it("preserves VerifyError semantics for valid non-200 verify responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            isValid: false,
            invalidReason: "invalid_signature",
            invalidMessage: "signature mismatch",
          }),
          { status: 400 },
        ),
      ),
    );

    const client = new HTTPFacilitatorClient({ url: "https://facilitator.test" });

    await expect(client.verify(paymentPayload, paymentRequirements)).rejects.toThrow(VerifyError);
  });

  it("preserves SettleError semantics for valid non-200 settle responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            errorReason: "insufficient_allowance",
            transaction: "",
            network: "eip155:8453",
          }),
          { status: 400 },
        ),
      ),
    );

    const client = new HTTPFacilitatorClient({ url: "https://facilitator.test" });

    await expect(client.settle(paymentPayload, paymentRequirements)).rejects.toThrow(SettleError);
  });
});

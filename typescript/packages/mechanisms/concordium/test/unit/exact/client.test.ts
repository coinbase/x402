import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExactConcordiumScheme } from "../../../src";
import { PaymentRequirements } from "@x402/core/types";

describe("ExactConcordiumScheme (Client)", () => {
  let scheme: ExactConcordiumScheme;
  let mockCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockCallback = vi.fn().mockResolvedValue({
      txHash: "abc123",
      sender: "3kBx2h5Y2veb4hZvAE2c1Zr6DYJwWbPr9xQJJBPWyFnXHF9UuN",
      blockHash: "block456",
    });

    scheme = new ExactConcordiumScheme({
      createAndBroadcastTransaction: mockCallback,
    });
  });

  describe("scheme property", () => {
    it("should be 'exact'", () => {
      expect(scheme.scheme).toBe("exact");
    });
  });

  describe("createPaymentPayload", () => {
    const requirements: PaymentRequirements = {
      scheme: "exact",
      network: "ccd:4221332d34e1694168c2a0c0b3fd0f27",
      amount: "1000000",
      asset: "",
      payTo: "4FmiTW2L4RvCsSVTjFAavYvrgnPLGNj43eiwPYmbhNqtAcMbWW",
      maxTimeoutSeconds: 300,
      extra: {},
    };

    it("should return payload with txHash and sender", async () => {
      const result = await scheme.createPaymentPayload(2, requirements);

      expect(result.x402Version).toBe(2);
      expect(result.payload.txHash).toBe("abc123");
      expect(result.payload.sender).toBe("3kBx2h5Y2veb4hZvAE2c1Zr6DYJwWbPr9xQJJBPWyFnXHF9UuN");
      expect(result.payload.blockHash).toBe("block456");
    });

    it("should call callback with payTo, amount, asset", async () => {
      await scheme.createPaymentPayload(2, requirements);

      expect(mockCallback).toHaveBeenCalledWith(
        "4FmiTW2L4RvCsSVTjFAavYvrgnPLGNj43eiwPYmbhNqtAcMbWW",
        "1000000",
        "",
      );
    });

    it("should pass CIS-2 asset string to callback", async () => {
      const cis2Requirements = {
        ...requirements,
        asset: "EURR",
      };

      await scheme.createPaymentPayload(2, cis2Requirements);

      expect(mockCallback).toHaveBeenCalledWith(requirements.payTo, requirements.amount, "EURR");
    });

    it("should propagate callback errors", async () => {
      mockCallback.mockRejectedValue(new Error("User rejected"));

      await expect(scheme.createPaymentPayload(2, requirements)).rejects.toThrow("User rejected");
    });
  });
});

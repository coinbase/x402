import { describe, it, expect, vi } from "vitest";
import { x402Facilitator } from "../../../src/facilitator/x402Facilitator";
import {
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
} from "../../../src/types";
import { SchemeNetworkFacilitator } from "../../../src/types/mechanisms";

// Mock scheme facilitator
class MockSchemeFacilitator implements SchemeNetworkFacilitator {
  readonly scheme = "exact";

  constructor(
    private verifyFn?: (
      payload: PaymentPayload,
      requirements: PaymentRequirements,
    ) => Promise<VerifyResponse>,
    private settleFn?: (
      payload: PaymentPayload,
      requirements: PaymentRequirements,
    ) => Promise<SettleResponse>,
  ) {}

  getExtra(_: string): Record<string, unknown> | undefined {
    return undefined;
  }

  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    if (this.verifyFn) {
      return this.verifyFn(payload, requirements);
    }
    return { isValid: true, payer: "0xMockPayer" };
  }

  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    if (this.settleFn) {
      return this.settleFn(payload, requirements);
    }
    return { success: true, transaction: "0xMockTx", network: requirements.network };
  }
}

const buildPaymentPayload = (): PaymentPayload => ({
  x402Version: 2,
  payload: {},
  accepted: {
    scheme: "exact",
    network: "eip155:8453",
    asset: "0xUSDC",
    amount: "1000000",
    payTo: "0xRecipient",
    maxTimeoutSeconds: 300,
    extra: {},
  },
  resource: {
    url: "https://example.com/resource",
    description: "Test resource",
    mimeType: "application/json",
  },
});

const buildPaymentRequirements = (): PaymentRequirements => ({
  scheme: "exact",
  network: "eip155:8453",
  asset: "0xUSDC",
  amount: "1000000",
  payTo: "0xRecipient",
  maxTimeoutSeconds: 300,
  extra: {},
});

describe("x402Facilitator - Hook Error Isolation", () => {
  describe("beforeVerify error isolation", () => {
    it("should catch and isolate errors from beforeVerify hooks", async () => {
      const facilitator = new x402Facilitator();
      facilitator.register("eip155:8453", new MockSchemeFacilitator());

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      facilitator.onBeforeVerify(async () => {
        throw new Error("beforeVerify hook crashed");
      });

      const result = await facilitator.verify(buildPaymentPayload(), buildPaymentRequirements());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("before_verify_hook_error");
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should still allow abort to work after error isolation", async () => {
      const facilitator = new x402Facilitator();
      facilitator.register("eip155:8453", new MockSchemeFacilitator());

      facilitator.onBeforeVerify(async () => {
        return { abort: true, reason: "Blocked by policy" };
      });

      const result = await facilitator.verify(buildPaymentPayload(), buildPaymentRequirements());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("Blocked by policy");
    });
  });

  describe("afterVerify error isolation", () => {
    it("should return successful result even if afterVerify hook throws", async () => {
      const facilitator = new x402Facilitator();
      facilitator.register("eip155:8453", new MockSchemeFacilitator());

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      facilitator.onAfterVerify(async () => {
        throw new Error("afterVerify hook crashed");
      });

      const result = await facilitator.verify(buildPaymentPayload(), buildPaymentRequirements());

      expect(result.isValid).toBe(true);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should continue executing remaining afterVerify hooks after one throws", async () => {
      const facilitator = new x402Facilitator();
      facilitator.register("eip155:8453", new MockSchemeFacilitator());

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      let secondHookCalled = false;

      facilitator
        .onAfterVerify(async () => {
          throw new Error("First hook throws");
        })
        .onAfterVerify(async () => {
          secondHookCalled = true;
        });

      const result = await facilitator.verify(buildPaymentPayload(), buildPaymentRequirements());

      expect(result.isValid).toBe(true);
      expect(secondHookCalled).toBe(true);

      consoleSpy.mockRestore();
    });
  });

  describe("onVerifyFailure error isolation", () => {
    it("should propagate original error even if onVerifyFailure hook throws", async () => {
      const facilitator = new x402Facilitator();

      const mockScheme = new MockSchemeFacilitator(async () => {
        throw new Error("Original verification error");
      });
      facilitator.register("eip155:8453", mockScheme);

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      facilitator.onVerifyFailure(async () => {
        throw new Error("Failure hook also crashed");
      });

      await expect(
        facilitator.verify(buildPaymentPayload(), buildPaymentRequirements()),
      ).rejects.toThrow("Original verification error");

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should still allow recovery even with error isolation", async () => {
      const facilitator = new x402Facilitator();

      const mockScheme = new MockSchemeFacilitator(async () => {
        throw new Error("Verification failed");
      });
      facilitator.register("eip155:8453", mockScheme);

      facilitator.onVerifyFailure(async () => {
        return {
          recovered: true,
          result: { isValid: true, payer: "0xRecovered" },
        };
      });

      const result = await facilitator.verify(buildPaymentPayload(), buildPaymentRequirements());

      expect(result.isValid).toBe(true);
      expect(result.payer).toBe("0xRecovered");
    });

    it("should try subsequent failure hooks if first one throws", async () => {
      const facilitator = new x402Facilitator();

      const mockScheme = new MockSchemeFacilitator(async () => {
        throw new Error("Verification failed");
      });
      facilitator.register("eip155:8453", mockScheme);

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      facilitator
        .onVerifyFailure(async () => {
          throw new Error("First failure hook crashes");
        })
        .onVerifyFailure(async () => {
          return {
            recovered: true,
            result: { isValid: true, payer: "0xRecoveredBySecondHook" },
          };
        });

      const result = await facilitator.verify(buildPaymentPayload(), buildPaymentRequirements());

      expect(result.isValid).toBe(true);
      expect(result.payer).toBe("0xRecoveredBySecondHook");

      consoleSpy.mockRestore();
    });

    it("should isolate errors in onVerifyFailure for isValid:false path", async () => {
      const facilitator = new x402Facilitator();

      const mockScheme = new MockSchemeFacilitator(async () => {
        return { isValid: false, invalidReason: "Payment expired" };
      });
      facilitator.register("eip155:8453", mockScheme);

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      facilitator.onVerifyFailure(async () => {
        throw new Error("Failure hook crashed on isValid:false");
      });

      const result = await facilitator.verify(buildPaymentPayload(), buildPaymentRequirements());

      // Should still return the original failed result, not crash
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("Payment expired");

      consoleSpy.mockRestore();
    });
  });

  describe("beforeSettle error isolation", () => {
    it("should catch and wrap errors from beforeSettle hooks", async () => {
      const facilitator = new x402Facilitator();
      facilitator.register("eip155:8453", new MockSchemeFacilitator());

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      facilitator.onBeforeSettle(async () => {
        throw new Error("beforeSettle hook crashed");
      });

      await expect(
        facilitator.settle(buildPaymentPayload(), buildPaymentRequirements()),
      ).rejects.toThrow("before_settle_hook_error");

      consoleSpy.mockRestore();
    });

    it("should re-throw abort errors as-is", async () => {
      const facilitator = new x402Facilitator();
      facilitator.register("eip155:8453", new MockSchemeFacilitator());

      facilitator.onBeforeSettle(async () => {
        return { abort: true, reason: "Gas too high" };
      });

      await expect(
        facilitator.settle(buildPaymentPayload(), buildPaymentRequirements()),
      ).rejects.toThrow("Settlement aborted: Gas too high");
    });
  });

  describe("afterSettle error isolation", () => {
    it("should return successful settlement even if afterSettle hook throws", async () => {
      const facilitator = new x402Facilitator();
      facilitator.register("eip155:8453", new MockSchemeFacilitator());

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      facilitator.onAfterSettle(async () => {
        throw new Error("afterSettle hook crashed (e.g. external API call failed)");
      });

      const result = await facilitator.settle(buildPaymentPayload(), buildPaymentRequirements());

      // Settlement succeeded on-chain — result must be returned despite hook error
      expect(result.success).toBe(true);
      expect(result.transaction).toBe("0xMockTx");
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should continue executing remaining afterSettle hooks after one throws", async () => {
      const facilitator = new x402Facilitator();
      facilitator.register("eip155:8453", new MockSchemeFacilitator());

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      let secondHookCalled = false;

      facilitator
        .onAfterSettle(async () => {
          throw new Error("First afterSettle hook throws");
        })
        .onAfterSettle(async () => {
          secondHookCalled = true;
        });

      const result = await facilitator.settle(buildPaymentPayload(), buildPaymentRequirements());

      expect(result.success).toBe(true);
      expect(secondHookCalled).toBe(true);

      consoleSpy.mockRestore();
    });
  });

  describe("onSettleFailure error isolation", () => {
    it("should propagate original error even if onSettleFailure hook throws", async () => {
      const facilitator = new x402Facilitator();

      const mockScheme = new MockSchemeFacilitator(undefined, async () => {
        throw new Error("Original settlement error");
      });
      facilitator.register("eip155:8453", mockScheme);

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      facilitator.onSettleFailure(async () => {
        throw new Error("Failure hook also crashed");
      });

      await expect(
        facilitator.settle(buildPaymentPayload(), buildPaymentRequirements()),
      ).rejects.toThrow("Original settlement error");

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should still allow recovery even with error isolation", async () => {
      const facilitator = new x402Facilitator();

      const mockScheme = new MockSchemeFacilitator(undefined, async () => {
        throw new Error("Settlement failed");
      });
      facilitator.register("eip155:8453", mockScheme);

      facilitator.onSettleFailure(async () => {
        return {
          recovered: true,
          result: {
            success: true,
            transaction: "0xRecoveredTx",
            network: "eip155:8453",
          },
        };
      });

      const result = await facilitator.settle(buildPaymentPayload(), buildPaymentRequirements());

      expect(result.success).toBe(true);
      expect(result.transaction).toBe("0xRecoveredTx");
    });

    it("should try subsequent failure hooks if first one throws", async () => {
      const facilitator = new x402Facilitator();

      const mockScheme = new MockSchemeFacilitator(undefined, async () => {
        throw new Error("Settlement failed");
      });
      facilitator.register("eip155:8453", mockScheme);

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      facilitator
        .onSettleFailure(async () => {
          throw new Error("First failure hook crashes");
        })
        .onSettleFailure(async () => {
          return {
            recovered: true,
            result: {
              success: true,
              transaction: "0xRecoveredBySecondHook",
              network: "eip155:8453",
            },
          };
        });

      const result = await facilitator.settle(buildPaymentPayload(), buildPaymentRequirements());

      expect(result.success).toBe(true);
      expect(result.transaction).toBe("0xRecoveredBySecondHook");

      consoleSpy.mockRestore();
    });
  });
});

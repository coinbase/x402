import { describe, it, expect } from "vitest";
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
  scheme: "exact",
  network: "eip155:8453",
  payload: {},
  accepted: {
    scheme: "exact",
    network: "eip155:8453",
    asset: "0xUSDC",
    amount: "1000000",
    payTo: "0xRecipient",
    maxTimeoutSeconds: 300,
  },
});

const buildPaymentRequirements = (): PaymentRequirements => ({
  scheme: "exact",
  network: "eip155:8453",
  asset: "0xUSDC",
  amount: "1000000",
  payTo: "0xRecipient",
  maxTimeoutSeconds: 300,
});

describe("x402Facilitator - Lifecycle Hooks", () => {
  describe("onBeforeVerify", () => {
    it("should execute hook before verification", async () => {
      const facilitator = new x402Facilitator();
      facilitator.registerScheme("eip155:8453", new MockSchemeFacilitator());

      let hookCalled = false;
      facilitator.onBeforeVerify(async context => {
        hookCalled = true;
        expect(context.paymentPayload).toBeDefined();
        expect(context.requirements).toBeDefined();
      });

      await facilitator.verify(buildPaymentPayload(), buildPaymentRequirements());
      expect(hookCalled).toBe(true);
    });

    it("should abort verification when hook returns abort", async () => {
      const facilitator = new x402Facilitator();
      facilitator.registerScheme("eip155:8453", new MockSchemeFacilitator());

      facilitator.onBeforeVerify(async () => {
        return { abort: true, reason: "Facilitator security check failed" };
      });

      const result = await facilitator.verify(buildPaymentPayload(), buildPaymentRequirements());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("Facilitator security check failed");
    });

    it("should execute multiple hooks in order", async () => {
      const facilitator = new x402Facilitator();
      facilitator.registerScheme("eip155:8453", new MockSchemeFacilitator());

      const executionOrder: number[] = [];

      facilitator
        .onBeforeVerify(async () => {
          executionOrder.push(1);
        })
        .onBeforeVerify(async () => {
          executionOrder.push(2);
        })
        .onBeforeVerify(async () => {
          executionOrder.push(3);
        });

      await facilitator.verify(buildPaymentPayload(), buildPaymentRequirements());
      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it("should stop on first abort", async () => {
      const facilitator = new x402Facilitator();
      facilitator.registerScheme("eip155:8453", new MockSchemeFacilitator());

      const executionOrder: number[] = [];

      facilitator
        .onBeforeVerify(async () => {
          executionOrder.push(1);
        })
        .onBeforeVerify(async () => {
          executionOrder.push(2);
          return { abort: true, reason: "Aborted" };
        })
        .onBeforeVerify(async () => {
          executionOrder.push(3); // Should not execute
        });

      await facilitator.verify(buildPaymentPayload(), buildPaymentRequirements());
      expect(executionOrder).toEqual([1, 2]);
    });

    it("should pass metadata to hook", async () => {
      const facilitator = new x402Facilitator();
      facilitator.registerScheme("eip155:8453", new MockSchemeFacilitator());

      let capturedMetadata: Record<string, unknown> | undefined;

      facilitator.onBeforeVerify(async context => {
        capturedMetadata = context.requestMetadata;
      });

      const metadata = { facilitatorId: "test-123", region: "us-west" };
      await facilitator.verify(buildPaymentPayload(), buildPaymentRequirements(), metadata);

      expect(capturedMetadata).toEqual(metadata);
    });
  });

  describe("onAfterVerify", () => {
    it("should execute hook after successful verification", async () => {
      const facilitator = new x402Facilitator();
      facilitator.registerScheme("eip155:8453", new MockSchemeFacilitator());

      let capturedResult: VerifyResponse | undefined;
      let capturedDuration: number | undefined;

      facilitator.onAfterVerify(async context => {
        capturedResult = context.result;
        capturedDuration = context.duration;
      });

      const result = await facilitator.verify(buildPaymentPayload(), buildPaymentRequirements());

      expect(result.isValid).toBe(true);
      expect(capturedResult?.isValid).toBe(true);
      expect(capturedDuration).toBeGreaterThanOrEqual(0);
    });

    it("should execute multiple hooks in order", async () => {
      const facilitator = new x402Facilitator();
      facilitator.registerScheme("eip155:8453", new MockSchemeFacilitator());

      const executionOrder: number[] = [];

      facilitator
        .onAfterVerify(async () => {
          executionOrder.push(1);
        })
        .onAfterVerify(async () => {
          executionOrder.push(2);
        });

      await facilitator.verify(buildPaymentPayload(), buildPaymentRequirements());
      expect(executionOrder).toEqual([1, 2]);
    });
  });

  describe("onVerifyFailure", () => {
    it("should execute hook when verification fails", async () => {
      const facilitator = new x402Facilitator();

      const mockScheme = new MockSchemeFacilitator(async () => {
        throw new Error("Verification failed");
      });
      facilitator.registerScheme("eip155:8453", mockScheme);

      let hookCalled = false;
      let capturedError: Error | undefined;

      facilitator.onVerifyFailure(async context => {
        hookCalled = true;
        capturedError = context.error;
      });

      await expect(
        facilitator.verify(buildPaymentPayload(), buildPaymentRequirements()),
      ).rejects.toThrow("Verification failed");

      expect(hookCalled).toBe(true);
      expect(capturedError?.message).toBe("Verification failed");
    });

    it("should recover from failure when hook returns recovered", async () => {
      const facilitator = new x402Facilitator();

      const mockScheme = new MockSchemeFacilitator(async () => {
        throw new Error("Verification failed");
      });
      facilitator.registerScheme("eip155:8453", mockScheme);

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
  });

  describe("onBeforeSettle", () => {
    it("should abort settlement when hook returns abort", async () => {
      const facilitator = new x402Facilitator();
      facilitator.registerScheme("eip155:8453", new MockSchemeFacilitator());

      facilitator.onBeforeSettle(async () => {
        return { abort: true, reason: "Gas price too high" };
      });

      await expect(
        facilitator.settle(buildPaymentPayload(), buildPaymentRequirements()),
      ).rejects.toThrow("Settlement aborted: Gas price too high");
    });
  });

  describe("onAfterSettle", () => {
    it("should execute hook after successful settlement", async () => {
      const facilitator = new x402Facilitator();
      facilitator.registerScheme("eip155:8453", new MockSchemeFacilitator());

      let capturedTx: string | undefined;

      facilitator.onAfterSettle(async context => {
        capturedTx = context.result.transaction;
      });

      const result = await facilitator.settle(buildPaymentPayload(), buildPaymentRequirements());

      expect(result.success).toBe(true);
      expect(capturedTx).toBe("0xMockTx");
    });
  });

  describe("onSettleFailure", () => {
    it("should execute hook when settlement fails", async () => {
      const facilitator = new x402Facilitator();

      const mockScheme = new MockSchemeFacilitator(undefined, async () => {
        throw new Error("Settlement failed");
      });
      facilitator.registerScheme("eip155:8453", mockScheme);

      let hookCalled = false;

      facilitator.onSettleFailure(async () => {
        hookCalled = true;
      });

      await expect(
        facilitator.settle(buildPaymentPayload(), buildPaymentRequirements()),
      ).rejects.toThrow("Settlement failed");

      expect(hookCalled).toBe(true);
    });

    it("should recover from failure when hook returns recovered", async () => {
      const facilitator = new x402Facilitator();

      const mockScheme = new MockSchemeFacilitator(undefined, async () => {
        throw new Error("Settlement failed");
      });
      facilitator.registerScheme("eip155:8453", mockScheme);

      facilitator.onSettleFailure(async () => {
        return {
          recovered: true,
          result: {
            success: true,
            transaction: "0xFacilitatorRecovered",
            network: "eip155:8453",
          },
        };
      });

      const result = await facilitator.settle(buildPaymentPayload(), buildPaymentRequirements());

      expect(result.success).toBe(true);
      expect(result.transaction).toBe("0xFacilitatorRecovered");
    });
  });

  describe("Hook chainability", () => {
    it("should allow chaining all hook registrations", () => {
      const facilitator = new x402Facilitator();

      const result = facilitator
        .onBeforeVerify(async () => {})
        .onAfterVerify(async () => {})
        .onVerifyFailure(async () => {})
        .onBeforeSettle(async () => {})
        .onAfterSettle(async () => {})
        .onSettleFailure(async () => {});

      expect(result).toBe(facilitator);
    });
  });
});

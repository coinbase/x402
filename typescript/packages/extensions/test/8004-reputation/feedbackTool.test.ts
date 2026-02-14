import { describe, it, expect } from "vitest";
import { createFeedbackFile } from "../../src/8004-reputation/feedbackTool";
import { type SettleResponse } from "@x402/core/types";

describe("Feedback Tool", () => {
  const mockSettle: SettleResponse = {
    success: true,
    transaction: "0xPaymentTxHash",
    network: "eip155:8453",
    payer: "0xPayerAddress",
  };

  const mockServerReputation = {
    identity: {
      agentRegistry: "eip155:8453:0xRegistry",
      agentId: "1",
    },
    reputationRegistry: "0xRepRegistry",
    endpoint: "https://api.agent.com",
  };

  it("should create a valid feedback file from a settlement", () => {
    const feedback = createFeedbackFile({
      settleResponse: mockSettle,
      serverReputation: mockServerReputation,
      value: 100,
      tag1: "quality",
    });

    expect(feedback.agentId).toBe("1");
    expect(feedback.participation?.taskRef).toBe("eip155:8453:tx/0xPaymentTxHash");
    expect(feedback.value).toBe(100);
    expect(feedback.tag1).toBe("quality");
    expect(feedback.clientAddress).toBe("0xPayerAddress");
  });

  it("should fail for invalid taskRef format", () => {
    // The regex in feedback.ts expects eip155:1:tx/0x... (alphanumeric hash)
    // Actually the regex is ^[a-z0-9]+:[a-z0-9]+:tx\/[a-zA-Z0-9]+$
    // Our mock transaction has "0xPaymentTxHash" which should pass.
    // Let's try one that doesn't.

    expect(() =>
      createFeedbackFile({
        settleResponse: { ...mockSettle, transaction: "!!!" },
        serverReputation: mockServerReputation,
        value: 100,
      }),
    ).toThrow();
  });
});

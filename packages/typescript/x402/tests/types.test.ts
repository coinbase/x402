import { describe, test, expect } from "vitest";
import { PaymentDetails, paymentDetailsSchema } from "../src/types/index.js";
import { toJsonSafe } from "../src/types/index.js";

describe("types conversion", () => {
  test("PaymentNeededDetails serialization", () => {
    const details: PaymentDetails = {
      scheme: "exact",
      networkId: "1",
      maxAmountRequired: BigInt(1000),
      resource: "https://api.example.com/resource",
      description: "Test resource",
      mimeType: "application/json",
      outputSchema: null,
      payToAddress: "0x123" as `0x${string}`,
      requiredDeadlineSeconds: 30,
      usdcAddress: "0x456" as `0x${string}`,
      extra: null,
    };

    const json = toJsonSafe(details);

    const restored = paymentDetailsSchema.parse(json);
    expect(restored).toEqual(details);
  });
});

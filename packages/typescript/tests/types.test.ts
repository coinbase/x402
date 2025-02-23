import { describe, test, expect } from "vitest";

import { PaymentDetails, PaymentPayload } from "@/shared/types";

import {
  paymentNeededDetailsToJsonSafe,
  paymentNeededDetailsFromObj,
} from "../src/shared/types/convert";

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

    // const jsonObj = paymentNeededDetailsToJsonSafe(details);
    // const jsonString = JSON.stringify(jsonObj);
    // const parsedJson = JSON.parse(jsonString);
    // const restored = paymentNeededDetailsFromObj(parsedJson);
    // expect(restored).toEqual(details);
  });
});

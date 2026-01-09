import {
  SchemeNetworkClient,
  PaymentPayloadResult,
  PaymentCreationContext,
} from "../../../src/types/mechanisms";
import { PaymentRequirements } from "../../../src/types/payments";

/**
 * Mock scheme network client for testing.
 */
export class MockSchemeNetworkClient implements SchemeNetworkClient {
  public readonly scheme: string;
  private payloadResult: PaymentPayloadResult | Error;

  // Call tracking
  public createPaymentPayloadCalls: Array<{
    x402Version: number;
    requirements: PaymentRequirements;
    context?: PaymentCreationContext;
  }> = [];

  /**
   *
   * @param scheme
   * @param payloadResult
   */
  constructor(scheme: string, payloadResult?: PaymentPayloadResult | Error) {
    this.scheme = scheme;
    this.payloadResult = payloadResult || {
      x402Version: 2,
      payload: { signature: "mock_signature", from: "mock_address" },
    };
  }

  /**
   *
   * @param x402Version
   * @param paymentRequirements
   * @param context
   */
  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
    context?: PaymentCreationContext,
  ): Promise<PaymentPayloadResult> {
    this.createPaymentPayloadCalls.push({
      x402Version,
      requirements: paymentRequirements,
      context,
    });

    if (this.payloadResult instanceof Error) {
      throw this.payloadResult;
    }
    return this.payloadResult;
  }

  // Helper methods for test configuration
  /**
   *
   * @param result
   */
  setPayloadResult(result: PaymentPayloadResult | Error): void {
    this.payloadResult = result;
  }

  /**
   *
   */
  reset(): void {
    this.createPaymentPayloadCalls = [];
  }
}

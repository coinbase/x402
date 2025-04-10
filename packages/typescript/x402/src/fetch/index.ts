import { Money, paymentDetailsSchema } from "../types";
import { evm } from "../shared";
import { createPaymentHeader } from "../client";

export function fetchWithPayment(
  fetch: typeof globalThis.fetch,
  walletClient: evm.wallet.SignerWallet,
  maxValue: bigint = BigInt(0.1 * 10 ** 6), // Default to 0.10 USDC
) {
  return async (input: RequestInfo, init?: RequestInit) => {
    const response = await fetch(input, init);

    if (response.status !== 402) {
      return response;
    }

    try {
      const data = await response.json();
      const paymentDetails = data.paymentDetails;
      const parsed = paymentDetailsSchema.parse(paymentDetails);
      if (parsed.maxAmountRequired > maxValue) {
        throw new Error("Payment amount exceeds maximum allowed");
      }

      const paymentHeader = await createPaymentHeader(walletClient, parsed);

      if (!init) {
        throw new Error("Missing fetch request configuration");
      }

      if ((init as any).__is402Retry) {
        throw new Error("Payment already attempted");
      }

      const newInit = {
        ...init,
        headers: {
          ...(init.headers || {}),
          "X-PAYMENT": paymentHeader,
          "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
        },
        __is402Retry: true,
      };

      const secondResponse = await fetch(input, newInit);
      return secondResponse;
    } catch (paymentError) {
      throw paymentError;
    }
  };
}

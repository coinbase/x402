import { x402Client, x402ClientConfig, x402HTTPClient } from "@x402/core/client";
import { type PaymentRequired } from "@x402/core/types";

/**
 * Enables the payment of APIs using the x402 payment protocol v2.
 *
 * This function wraps the native fetch API to automatically handle 402 Payment Required responses
 * by creating and sending payment headers. It will:
 * 1. Make the initial request
 * 2. If a 402 response is received, parse the payment requirements
 * 3. Create a payment header using the configured x402HTTPClient
 * 4. Retry the request with the payment header
 *
 * @param fetch - The fetch function to wrap (typically globalThis.fetch)
 * @param client - Configured x402Client or x402HTTPClient instance for handling payments
 * @returns A wrapped fetch function that handles 402 responses automatically
 *
 * @example
 * ```typescript
 * import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
 * import { ExactEvmScheme } from '@x402/evm';
 * import { ExactSvmScheme } from '@x402/svm';
 *
 * const client = new x402Client()
 *   .register('eip155:8453', new ExactEvmScheme(evmSigner))
 *   .register('solana:mainnet', new ExactSvmScheme(svmSigner))
 *   .register('eip155:1', new ExactEvmScheme(evmSigner), 1); // v1 protocol
 *
 * const fetchWithPay = wrapFetchWithPayment(fetch, client);
 *
 * // Make a request that may require payment
 * const response = await fetchWithPay('https://api.example.com/paid-endpoint');
 * ```
 *
 * @throws {Error} If no schemes are provided
 * @throws {Error} If the request configuration is missing
 * @throws {Error} If a payment has already been attempted for this request
 * @throws {Error} If there's an error creating the payment header
 */
export function wrapFetchWithPayment(
  fetch: typeof globalThis.fetch,
  client: x402Client | x402HTTPClient,
) {
  const httpClient = client instanceof x402HTTPClient ? client : new x402HTTPClient(client);

  return async (input: RequestInfo, init?: RequestInit) => {
    const response = await fetch(input, init);

    if (response.status !== 402) {
      return response;
    }

    // Parse payment requirements from response
    let paymentRequired: PaymentRequired;
    try {
      // Create getHeader function for case-insensitive header lookup
      const getHeader = (name: string) => response.headers.get(name);

      // Try to get from headers first (v2), then from body (v1)
      let body: PaymentRequired | undefined;
      try {
        const responseText = await response.text();
        if (responseText) {
          body = JSON.parse(responseText) as PaymentRequired;
        }
      } catch {
        // Ignore JSON parse errors - might be header-only response
      }

      paymentRequired = httpClient.getPaymentRequiredResponse(getHeader, body);
    } catch (error) {
      throw new Error(
        `Failed to parse payment requirements: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    // Create payment payload (copy extensions from PaymentRequired)
    let paymentPayload;
    try {
      paymentPayload = await client.createPaymentPayload(paymentRequired);
    } catch (error) {
      throw new Error(
        `Failed to create payment payload: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    // Encode payment header
    const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

    // Ensure we have request init
    if (!init) {
      throw new Error("Missing fetch request configuration");
    }

    // Check if this is already a retry to prevent infinite loops
    if ((init as { __is402Retry?: boolean }).__is402Retry) {
      throw new Error("Payment already attempted");
    }

    // Create new request with payment header
    const newInit = {
      ...init,
      headers: {
        ...(init.headers || {}),
        ...paymentHeaders,
        "Access-Control-Expose-Headers": "PAYMENT-RESPONSE,X-PAYMENT-RESPONSE",
      },
      __is402Retry: true,
    };

    // Retry the request with payment
    const secondResponse = await fetch(input, newInit);
    return secondResponse;
  };
}

/**
 * Creates a payment-enabled fetch function from a configuration object.
 *
 * @param fetch - The fetch function to wrap (typically globalThis.fetch)
 * @param config - Configuration options including scheme registrations and selectors
 * @returns A wrapped fetch function that handles 402 responses automatically
 */
export function wrapFetchWithPaymentFromConfig(
  fetch: typeof globalThis.fetch,
  config: x402ClientConfig,
) {
  const client = x402Client.fromConfig(config);
  return wrapFetchWithPayment(fetch, client);
}

// Re-export types and utilities for convenience
export { x402Client, x402HTTPClient } from "@x402/core/client";
export type {
  PaymentPolicy,
  SchemeRegistration,
  SelectPaymentRequirements,
  x402ClientConfig,
} from "@x402/core/client";
export { decodePaymentResponseHeader } from "@x402/core/http";
export type {
  Network,
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  SchemeNetworkClient,
} from "@x402/core/types";

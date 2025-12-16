import { x402Client, x402ClientConfig, x402HTTPClient } from "@x402/core/client";
import { type PaymentRequired } from "@x402/core/types";
import type { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from "axios";

/**
 * Wraps an Axios instance with x402 payment handling.
 *
 * This function adds an interceptor to automatically handle 402 Payment Required responses
 * by creating and sending payment headers. It will:
 * 1. Intercept 402 responses
 * 2. Parse the payment requirements
 * 3. Create a payment header using the configured x402HTTPClient
 * 4. Retry the request with the payment header
 *
 * @param axiosInstance - The Axios instance to wrap
 * @param client - Configured x402Client instance for handling payments
 * @returns The wrapped Axios instance that handles 402 responses automatically
 *
 * @example
 * ```typescript
 * import axios from 'axios';
 * import { wrapAxiosWithPayment, x402Client } from '@x402/axios';
 * import { ExactEvmScheme } from '@x402/evm';
 * import { privateKeyToAccount } from 'viem/accounts';
 *
 * const account = privateKeyToAccount('0x...');
 * const client = new x402Client()
 *   .register('eip155:*', new ExactEvmScheme(account));
 *
 * const api = wrapAxiosWithPayment(axios.create(), client);
 *
 * // Make a request that may require payment
 * const response = await api.get('https://api.example.com/paid-endpoint');
 * ```
 *
 * @throws {Error} If no schemes are provided
 * @throws {Error} If the request configuration is missing
 * @throws {Error} If a payment has already been attempted for this request
 * @throws {Error} If there's an error creating the payment header
 */
export function wrapAxiosWithPayment(
  axiosInstance: AxiosInstance,
  client: x402Client,
): AxiosInstance {
  const httpClient = new x402HTTPClient(client);

  axiosInstance.interceptors.response.use(
    response => response,
    async (error: AxiosError) => {
      if (!error.response || error.response.status !== 402) {
        return Promise.reject(error);
      }

      const originalConfig = error.config;
      if (!originalConfig || !originalConfig.headers) {
        return Promise.reject(new Error("Missing axios request configuration"));
      }

      // Check if this is already a retry to prevent infinite loops
      if (
        (originalConfig as InternalAxiosRequestConfig & { __is402Retry?: boolean }).__is402Retry
      ) {
        return Promise.reject(error);
      }

      try {
        // Parse payment requirements from response
        let paymentRequired: PaymentRequired;
        try {
          const response = error.response!; // Already validated above

          // Create getHeader function for case-insensitive header lookup
          const getHeader = (name: string) => {
            const value = response.headers[name] ?? response.headers[name.toLowerCase()];
            return typeof value === "string" ? value : undefined;
          };

          // Try to get from headers first (v2), then from body (v1)
          const body = response.data as PaymentRequired | undefined;

          paymentRequired = httpClient.getPaymentRequiredResponse(getHeader, body);
        } catch (parseError) {
          return Promise.reject(
            new Error(
              `Failed to parse payment requirements: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
            ),
          );
        }

        // Create payment payload
        let paymentPayload;
        try {
          paymentPayload = await client.createPaymentPayload(paymentRequired);
        } catch (paymentError) {
          return Promise.reject(
            new Error(
              `Failed to create payment payload: ${paymentError instanceof Error ? paymentError.message : "Unknown error"}`,
            ),
          );
        }

        // Encode payment header
        const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

        // Mark this as a retry
        (originalConfig as InternalAxiosRequestConfig & { __is402Retry?: boolean }).__is402Retry =
          true;

        // Add payment headers to the request
        Object.entries(paymentHeaders).forEach(([key, value]) => {
          originalConfig.headers.set(key, value);
        });

        // Add CORS header to expose payment response
        originalConfig.headers.set(
          "Access-Control-Expose-Headers",
          "PAYMENT-RESPONSE,X-PAYMENT-RESPONSE",
        );

        // Retry the request with payment
        const secondResponse = await axiosInstance.request(originalConfig);
        return secondResponse;
      } catch (retryError) {
        return Promise.reject(retryError);
      }
    },
  );

  return axiosInstance;
}

/**
 * Wraps an Axios instance with x402 payment handling using a configuration object.
 *
 * @param axiosInstance - The Axios instance to wrap
 * @param config - Configuration options including scheme registrations and selectors
 * @returns The wrapped Axios instance that handles 402 responses automatically
 *
 * @example
 * ```typescript
 * import axios from 'axios';
 * import { wrapAxiosWithPaymentFromConfig } from '@x402/axios';
 * import { ExactEvmScheme } from '@x402/evm';
 * import { privateKeyToAccount } from 'viem/accounts';
 *
 * const account = privateKeyToAccount('0x...');
 *
 * const api = wrapAxiosWithPaymentFromConfig(axios.create(), {
 *   schemes: [
 *     { network: 'eip155:*', client: new ExactEvmScheme(account) }
 *   ]
 * });
 *
 * const response = await api.get('https://api.example.com/paid-endpoint');
 * ```
 */
export function wrapAxiosWithPaymentFromConfig(
  axiosInstance: AxiosInstance,
  config: x402ClientConfig,
): AxiosInstance {
  const client = x402Client.fromConfig(config);
  return wrapAxiosWithPayment(axiosInstance, client);
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

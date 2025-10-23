import { x402HTTPClient, type SelectPaymentRequirements } from "@x402/core/client";
import { type PaymentRequired, type Network } from "@x402/core/types";
import { type SchemeNetworkClient } from "@x402/core/types";

/**
 * Configuration for registering a payment scheme with a specific network
 */
export interface SchemeRegistration {
  /**
   * The network identifier (e.g., 'eip155:8453', 'solana:mainnet')
   */
  network: Network;

  /**
   * The scheme client implementation for this network
   */
  client: SchemeNetworkClient;

  /**
   * The x402 protocol version to use for this scheme
   * @default 2
   */
  x402Version?: number;
}

/**
 * Configuration options for the fetch wrapper
 */
export interface FetchWrapperConfig {
  /**
   * Array of scheme registrations defining which payment methods are supported
   */
  schemes: SchemeRegistration[];

  /**
   * Custom payment requirements selector function
   * If not provided, uses the default selector (first available option)
   */
  paymentRequirementsSelector?: SelectPaymentRequirements;
}

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
 * @param config - Configuration options including scheme registrations and selectors
 * @returns A wrapped fetch function that handles 402 responses automatically
 *
 * @example
 * ```typescript
 * import { wrapFetchWithPayment } from '@x402/fetch';
 * import { EVMExactScheme } from '@x402/evm';
 * import { SolanaExactScheme } from '@x402/solana';
 * 
 * const fetchWithPay = wrapFetchWithPayment(fetch, {
 *   schemes: [
 *     { network: 'eip155:8453', client: new EVMExactScheme({ signer: evmWallet }) },
 *     { network: 'solana:mainnet', client: new SolanaExactScheme({ signer: solanaWallet }) },
 *     { network: 'eip155:1', client: new EVMExactScheme({ signer: evmWallet }), x402Version: 1 }
 *   ]
 * });
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
  config: FetchWrapperConfig
) {
  const { schemes, paymentRequirementsSelector } = config;

  if (!schemes || schemes.length === 0) {
    throw new Error("At least one scheme registration is required");
  }

  // Create and configure the x402HTTPClient
  const client = new x402HTTPClient(paymentRequirementsSelector);

  // Register all provided schemes
  schemes.forEach(({ network, client: schemeClient, x402Version = 2 }) => {
    if (x402Version === 1) {
      client.registerSchemeV1(network, schemeClient);
    } else {
      client.registerScheme(network, schemeClient);
    }
  });

  return async (input: RequestInfo, init?: RequestInit) => {
    const response = await fetch(input, init);

    if (response.status !== 402) {
      return response;
    }

    // Parse payment requirements from response
    let paymentRequired: PaymentRequired;
    try {
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key.toUpperCase()] = value;
      });

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

      paymentRequired = client.getPaymentRequiredResponse(responseHeaders, body);
    } catch (error) {
      throw new Error(`Failed to parse payment requirements: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Select payment requirements using the client's logic
    const selectedPaymentRequirements = client.selectPaymentRequirements(
      paymentRequired.x402Version,
      paymentRequired.accepts
    );

    // Create payment payload
    let paymentPayload;
    try {
      paymentPayload = await client.createPaymentPayload(
        paymentRequired.x402Version,
        selectedPaymentRequirements
      );
    } catch (error) {
      throw new Error(`Failed to create payment payload: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Encode payment header
    const paymentHeaders = client.encodePaymentSignatureHeader(paymentPayload);

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

// Re-export types and utilities for convenience
export type { SelectPaymentRequirements } from "@x402/core/client";
export type { PaymentRequired, PaymentRequirements, PaymentPayload, Network } from "@x402/core/types";
export type { SchemeNetworkClient } from "@x402/core/types";
export { decodePaymentResponseHeader } from "@x402/core/http";
export { x402HTTPClient } from "@x402/core/client";
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable jsdoc/require-returns */
/* eslint-disable jsdoc/require-param */
/* eslint-disable jsdoc/check-tag-names */
import { useState, useCallback } from "react";
import { useWalletClient, useAccount, useSwitchChain } from "wagmi";
import type { Chain } from "wagmi/chains";
import { base, baseSepolia, polygon, polygonAmoy, avalanche, avalancheFuji } from "wagmi/chains";
import { exact } from "x402/schemes";
import { Payment402Response, PaymentReceipt, PaymentStatus, UseX402PaymentOptions } from "../types";

const CHAIN_MAP: Record<string, Chain> = {
  base: base,
  "base-sepolia": baseSepolia,
  polygon: polygon,
  "polygon-amoy": polygonAmoy,
  avalanche: avalanche,
  "avalanche-fuji": avalancheFuji,
};

/**
 * React hook for handling x402 protocol payments.
 *
 * Automatically detects 402 Payment Required responses, switches chains if needed,
 * prompts the user to sign a payment authorization, and retries the request with
 * the payment proof. All payment logic is abstracted away - developers just call
 * `pay(endpoint)` and receive data when payment succeeds.
 *
 * @param options - Configuration object with optional success/error callbacks and response type
 * @returns Object containing the pay function, payment status, data, receipt, and error state
 *
 * @example
 * Basic usage:
 * ```tsx
 * function MyComponent() {
 *   const { pay, isPending, data, receipt, error } = useX402Payment({
 *     onSuccess: (data, receipt) => {
 *       console.log('Got data:', data);
 *       console.log('Transaction:', receipt?.transaction);
 *     },
 *     onError: (err) => console.error('Payment failed:', err)
 *   });
 *
 *   return (
 *     <button onClick={() => pay('/api/protected-content')} disabled={isPending}>
 *       {isPending ? 'Processing...' : 'Unlock Content ($0.01)'}
 *     </button>
 *   );
 * }
 * ```
 *
 * @example
 * With POST request and custom headers:
 * ```tsx
 * const { pay } = useX402Payment();
 *
 * await pay('/api/generate', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ prompt: 'Generate an image' })
 * });
 * ```
 *
 * @example
 * Streaming response:
 * ```tsx
 * const { pay } = useX402Payment({
 *   responseType: 'stream',
 *   onSuccess: async (stream) => {
 *     const reader = stream.getReader();
 *     const decoder = new TextDecoder();
 *
 *     while (true) {
 *       const { done, value } = await reader.read();
 *       if (done) break;
 *       const chunk = decoder.decode(value);
 *       console.log('Received:', chunk);
 *     }
 *   }
 * });
 *
 * await pay('/api/stream-data');
 * ```
 *
 * @remarks
 * Payment Flow:
 * 1. Calls endpoint with Accept header based on responseType
 * 2. If 402 response received:
 *    - Parses payment requirements (amount, token, network)
 *    - Switches chain if user is on wrong network
 *    - Prompts user to sign payment authorization (NO gas fees)
 *    - Retries request with X-PAYMENT header containing signed proof
 * 3. Returns data from successful request
 * 4. Extracts payment receipt from X-PAYMENT-RESPONSE header (if available)
 *
 * The actual token transfer (settlement) happens asynchronously via the facilitator
 * after the signature is validated. Users get instant access to content.
 *
 * @throws {Error} If wallet is not connected, user rejects signature, or payment validation fails
 */
export function useX402Payment(options?: UseX402PaymentOptions) {
  const { data: walletClient } = useWalletClient();
  const { chain } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const [status, setStatus] = useState<PaymentStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<any>(null);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);

  const responseType = options?.responseType || "json";

  /**
   * Extracts payment receipt from X-PAYMENT-RESPONSE header.
   * The receipt contains transaction details after successful payment settlement.
   */
  const extractReceipt = (response: Response): PaymentReceipt | undefined => {
    const receiptHeader = response.headers.get("X-PAYMENT-RESPONSE");
    if (!receiptHeader) return undefined;

    try {
      const decoded = atob(receiptHeader);
      return JSON.parse(decoded);
    } catch {
      // Failed to parse payment receipt, non blocking
      return undefined;
    }
  };

  /**
   * Processes response based on configured response type.
   */
  const processResponse = async (response: Response) => {
    if (responseType === "response") {
      return response;
    }
    if (responseType === "stream") {
      return response.body;
    }
    if (responseType === "blob") {
      return await response.blob();
    }
    if (responseType === "text") {
      return await response.text();
    }
    // Default to JSON
    return await response.json();
  };

  /**
   * Initiates a payment flow for a protected resource.
   *
   * Automatically handles the entire x402 payment protocol:
   * - Detects 402 responses
   * - Switches blockchain networks if needed
   * - Prompts user for payment signature
   * - Retries with payment proof
   * - Extracts payment receipt from response headers
   *
   * @param endpoint - API endpoint to request (must be protected by x402 middleware)
   * @param fetchOptions - Optional fetch configuration (method, headers, body, etc.)
   * @returns Promise resolving to the API response data (type depends on responseType option)
   *
   * @throws {Error} "Wallet not connected" if no wallet is connected
   * @throws {Error} "No payment options available" if 402 response has no accepts array
   * @throws {Error} "Unsupported network: {network}" if payment requires unsupported chain
   * @throws {Error} "Payment failed: {reason}" if payment validation fails on server
   *
   * @example
   * ```tsx
   * // Simple GET request (JSON)
   * const data = await pay('/api/random-number');
   * console.log(data.number);
   *
   * // POST request with body
   * const result = await pay('/api/ai-generation', {
   *   method: 'POST',
   *   headers: { 'Content-Type': 'application/json' },
   *   body: JSON.stringify({ prompt: 'A cat riding a skateboard' })
   * });
   *
   * // Download file
   * const blob = await pay('/api/download-file'); // responseType: 'blob'
   * const url = URL.createObjectURL(blob);
   * window.open(url);
   * ```
   */
  const pay = useCallback(
    async (endpoint: string, fetchOptions?: RequestInit) => {
      if (!walletClient) {
        const err = new Error("Wallet not connected. Please connect your wallet first.");
        setError(err);
        setStatus("error");
        options?.onError?.(err);
        throw err;
      }

      setStatus("pending");
      setError(null);
      setData(null);
      setReceipt(null);

      try {
        // 1. Initial request to get payment requirements or data
        const response = await fetch(endpoint, {
          ...fetchOptions,
          headers: {
            ...fetchOptions?.headers,
            Accept: responseType === "json" ? "application/json" : "*/*",
          },
        });

        // No payment required - process and return data immediately
        if (response.status !== 402) {
          const responseData = await processResponse(response);
          const paymentReceipt = extractReceipt(response);

          setStatus("success");
          setData(responseData);
          setReceipt(paymentReceipt || null);
          options?.onSuccess?.(responseData, paymentReceipt);
          return responseData;
        }

        // 2. Parse 402 response to get payment requirements
        const payment402: Payment402Response = (await response.json()) as Payment402Response;

        if (!payment402.accepts?.length) {
          throw new Error("No payment options available");
        }

        const requirements = payment402.accepts[0];

        // 3. Switch chain if needed
        const targetChain = CHAIN_MAP[requirements.network];
        if (!targetChain) {
          throw new Error(`Unsupported network: ${requirements.network}`);
        }

        if (chain?.id !== targetChain.id) {
          await switchChainAsync({ chainId: targetChain.id });
        }

        // 4. Create and sign payment authorization using x402's exact scheme
        // This prompts the user's wallet to sign a message (NO gas fees)
        const payment = await exact.evm.createPayment(
          walletClient as any,
          1, // x402Version
          requirements,
        );
        const encodedPayment = exact.evm.encodePayment(payment);

        // 5. Retry with X-PAYMENT header containing signed authorization
        const paidResponse = await fetch(endpoint, {
          ...fetchOptions,
          headers: {
            ...fetchOptions?.headers,
            Accept: responseType === "json" ? "application/json" : "*/*",
            "X-PAYMENT": encodedPayment,
          },
        });

        if (!paidResponse.ok) {
          const errorText = await paidResponse.text();
          throw new Error(`Payment failed: ${errorText || paidResponse.statusText}`);
        }

        // 6. Process response and extract receipt
        const responseData = await processResponse(paidResponse);
        const paymentReceipt = extractReceipt(paidResponse);

        setStatus("success");
        setData(responseData);
        setReceipt(paymentReceipt || null);
        options?.onSuccess?.(responseData, paymentReceipt);
        return responseData;
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error("Payment failed");
        setError(errorObj);
        setStatus("error");
        options?.onError?.(errorObj);
        throw errorObj;
      }
    },
    [walletClient, chain, options, responseType],
  );

  return {
    /**
     * Function to initiate payment for a protected resource.
     * Call with an endpoint URL and optional fetch options.
     */
    pay,

    /**
     * Response data from the API after successful payment.
     * Type depends on the responseType option:
     * - 'json': Parsed JSON object
     * - 'text': String
     * - 'blob': Blob object
     * - 'stream': ReadableStream
     * - 'response': Response object
     *
     * null while pending or if error occurred.
     */
    data,

    /**
     * Payment receipt containing transaction details.
     * Available after successful payment settlement.
     * Contains transaction hash, network, and payer address.
     * null if not yet available or payment hasn't settled.
     */
    receipt,

    /**
     * Current payment status.
     * - 'idle': No payment in progress
     * - 'pending': Payment flow in progress (fetching, signing, validating)
     * - 'success': Payment completed, data received
     * - 'error': Payment failed
     */
    status,

    /**
     * Whether a payment is currently in progress.
     * Useful for disabling buttons during payment.
     */
    isPending: status === "pending",

    /**
     * Whether the payment was successfully completed.
     */
    isSuccess: status === "success",

    /**
     * Whether the payment encountered an error.
     */
    isError: status === "error",

    /**
     * Error object if payment failed, null otherwise.
     * Contains detailed error message explaining what went wrong.
     */
    error,
  };
}

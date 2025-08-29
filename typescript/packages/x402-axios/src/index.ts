import { AxiosInstance, AxiosError } from "axios";
import {
  ChainIdToNetwork,
  PaymentRequirements,
  PaymentRequirementsSchema,
  Wallet,
  WalletPolicy,
  getDefaultPolicy,
  validatePaymentAgainstPolicy,
} from "x402/types";
import { evm } from "x402/types";
import {
  createPaymentHeader,
  PaymentRequirementsSelector,
  selectPaymentRequirements,
} from "x402/client";

/**
 * Enables the payment of APIs using the x402 payment protocol.
 *
 * When a request receives a 402 response:
 * 1. Extracts payment requirements from the response
 * 2. Verifies the payment amount is within the allowed policy limits
 * 3. Creates a payment header using the provided wallet client
 * 4. Retries the original request with the payment header
 * 5. Exposes the X-PAYMENT-RESPONSE header in the final response
 *
 * @param axiosClient - The Axios instance to add the interceptor to
 * @param walletClient - A wallet client that can sign transactions and create payment headers
 * @param policy - Wallet policy configuration (defaults to 0.1 USDC on base-sepolia)
 * @param paymentRequirementsSelector - A function that selects the payment requirements from the response
 * @returns The modified Axios instance with the payment interceptor
 *
 * @example
 * ```typescript
 * // Default policy (0.1 USDC on base-sepolia)
 * const client = withPaymentInterceptor(axios.create(), signer);
 *
 * // Custom policy with multiple networks
 * const client = withPaymentInterceptor(
 *   axios.create(),
 *   signer,
 *   {
 *     payments: {
 *       networks: {
 *         "base": "$0.05",          // Shorthand for USDC
 *         "base-sepolia": "$0.10",  // Testnet limit
 *         "ethereum": "$0.25"       // Higher limit for mainnet
 *       }
 *     }
 *   }
 * );
 *
 * // The client will automatically handle 402 responses
 * const response = await client.get('https://api.example.com/premium-content');
 * ```
 * 
 * @throws {Error} If the payment amount exceeds the policy limits
 * @throws {Error} If the request configuration is missing
 * @throws {Error} If a payment has already been attempted for this request
 */
export function withPaymentInterceptor(
  axiosClient: AxiosInstance,
  walletClient: Wallet,
  policy?: WalletPolicy,
  paymentRequirementsSelector: PaymentRequirementsSelector = selectPaymentRequirements,
) {
  // Use provided policy or default
  const effectivePolicy = policy || getDefaultPolicy();

  axiosClient.interceptors.response.use(
    response => response,
    async (error: AxiosError) => {
      if (!error.response || error.response.status !== 402) {
        return Promise.reject(error);
      }

      try {
        const originalConfig = error.config;
        if (!originalConfig || !originalConfig.headers) {
          return Promise.reject(new Error("Missing axios request configuration"));
        }

        if ((originalConfig as { __is402Retry?: boolean }).__is402Retry) {
          return Promise.reject(error);
        }

        const { x402Version, accepts } = error.response.data as {
          x402Version: number;
          accepts: PaymentRequirements[];
        };
        const parsed = accepts.map(x => PaymentRequirementsSchema.parse(x));

        const chainId = evm.isSignerWallet(walletClient) ? walletClient.chain?.id : undefined;

        const selectedPaymentRequirements = paymentRequirementsSelector(
          parsed,
          chainId ? ChainIdToNetwork[chainId] : undefined,
          "exact",
        );

        // Validate payment amount against policy limits
        const network = selectedPaymentRequirements.network;
        const asset = selectedPaymentRequirements.asset;
        const amount = BigInt(selectedPaymentRequirements.maxAmountRequired);
        
        if (!validatePaymentAgainstPolicy(network, asset, amount, effectivePolicy)) {
          return Promise.reject(new Error("Payment amount exceeds policy limits"));
        }

        const paymentHeader = await createPaymentHeader(
          walletClient,
          x402Version,
          selectedPaymentRequirements,
        );

        (originalConfig as { __is402Retry?: boolean }).__is402Retry = true;

        originalConfig.headers["X-PAYMENT"] = paymentHeader;
        originalConfig.headers["Access-Control-Expose-Headers"] = "X-PAYMENT-RESPONSE";

        const secondResponse = await axiosClient.request(originalConfig);
        return secondResponse;
      } catch (paymentError) {
        return Promise.reject(paymentError);
      }
    },
  );

  return axiosClient;
}

export { decodeXPaymentResponse } from "x402/shared";

import { AxiosInstance, AxiosError } from "axios";
import {
  ChainIdToNetwork,
  PaymentRequirements,
  PaymentRequirementsSchema,
  Signer,
  MultiNetworkSigner,
  isMultiNetworkSigner,
  isSvmSignerWallet,
  Network,
  evm,
  X402Config,
} from "@b3dotfun/anyspend-x402/types";
import {
  createPaymentHeader,
  PaymentRequirementsSelector,
  selectPaymentRequirements,
} from "@b3dotfun/anyspend-x402/client";

/**
 * Configuration options for payment preferences
 */
export interface PaymentPreferences {
  /**
   * Preferred token address to pay with (e.g., WETH, DAI, USDC)
   * If not specified, defaults to USDC
   */
  preferredToken?: string;

  /**
   * Preferred network/chain to pay on (e.g., "base", "ethereum", "arbitrum")
   * If not specified, uses the wallet's current network
   */
  preferredNetwork?: Network;
}

/**
 * Enables the payment of APIs using the x402 payment protocol.
 *
 * When a request receives a 402 response:
 * 1. Extracts payment requirements from the response
 * 2. Creates a payment header using the provided wallet client
 * 3. Retries the original request with the payment header
 * 4. Exposes the X-PAYMENT-RESPONSE header in the final response
 *
 * @param axiosClient - The Axios instance to add the interceptor to
 * @param walletClient - A wallet client that can sign transactions and create payment headers
 * @param paymentRequirementsSelector - A function that selects the payment requirements from the response
 * @param config - Optional configuration for X402 operations (e.g., custom RPC URLs)
 * @param preferences - Optional payment preferences (preferred token and network)
 * @returns The modified Axios instance with the payment interceptor
 *
 * @example
 * ```typescript
 * const client = withPaymentInterceptor(
 *   axios.create(),
 *   signer
 * );
 *
 * // With payment preferences - pay with WETH on Base
 * const client = withPaymentInterceptor(
 *   axios.create(),
 *   signer,
 *   undefined,
 *   undefined,
 *   {
 *     preferredToken: '0x4200000000000000000000000000000000000006', // WETH on Base
 *     preferredNetwork: 'base'
 *   }
 * );
 *
 * // With custom RPC configuration
 * const client = withPaymentInterceptor(
 *   axios.create(),
 *   signer,
 *   undefined,
 *   { svmConfig: { rpcUrl: "http://localhost:8899" } }
 * );
 *
 * // The client will automatically handle 402 responses
 * const response = await client.get('https://api.example.com/premium-content');
 * ```
 */
export function withPaymentInterceptor(
  axiosClient: AxiosInstance,
  walletClient: Signer | MultiNetworkSigner,
  paymentRequirementsSelector: PaymentRequirementsSelector = selectPaymentRequirements,
  config?: X402Config,
  preferences?: PaymentPreferences,
) {
  // Add request interceptor to inject payment preference headers
  if (axiosClient.interceptors?.request) {
    axiosClient.interceptors.request.use(
      config => {
        if (preferences?.preferredToken) {
          config.headers["X-PREFERRED-TOKEN"] = preferences.preferredToken;
        }

        if (preferences?.preferredNetwork) {
          config.headers["X-PREFERRED-NETWORK"] = preferences.preferredNetwork;
        }

        return config;
      },
      error => Promise.reject(error),
    );
  }

  // Add response interceptor to handle 402 payments
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

        const network = isMultiNetworkSigner(walletClient)
          ? undefined
          : evm.isSignerWallet(walletClient as typeof evm.EvmSigner)
            ? ChainIdToNetwork[(walletClient as typeof evm.EvmSigner).chain?.id]
            : isSvmSignerWallet(walletClient as Signer)
              ? (["solana", "solana-devnet"] as Network[])
              : undefined;

        const selectedPaymentRequirements = paymentRequirementsSelector(parsed, network, "exact");
        const paymentHeader = await createPaymentHeader(
          walletClient,
          x402Version,
          selectedPaymentRequirements,
          config,
        );

        (originalConfig as { __is402Retry?: boolean }).__is402Retry = true;

        originalConfig.headers["X-PAYMENT"] = paymentHeader;
        originalConfig.headers["Access-Control-Expose-Headers"] = "X-PAYMENT-RESPONSE";

        // Ensure preference headers are sent with payment for cross-chain support
        if (preferences?.preferredToken) {
          originalConfig.headers["X-PREFERRED-TOKEN"] = preferences.preferredToken;
        }
        if (preferences?.preferredNetwork) {
          originalConfig.headers["X-PREFERRED-NETWORK"] = preferences.preferredNetwork;
        }

        const secondResponse = await axiosClient.request(originalConfig);
        return secondResponse;
      } catch (paymentError) {
        return Promise.reject(paymentError);
      }
    },
  );

  return axiosClient;
}

export { decodeXPaymentResponse } from "@b3dotfun/anyspend-x402/shared";
export {
  createSigner,
  type Signer,
  type MultiNetworkSigner,
  type X402Config,
  type Network,
} from "@b3dotfun/anyspend-x402/types";
export { type PaymentRequirementsSelector } from "@b3dotfun/anyspend-x402/client";
export type { Hex } from "viem";

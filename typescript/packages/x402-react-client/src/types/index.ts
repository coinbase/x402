/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Theme } from "@rainbow-me/rainbowkit";
import type { Chain } from "wagmi/chains";
import { type ReactNode } from "react";
import type { PaymentRequirements } from "x402/types";
import { Config, CreateConnectorFn } from "wagmi";
import { Address } from "viem";

/**
 * Configuration options for X402Provider.
 */
export interface X402Config {
  /**
   * App name displayed in wallet connection modals.
   * Helps users identify your app when connecting their wallet.
   *
   * @default "x402 App"
   * @example
   * ```tsx
   * <X402Provider config={{ appName: "My NFT Marketplace" }}>
   *   <App />
   * </X402Provider>
   * ```
   */
  appName?: string;

  /**
   * WalletConnect project ID for enabling WalletConnect support.
   * Get yours free at https://cloud.walletconnect.com
   * Required for production apps using WalletConnect.
   *
   * @example
   * ```tsx
   * <X402Provider config={{
   *   walletConnectProjectId: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
   * }}>
   *   <App />
   * </X402Provider>
   * ```
   */
  walletConnectProjectId?: string;

  /**
   * Custom blockchain networks to support.
   * Must be a non-empty array with at least one chain.
   * Defaults to Base, Polygon, Avalanche (mainnet + testnets).
   *
   * @example
   * ```tsx
   * import { mainnet, optimism } from "wagmi/chains";
   *
   * <X402Provider config={{
   *   chains: [mainnet, optimism]
   * }}>
   *   <App />
   * </X402Provider>
   * ```
   */
  chains?: readonly [Chain, ...Chain[]];

  /**
   * Custom RainbowKit theme for styling wallet connection UI.
   * Only applies when mode is 'rainbowkit'.
   * Defaults to dark theme with blue accent.
   *
   * @example
   * ```tsx
   * import { lightTheme } from "@rainbow-me/rainbowkit";
   *
   * <X402Provider config={{
   *   rainbowKitTheme: lightTheme({
   *     accentColor: "#7b3fe4",
   *     borderRadius: "large"
   *   })
   * }}>
   *   <App />
   * </X402Provider>
   * ```
   */
  rainbowKitTheme?: Theme;

  /**
   * UI mode for wallet connection.
   * - 'rainbowkit' (default): Beautiful pre-built UI with RainbowKit
   * - 'headless': No UI provided, build your own connection component
   *
   * @example
   * RainbowKit mode (default):
   * ```tsx
   * <X402Provider config={{ mode: "rainbowkit" }}>
   *   <ConnectButton /> // RainbowKit's styled button
   * </X402Provider>
   * ```
   *
   * Headless mode:
   * ```tsx
   * <X402Provider config={{ mode: "headless" }}>
   *   <MyCustomConnectButton /> // Your own UI
   * </X402Provider>
   * ```
   */
  mode?: "rainbowkit" | "headless";

  /**
   * Custom wagmi connectors for advanced wallet configuration.
   * If provided, overrides default connectors and ignores walletConnectProjectId.
   * Use this when you need specific wallet integrations or custom behavior.
   *
   * @example
   * ```tsx
   * import { injected, metaMask, coinbaseWallet } from "wagmi/connectors";
   *
   * <X402Provider config={{
   *   connectors: [
   *     injected({
   *       target: {
   *         id: 'binance',
   *         name: 'Binance Wallet',
   *         provider: (window) => window.BinanceChain
   *       }
   *     }),
   *     metaMask(),
   *     coinbaseWallet({ appName: 'My App' }),
   *   ]
   * }}>
   *   <App />
   * </X402Provider>
   * ```
   */
  connectors?: CreateConnectorFn[];

  /**
   * Custom wagmi config for maximum control over wallet setup.
   * If provided, ALL other config options are ignored.
   * You must handle QueryClientProvider yourself when using this option.
   * Only use this if you need complete control over wagmi configuration.
   *
   * @example
   * ```tsx
   * import { createConfig, http } from "wagmi";
   * import { mainnet } from "wagmi/chains";
   *
   * const customConfig = createConfig({
   *   chains: [mainnet],
   *   transports: { [mainnet.id]: http() },
   *   // ... your custom config
   * });
   *
   * <X402Provider config={{ customWagmiConfig: customConfig }}>
   *   <App />
   * </X402Provider>
   * ```
   */
  customWagmiConfig?: Config;
}

/**
 * Props for X402Provider component.
 */
export interface X402ProviderProps {
  /**
   * React children to render inside the provider.
   * Typically your entire app or a section that needs wallet connectivity.
   */
  children: ReactNode;

  /**
   * Optional configuration for wallet setup and UI customization.
   * See X402Config interface for all available options.
   */
  config?: X402Config;
}

/**
 * Response body returned by an endpoint when it returns 402 Payment Required.
 * Contains all information needed to process the payment and retry the request.
 *
 * @example
 * Server returns this when content requires payment:
 * ```typescript
 * // HTTP/1.1 402 Payment Required
 * // Content-Type: application/json
 * {
 *   "x402Version": 1,
 *   "error": "Payment required to access this resource",
 *   "accepts": [{
 *     "scheme": "exact",
 *     "network": "base",
 *     "maxAmountRequired": "10000",
 *     "resource": "/api/random-number",
 *     "description": "Random number generation",
 *     "mimeType": "application/json",
 *     "payTo": "0x1234...",
 *     "maxTimeoutSeconds": 3600,
 *     "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
 *   }]
 * }
 * ```
 */
export interface Payment402Response {
  /**
   * Version of the x402 protocol being used.
   * Currently version 1. Used for future compatibility.
   */
  x402Version: number;

  /**
   * Human-readable error message explaining why payment is required.
   *
   * @example "Payment required to access this resource"
   */
  error: string;

  /**
   * Array of acceptable payment options.
   * Multiple options allow flexibility (e.g., different networks or tokens).
   * The client typically uses the first option that matches their capabilities.
   *
   * @example
   * ```typescript
   * accepts: [
   *   { network: "base", asset: "0x833...", ... },      // Base USDC
   *   { network: "polygon", asset: "0x3c4...", ... }    // Polygon USDC
   * ]
   * ```
   */
  accepts: PaymentRequirements[];
}

/**
 * Payment receipt containing transaction details and metadata.
 * Returned in the X-PAYMENT-RESPONSE header after successful payment settlement.
 */
export interface PaymentReceipt {
  /**
   * Whether the payment settlement was successful.
   */
  success: boolean;

  /**
   * Blockchain transaction hash of the settled payment.
   * Can be used to view the transaction on a block explorer.
   *
   * @example "0xabc123..." // Transaction hash
   */
  transaction?: string;

  /**
   * Blockchain network where the payment was settled.
   *
   * @example "base" | "polygon" | "avalanche"
   */
  network?: string;

  /**
   * Adress of the payer (user who made the payment).
   *
   * @example "0x1234567890abcdef1234567890abcdef12345678"
   */
  payer?: string;
}

/**
 * Status of a payment operation in the useX402Payment hook.
 *
 * @example
 * Using status to show UI feedback:
 * ```tsx
 * const { status, pay } = useX402Payment();
 *
 * return (
 *   <button
 *     onClick={() => pay('/api/content')}
 *     disabled={status === 'pending'}
 *   >
 *     {status === 'idle' && 'Unlock Content'}
 *     {status === 'pending' && 'Processing Payment...'}
 *     {status === 'success' && 'Content Unlocked!'}
 *     {status === 'error' && 'Payment Failed - Retry'}
 *   </button>
 * );
 * ```
 */
export type PaymentStatus =
  /** No payment in progress. Initial state. */
  | "idle"
  /** Payment flow in progress (fetching requirements, signing, validating). */
  | "pending"
  /** Payment completed successfully and data received. */
  | "success"
  /** Payment failed at any stage. Check error object for details. */
  | "error";

/**
 * Configuration options for the useX402Payment hook.
 */
export interface UseX402PaymentOptions {
  /**
   * Callback invoked when a payment is successfully completed and data is received.
   *
   * @param data - The response data from the paid API endpoint
   * @param receipt - Optional payment receipt containing transaction details
   * @example
   * ```tsx
   * const { pay } = useX402Payment({
   *   onSuccess: (data, receipt) => {
   *     console.log('Payment successful:', data);
   *     console.log('Transaction:', receipt?.transaction);
   *     toast.success('Content unlocked!');
   *   }
   * });
   * ```
   */
  onSuccess?: (data: any, receipt?: PaymentReceipt) => void;

  /**
   * Callback invoked when a payment fails at any stage (wallet not connected,
   * chain switch failure, signature rejection, payment validation failure, etc.).
   *
   * @param error - Error object describing what went wrong
   * @example
   * ```tsx
   * const { pay } = useX402Payment({
   *   onError: (error) => {
   *     console.error('Payment failed:', error.message);
   *     if (error.message.includes('User rejected')) {
   *       toast.error('Payment cancelled');
   *     } else {
   *       toast.error('Payment failed. Please try again.');
   *     }
   *   }
   * });
   * ```
   */
  onError?: (error: Error) => void;

  /**
   * Expected response type from the protected endpoint.
   * Determines how the response will be parsed and returned.
   *
   * - 'json': Parse response as JSON (default)
   * - 'text': Return response as plain text string
   * - 'blob': Return response as Blob (useful for file downloads)
   * - 'stream': Return response body as ReadableStream (for streaming data)
   * - 'response': Return raw Response object (for full control over response handling)
   *
   * @default 'json'
   *
   * @example
   * ```tsx
   * // Streaming response
   * const { pay } = useX402Payment({
   *   responseType: 'stream',
   *   onSuccess: async (stream) => {
   *     const reader = stream.getReader();
   *     while (true) {
   *       const { done, value } = await reader.read();
   *       if (done) break;
   *       console.log('Chunk:', new TextDecoder().decode(value));
   *     }
   *   }
   * });
   *
   * // File download
   * const { pay } = useX402Payment({
   *   responseType: 'blob',
   *   onSuccess: (blob) => {
   *     const url = URL.createObjectURL(blob);
   *     const a = document.createElement('a');
   *     a.href = url;
   *     a.download = 'protected-file.pdf';
   *     a.click();
   *     URL.revokeObjectURL(url);
   *   }
   * });
   * ```
   */
  responseType?: "json" | "text" | "blob" | "stream" | "response";
}

/**
 * Configuration options for the useX402Balance hook.
 */
export interface UseX402BalanceOptions {
  /**
   * Custom token address to check balance for.
   * Defaults to USDC for the currently connected chain.
   *
   * @example
   * ```tsx
   * // Check balance for a custom ERC20 token
   * const { balance } = useX402Balance({
   *   token: "0x1234567890abcdef1234567890abcdef12345678"
   * });
   * ```
   */
  token?: Address;

  /**
   * How often to poll for balance updates, in milliseconds.
   * Default: 10000 (10 seconds)
   *
   * @example
   * ```tsx
   * // Check balance every 5 seconds
   * const { balance } = useX402Balance({
   *   pollingInterval: 5000
   * });
   * ```
   */
  pollingInterval?: number;

  /**
   * Callback invoked when balance is successfully fetched.
   *
   * @param balance - The formatted balance as a string (e.g., "123.456789")
   * @example
   * ```tsx
   * const { balance } = useX402Balance({
   *   onSuccess: (balance) => {
   *     console.log('Current balance:', balance);
   *     if (parseFloat(balance) < 1) {
   *       toast.warning('Low balance!');
   *     }
   *   }
   * });
   * ```
   */
  onSuccess?: (balance: string) => void;

  /**
   * Callback invoked when balance fetch fails.
   *
   * @param error - Error object describing what went wrong
   * @example
   * ```tsx
   * const { balance } = useX402Balance({
   *   onError: (error) => {
   *     console.error('Failed to fetch balance:', error.message);
   *     toast.error('Could not load balance');
   *   }
   * });
   * ```
   */
  onError?: (error: Error) => void;

  /**
   * Whether to call onSuccess callback on every automatic poll/block update.
   * - false (default): Only call on initial fetch or manual refresh
   * - true: Call on every automatic poll when balance changes
   *
   * Use true if you want real-time notifications of balance changes.
   *
   * @example
   * ```tsx
   * // Get notified every time balance updates
   * const { balance } = useX402Balance({
   *   callbackOnPoll: true,
   *   onSuccess: (balance) => {
   *     toast.info(`Balance updated: ${balance}`);
   *   }
   * });
   * ```
   */
  callbackOnPoll?: boolean;
}

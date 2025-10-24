/**
 * Local Facilitator Configuration for E2E Testing
 *
 * This module sets up a local facilitator for end-to-end testing purposes.
 * In production, you would typically use a remote facilitator service.
 *
 * The facilitator handles:
 * - Payment verification
 * - Transaction settlement
 * - Network-specific payment scheme implementations
 */

import { x402Facilitator } from "@x402/core/facilitator";
import { FacilitatorClient } from "@x402/core/server";
import {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
  VerifyResponse,
} from "@x402/core/types";
import { ExactEvmFacilitator, toFacilitatorEvmSigner } from "@x402/evm";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import dotenv from "dotenv";

dotenv.config();

// Network configuration
export const NETWORK = "eip155:84532" as const;

// Validate required environment variables
if (!process.env.EVM_PRIVATE_KEY) {
  throw new Error("EVM_PRIVATE_KEY environment variable is required");
}

if (!process.env.EVM_ADDRESS) {
  throw new Error("EVM_ADDRESS environment variable is required");
}

/**
 * Initialize the EVM account from private key
 */
const account = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
console.info(`Facilitator account: ${account.address}`);

/**
 * Create a Viem client with both wallet and public capabilities
 */
const viemClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(),
}).extend(publicActions);

/**
 * Initialize the x402 Facilitator with EVM support
 *
 * This facilitator is configured to work with the Base Sepolia testnet
 * and handles the exact payment scheme for EVM-compatible chains.
 */
const facilitator = new x402Facilitator();

// Register the EVM scheme handler
facilitator.registerScheme(
  NETWORK,
  new ExactEvmFacilitator(
    toFacilitatorEvmSigner({
      readContract: (args: {
        address: `0x${string}`;
        abi: readonly unknown[];
        functionName: string;
        args?: readonly unknown[];
      }) =>
        viemClient.readContract({
          ...args,
          args: args.args || [],
        }),
      verifyTypedData: (args: {
        address: `0x${string}`;
        domain: Record<string, unknown>;
        types: Record<string, unknown>;
        primaryType: string;
        message: Record<string, unknown>;
        signature: `0x${string}`;
      }) => viemClient.verifyTypedData(args),
      writeContract: (args: {
        address: `0x${string}`;
        abi: readonly unknown[];
        functionName: string;
        args: readonly unknown[];
      }) =>
        viemClient.writeContract({
          ...args,
          args: args.args || [],
        }),
      waitForTransactionReceipt: (args: { hash: `0x${string}` }) =>
        viemClient.waitForTransactionReceipt(args),
    }),
  ),
);

/**
 * LocalFacilitatorClient wraps the x402Facilitator to implement the FacilitatorClient interface
 *
 * This allows the local facilitator to be used in the same way as remote facilitator clients,
 * making it easy to switch between local and remote facilitators for testing and production.
 */
export class LocalFacilitatorClient implements FacilitatorClient {
  readonly scheme = "exact";
  readonly x402Version = 2;

  /**
   * Creates a new LocalFacilitatorClient instance.
   *
   * @param facilitator - The x402 facilitator instance
   */
  constructor(private readonly facilitator: x402Facilitator) { }

  /**
   * Verify a payment against the payment requirements
   *
   * @param paymentPayload - The payment data to verify
   * @param paymentRequirements - The requirements the payment must meet
   * @returns Verification result indicating if the payment is valid
   */
  verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    return this.facilitator.verify(paymentPayload, paymentRequirements);
  }

  /**
   * Settle a verified payment on-chain
   *
   * @param paymentPayload - The payment data to settle
   * @param paymentRequirements - The requirements for settlement
   * @returns Settlement result with transaction details
   */
  settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    return this.facilitator.settle(paymentPayload, paymentRequirements);
  }

  /**
   * Get supported payment schemes and networks
   *
   * @returns List of supported payment configurations
   */
  getSupported(): Promise<SupportedResponse> {
    return Promise.resolve({
      kinds: [
        {
          x402Version: this.x402Version,
          scheme: this.scheme,
          network: NETWORK,
          extra: {},
        },
      ],
      extensions: [],
    });
  }
}

/**
 * Pre-configured facilitator client ready for use
 */
export const localFacilitatorClient = new LocalFacilitatorClient(facilitator);

/**
 * Export the payee address for consistency
 */
export const PAYEE_ADDRESS = process.env.EVM_ADDRESS as `0x${string}`;

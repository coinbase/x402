import { SettleResponse, VerifyResponse } from "./facilitator";
import { PaymentRequirements, PaymentRequired } from "./payments";
import { PaymentPayload } from "./payments";
import { Price, Network, AssetAmount } from ".";

/**
 * Money parser function that converts a numeric amount to an AssetAmount
 * Receives the amount as a decimal number (e.g., 1.50 for $1.50)
 * Returns null to indicate "cannot handle this amount", causing fallback to next parser
 * Always returns a Promise for consistency - use async/await
 *
 * @param amount - The decimal amount (e.g., 1.50)
 * @param network - The network identifier for context
 * @returns AssetAmount or null to try next parser
 */
export type MoneyParser = (amount: number, network: Network) => Promise<AssetAmount | null>;

/**
 * Context passed to SchemeNetworkClient.createPaymentPayload for extension support.
 * Contains information about the facilitator's capabilities that the mechanism
 * may need to create extension data (e.g., gas sponsoring signatures).
 */
export interface PaymentCreationContext {
  /**
   * The full PaymentRequired response from the server
   */
  paymentRequired: PaymentRequired;

  /**
   * Information from the facilitator's /supported endpoint.
   * Optional - if not provided, mechanism cannot create extension data.
   */
  facilitatorSupported?: {
    /**
     * Extensions supported by the facilitator (e.g., ["eip2612GasSponsoring", "bazaar"])
     */
    extensions: string[];

    /**
     * Signer addresses by CAIP family (e.g., { "eip155:*": ["0x..."] })
     */
    signers?: Record<string, string[]>;
  };
}

/**
 * Result of createPaymentPayload - includes the core payload and optional extensions
 */
export interface PaymentPayloadResult {
  /**
   * The x402 protocol version
   */
  x402Version: number;

  /**
   * The scheme-specific payload data
   */
  payload: PaymentPayload["payload"];

  /**
   * Optional extensions created by the mechanism (e.g., gas sponsoring data).
   * These are merged with any extensions declared in PaymentRequired.
   */
  extensions?: Record<string, unknown>;
}

export interface SchemeNetworkClient {
  readonly scheme: string;

  /**
   * Creates a payment payload for this scheme.
   *
   * @param x402Version - The x402 protocol version
   * @param paymentRequirements - The payment requirements to fulfill
   * @param context - Optional context with facilitator info for extension support
   * @returns Payment payload result including optional extension data
   *
   * @example
   * ```typescript
   * // Without extensions
   * const result = await client.createPaymentPayload(2, requirements);
   *
   * // With facilitator context for extension support
   * const result = await client.createPaymentPayload(2, requirements, {
   *   paymentRequired,
   *   facilitatorSupported: { extensions: ["eip2612GasSponsoring"] }
   * });
   * // If mechanism creates extension data:
   * // result.extensions = { eip2612GasSponsoring: { info: {...} } }
   * ```
   */
  createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
    context?: PaymentCreationContext,
  ): Promise<PaymentPayloadResult>;
}

export interface SchemeNetworkFacilitator {
  readonly scheme: string;

  /**
   * CAIP family pattern that this facilitator supports.
   * Used to group signers by blockchain family in the supported response.
   *
   * @example
   * // EVM facilitators
   * readonly caipFamily = "eip155:*";
   *
   * @example
   * // SVM facilitators
   * readonly caipFamily = "solana:*";
   */
  readonly caipFamily: string;

  /**
   * Get mechanism-specific extra data needed for the supported kinds endpoint.
   * This method is called when building the facilitator's supported response.
   *
   * @param network - The network identifier for context
   * @returns Extra data object or undefined if no extra data is needed
   *
   * @example
   * // EVM schemes return undefined (no extra data needed)
   * getExtra(network: Network): undefined {
   *   return undefined;
   * }
   *
   * @example
   * // SVM schemes return feePayer address
   * getExtra(network: Network): Record<string, unknown> | undefined {
   *   return { feePayer: this.signer.address };
   * }
   */
  getExtra(network: Network): Record<string, unknown> | undefined;

  /**
   * Get signer addresses used by this facilitator for a given network.
   * These are included in the supported response to help clients understand
   * which addresses might sign/pay for transactions.
   *
   * Supports multiple addresses for load balancing, key rotation, and high availability.
   *
   * @param network - The network identifier
   * @returns Array of signer addresses (wallet addresses, fee payer addresses, etc.)
   *
   * @example
   * // EVM facilitator
   * getSigners(network: string): string[] {
   *   return [...this.signer.getAddresses()];
   * }
   *
   * @example
   * // SVM facilitator
   * getSigners(network: string): string[] {
   *   return [...this.signer.getAddresses()];
   * }
   */
  getSigners(network: string): string[];

  verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse>;
  settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse>;
}

export interface SchemeNetworkServer {
  readonly scheme: string;

  /**
   * Convert a user-friendly price to the scheme's specific amount and asset format
   * Always returns a Promise for consistency
   *
   * @param price - User-friendly price (e.g., "$0.10", "0.10", { amount: "100000", asset: "USDC" })
   * @param network - The network identifier for context
   * @returns Promise that resolves to the converted amount, asset identifier, and any extra metadata
   *
   * @example
   * // For EVM networks with USDC:
   * await parsePrice("$0.10", "eip155:8453") => { amount: "100000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" }
   *
   * // For custom schemes:
   * await parsePrice("10 points", "custom:network") => { amount: "10", asset: "points" }
   */
  parsePrice(price: Price, network: Network): Promise<AssetAmount>;

  /**
   * Build payment requirements for this scheme/network combination
   *
   * @param paymentRequirements - Base payment requirements with amount/asset already set
   * @param supportedKind - The supported kind from facilitator's /supported endpoint
   * @param supportedKind.x402Version - The x402 version
   * @param supportedKind.scheme - The payment scheme
   * @param supportedKind.network - The network identifier
   * @param supportedKind.extra - Optional extra metadata
   * @param facilitatorExtensions - Extensions supported by the facilitator
   * @returns Enhanced payment requirements ready to be sent to clients
   */
  enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    supportedKind: {
      x402Version: number;
      scheme: string;
      network: Network;
      extra?: Record<string, unknown>;
    },
    facilitatorExtensions: string[],
  ): Promise<PaymentRequirements>;
}

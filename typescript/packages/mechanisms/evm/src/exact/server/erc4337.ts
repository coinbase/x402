import type { PaymentRequirements, Network } from "@x402/core/types";
import { ExactEvmScheme } from "./scheme";
import { getChainById, parseCAIP2 } from "../../erc4337/networks/helpers";
import { extractUserOperationCapability } from "../../erc4337/utils";

/**
 * Enhanced ExactEvmScheme that preserves UserOperation capability in payment requirements.
 *
 * This class extends ExactEvmScheme and enhances the `enhancePaymentRequirements` method
 * to preserve `userOperation` from `paymentRequirements.extra`. This ensures that when routes
 * are transformed using `transformRoutesForUserOperation`, the userOperation data flows through
 * the entire payment requirements pipeline.
 */
export class ExactEvmSchemeERC4337 extends ExactEvmScheme {
  /**
   * Creates a new ExactEvmSchemeERC4337 instance with extended network support.
   */
  constructor() {
    super();
    // Patch getDefaultAsset to support all networks in our registry.
    // The upstream ExactEvmScheme only has USDC addresses for Base and Base Sepolia.
    // We override at the instance level since upstream marks the method as private.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).getDefaultAsset = (network: string) => {
      const chainId = parseCAIP2(network);
      const chain = getChainById(chainId);
      if (chain) {
        return {
          address: chain.usdcAddress,
          name: "USDC",
          version: "2",
          decimals: 6,
        };
      }
      throw new Error(`No default asset configured for network ${network}`);
    };
  }

  /**
   * Enhance payment requirements while preserving UserOperation capability.
   *
   * This method calls the parent's enhancePaymentRequirements and then ensures
   * that any userOperation from the original paymentRequirements.extra is preserved
   * in the returned requirements.
   *
   * @param paymentRequirements - The original payment requirements
   * @param supportedKind - The supported kind configuration
   * @param supportedKind.x402Version - The x402 protocol version
   * @param supportedKind.scheme - The payment scheme name
   * @param supportedKind.network - The network identifier
   * @param supportedKind.extra - Optional extra data for the kind
   * @param extensionKeys - Keys to preserve from the original requirements
   * @returns The enhanced payment requirements with UserOperation capability preserved
   */
  async enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    supportedKind: {
      x402Version: number;
      scheme: string;
      network: Network;
      extra?: Record<string, unknown>;
    },
    extensionKeys: string[],
  ): Promise<PaymentRequirements> {
    // Extract userOperation from the original requirements before enhancement
    const userOperation = extractUserOperationCapability(paymentRequirements);

    // Call parent's enhancePaymentRequirements
    const enhanced = await super.enhancePaymentRequirements(
      paymentRequirements,
      supportedKind,
      extensionKeys,
    );

    // If userOperation was present in the original requirements, preserve it
    if (userOperation) {
      return {
        ...enhanced,
        extra: {
          ...enhanced.extra,
          userOperation,
        },
      };
    }

    // No userOperation to preserve, but ensure extra exists
    if (!enhanced.extra) {
      return {
        ...enhanced,
        extra: {},
      };
    }

    // Return enhanced requirements as-is
    return enhanced;
  }
}

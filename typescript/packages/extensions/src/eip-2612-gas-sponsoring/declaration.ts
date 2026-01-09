/**
 * Declaration helpers for EIP-2612 Gas Sponsoring Extension
 *
 * These functions help facilitators advertise their support for
 * EIP-2612 gas sponsoring in the /supported response and PaymentRequired.
 */

import { EIP2612_GAS_SPONSORING } from "./constants";
import { EIP2612_GAS_SPONSORING_SCHEMA } from "./schema";
import type { EIP2612GasSponsoringDeclaration } from "./types";

/**
 * Default description for the extension declaration
 */
const DEFAULT_DESCRIPTION =
  "The facilitator accepts EIP-2612 gasless Permit to Permit2 canonical contract.";

/**
 * Creates an EIP-2612 gas sponsoring extension declaration for facilitators.
 *
 * Call this when building the facilitator's /supported response or
 * when constructing PaymentRequired.extensions.
 *
 * @param options - Optional customization
 * @param options.description - Custom description for the extension
 * @returns Extension declaration object keyed by extension name
 *
 * @example
 * ```typescript
 * // In facilitator's getSupported() or when creating PaymentRequired
 * const extensions = {
 *   ...declareEIP2612GasSponsoringExtension(),
 * };
 * ```
 */
export function declareEIP2612GasSponsoringExtension(options?: {
  description?: string;
}): Record<string, EIP2612GasSponsoringDeclaration> {
  const description = options?.description ?? DEFAULT_DESCRIPTION;

  return {
    [EIP2612_GAS_SPONSORING]: {
      info: {
        description,
        version: "1",
      },
      schema: EIP2612_GAS_SPONSORING_SCHEMA,
    },
  };
}

/**
 * Checks if a facilitator supports EIP-2612 gas sponsoring.
 *
 * @param extensions - Array of extension names from facilitator's /supported response
 * @returns true if EIP-2612 gas sponsoring is supported
 *
 * @example
 * ```typescript
 * const supported = await facilitator.getSupported();
 * if (supportsEIP2612GasSponsoring(supported.extensions)) {
 *   // Can use EIP-2612 gas sponsoring
 * }
 * ```
 */
export function supportsEIP2612GasSponsoring(extensions: string[]): boolean {
  return extensions.includes(EIP2612_GAS_SPONSORING);
}

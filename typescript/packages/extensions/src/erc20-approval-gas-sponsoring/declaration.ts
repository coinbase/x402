/**
 * Declaration helpers for ERC-20 Approval Gas Sponsoring Extension
 *
 * These functions help facilitators advertise their support for
 * ERC-20 approval gas sponsoring in the /supported response and PaymentRequired.
 */

import { ERC20_APPROVAL_GAS_SPONSORING } from "./constants";
import { ERC20_APPROVAL_GAS_SPONSORING_SCHEMA } from "./schema";
import type { ERC20ApprovalGasSponsoringDeclaration } from "./types";

/**
 * Default description for the extension declaration
 */
const DEFAULT_DESCRIPTION =
  "The facilitator accepts a raw signed approval transaction and will sponsor the gas fees.";

/**
 * Creates an ERC-20 approval gas sponsoring extension declaration for facilitators.
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
 *   ...declareERC20ApprovalGasSponsoringExtension(),
 * };
 * ```
 */
export function declareERC20ApprovalGasSponsoringExtension(options?: {
  description?: string;
}): Record<string, ERC20ApprovalGasSponsoringDeclaration> {
  const description = options?.description ?? DEFAULT_DESCRIPTION;

  return {
    [ERC20_APPROVAL_GAS_SPONSORING]: {
      info: {
        description,
        version: "1",
      },
      schema: ERC20_APPROVAL_GAS_SPONSORING_SCHEMA,
    },
  };
}

/**
 * Checks if a facilitator supports ERC-20 approval gas sponsoring.
 *
 * @param extensions - Array of extension names from facilitator's /supported response
 * @returns true if ERC-20 approval gas sponsoring is supported
 *
 * @example
 * ```typescript
 * const supported = await facilitator.getSupported();
 * if (supportsERC20ApprovalGasSponsoring(supported.extensions)) {
 *   // Can use ERC-20 approval gas sponsoring
 * }
 * ```
 */
export function supportsERC20ApprovalGasSponsoring(extensions: string[]): boolean {
  return extensions.includes(ERC20_APPROVAL_GAS_SPONSORING);
}

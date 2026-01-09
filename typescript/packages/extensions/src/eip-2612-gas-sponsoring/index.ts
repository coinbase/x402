/**
 * EIP-2612 Gas Sponsoring Extension for x402
 *
 * Enables gasless approval to the Permit2 contract for tokens that
 * implement EIP-2612 (the `permit()` function).
 *
 * When this extension is active, the Facilitator agrees to accept an
 * off-chain EIP-2612 signature and submit it to the blockchain on the
 * user's behalf, paying the gas fees. This is executed atomically
 * with the settlement transaction via x402Permit2Proxy.settleWith2612().
 *
 * ## For Facilitators
 *
 * ```typescript
 * import {
 *   EIP2612_GAS_SPONSORING,
 *   declareEIP2612GasSponsoringExtension,
 *   extractEIP2612GasSponsoring,
 *   hasEIP2612GasSponsoring,
 * } from '@x402/extensions/eip-2612-gas-sponsoring';
 *
 * // Register extension support
 * facilitator.registerExtension(EIP2612_GAS_SPONSORING);
 *
 * // In verification/settlement, check for extension
 * if (hasEIP2612GasSponsoring(payload)) {
 *   const result = extractEIP2612GasSponsoring(payload, requirements);
 *   if (result.found && result.validation?.valid) {
 *     // Use result.info for x402Permit2Proxy.settleWith2612()
 *   }
 * }
 * ```
 *
 * ## For Clients (via mechanism)
 *
 * The mechanism (e.g., ExactEvmScheme) handles:
 * 1. Checking if facilitator supports this extension
 * 2. Checking if the token supports EIP-2612
 * 3. Creating the permit signature
 * 4. Including extension data in PaymentPayload.extensions
 *
 * @module
 */

// Constants
export {
  EIP2612_GAS_SPONSORING,
  CANONICAL_PERMIT2,
  MAX_UINT256,
  DEFAULT_PERMIT_VALIDITY_SECONDS,
  MIN_DEADLINE_BUFFER_SECONDS,
} from "./constants";

// Types
export type {
  EIP2612GasSponsoringInfo,
  EIP2612GasSponsoringDeclaration,
  EIP2612GasSponsoringDeclarationInfo,
  EIP2612GasSponsoringPayload,
  EIP2612GasSponsoringSchema,
} from "./types";

// Schemas
export { EIP2612_GAS_SPONSORING_SCHEMA, EIP2612_GAS_SPONSORING_DECLARATION_SCHEMA } from "./schema";

// Declaration (for facilitators)
export { declareEIP2612GasSponsoringExtension, supportsEIP2612GasSponsoring } from "./declaration";

// Validation
export type { ValidationResult } from "./validation";
export {
  validateEIP2612GasSponsoringSchema,
  validateEIP2612GasSponsoringInfo,
  validateEIP2612DomainRequirements,
} from "./validation";

// Extraction (for facilitators)
export type { ExtractionResult } from "./extraction";
export {
  extractEIP2612GasSponsoring,
  hasEIP2612GasSponsoring,
  extractValidEIP2612GasSponsoring,
} from "./extraction";

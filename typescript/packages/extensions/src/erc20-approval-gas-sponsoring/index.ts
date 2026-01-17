/**
 * ERC-20 Approval Gas Sponsoring Extension for x402
 *
 * Enables gasless ERC-20 approval for tokens that do NOT support EIP-2612.
 * This is the fallback mechanism for universal ERC-20 support.
 *
 * Because these tokens lack native gasless approvals:
 * - The Client signs a raw EVM transaction calling `approve(Permit2, amount)`
 * - The Facilitator agrees to:
 *   - Fund the Client's wallet with enough native gas token (if needed)
 *   - Broadcast the Client's signed approval transaction
 *   - Immediately perform settlement via x402Permit2Proxy
 *
 * This flow is executed using an atomic batch transaction to
 * mitigate front-running risks.
 *
 * ## For Facilitators
 *
 * ```typescript
 * import {
 *   ERC20_APPROVAL_GAS_SPONSORING,
 *   declareERC20ApprovalGasSponsoringExtension,
 *   extractERC20ApprovalGasSponsoring,
 *   hasERC20ApprovalGasSponsoring,
 * } from '@x402/extensions/erc20-approval-gas-sponsoring';
 *
 * // Register extension support
 * facilitator.registerExtension(ERC20_APPROVAL_GAS_SPONSORING);
 *
 * // In verification/settlement, check for extension
 * if (hasERC20ApprovalGasSponsoring(payload)) {
 *   const result = extractERC20ApprovalGasSponsoring(payload, requirements);
 *   if (result.found && result.validation?.valid) {
 *     // Use result.info for atomic batch settlement
 *   }
 * }
 * ```
 *
 * ## For Clients (via mechanism)
 *
 * The mechanism (e.g., ExactEvmScheme) handles:
 * 1. Checking if facilitator supports this extension
 * 2. Building and signing the approval transaction
 * 3. Including extension data in PaymentPayload.extensions
 *
 * @module
 */

// Constants
export {
  ERC20_APPROVAL_GAS_SPONSORING,
  CANONICAL_PERMIT2,
  MAX_UINT256,
  MIN_SIGNED_TX_HEX_LENGTH,
} from "./constants";

// Types
export type {
  ERC20ApprovalGasSponsoringInfo,
  ERC20ApprovalGasSponsoringDeclaration,
  ERC20ApprovalGasSponsoringDeclarationInfo,
  ERC20ApprovalGasSponsoringPayload,
  ERC20ApprovalGasSponsoringSchema,
} from "./types";

// Schemas
export {
  ERC20_APPROVAL_GAS_SPONSORING_SCHEMA,
  ERC20_APPROVAL_GAS_SPONSORING_DECLARATION_SCHEMA,
} from "./schema";

// Declaration (for facilitators)
export {
  declareERC20ApprovalGasSponsoringExtension,
  supportsERC20ApprovalGasSponsoring,
} from "./declaration";

// Validation
export type { ValidationResult } from "./validation";
export {
  validateERC20ApprovalGasSponsoringSchema,
  validateERC20ApprovalGasSponsoringInfo,
  validateSignedTransactionFormat,
} from "./validation";

// Extraction (for facilitators)
export type { ExtractionResult } from "./extraction";
export {
  extractERC20ApprovalGasSponsoring,
  hasERC20ApprovalGasSponsoring,
  extractValidERC20ApprovalGasSponsoring,
} from "./extraction";

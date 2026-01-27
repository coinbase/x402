// Shared extension utilities
export { WithExtensions } from "./types";

// Bazaar extension
export * from "./bazaar";
export { bazaarResourceServerExtension } from "./bazaar/server";

// Sign-in-with-x extension
export * from "./sign-in-with-x";

// EIP-2612 Gas Sponsoring extension
// Re-export selectively to avoid naming collisions with other extensions.
// For full API including ValidationResult/ExtractionResult types,
// import from "@x402/extensions/eip-2612-gas-sponsoring"
export {
  // Constants
  EIP2612_GAS_SPONSORING,
  CANONICAL_PERMIT2 as EIP2612_CANONICAL_PERMIT2,
  MAX_UINT256 as EIP2612_MAX_UINT256,
  DEFAULT_PERMIT_VALIDITY_SECONDS,
  MIN_DEADLINE_BUFFER_SECONDS,
  // Types
  type EIP2612GasSponsoringInfo,
  type EIP2612GasSponsoringDeclaration,
  type EIP2612GasSponsoringDeclarationInfo,
  type EIP2612GasSponsoringPayload,
  type EIP2612GasSponsoringSchema,
  // Schemas
  EIP2612_GAS_SPONSORING_SCHEMA,
  EIP2612_GAS_SPONSORING_DECLARATION_SCHEMA,
  // Declaration (for facilitators/servers)
  declareEIP2612GasSponsoringExtension,
  supportsEIP2612GasSponsoring,
  // Validation
  validateEIP2612GasSponsoringSchema,
  validateEIP2612GasSponsoringInfo,
  validateEIP2612DomainRequirements,
  // Extraction (for facilitators)
  extractEIP2612GasSponsoring,
  hasEIP2612GasSponsoring,
  extractValidEIP2612GasSponsoring,
} from "./eip-2612-gas-sponsoring";

// ERC-20 Approval Gas Sponsoring extension
// Re-export selectively to avoid naming collisions with other extensions.
// For full API including ValidationResult/ExtractionResult types,
// import from "@x402/extensions/erc20-approval-gas-sponsoring"
export {
  // Constants
  ERC20_APPROVAL_GAS_SPONSORING,
  CANONICAL_PERMIT2 as ERC20_CANONICAL_PERMIT2,
  MAX_UINT256 as ERC20_MAX_UINT256,
  MIN_SIGNED_TX_HEX_LENGTH,
  // Types
  type ERC20ApprovalGasSponsoringInfo,
  type ERC20ApprovalGasSponsoringDeclaration,
  type ERC20ApprovalGasSponsoringDeclarationInfo,
  type ERC20ApprovalGasSponsoringPayload,
  type ERC20ApprovalGasSponsoringSchema,
  // Schemas
  ERC20_APPROVAL_GAS_SPONSORING_SCHEMA,
  ERC20_APPROVAL_GAS_SPONSORING_DECLARATION_SCHEMA,
  // Declaration (for facilitators/servers)
  declareERC20ApprovalGasSponsoringExtension,
  supportsERC20ApprovalGasSponsoring,
  // Validation
  validateERC20ApprovalGasSponsoringSchema,
  validateERC20ApprovalGasSponsoringInfo,
  validateSignedTransactionFormat,
  // Extraction (for facilitators)
  extractERC20ApprovalGasSponsoring,
  hasERC20ApprovalGasSponsoring,
  extractValidERC20ApprovalGasSponsoring,
} from "./erc20-approval-gas-sponsoring";

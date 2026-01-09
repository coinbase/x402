/**
 * Type definitions for ERC-20 Approval Gas Sponsoring Extension
 */

/**
 * ERC-20 Approval Gas Sponsoring Extension Info
 *
 * This is what the client provides in PaymentPayload.extensions.erc20ApprovalGasSponsoring.info
 * when using ERC-20 approval gas sponsoring (for tokens without EIP-2612).
 */
export interface ERC20ApprovalGasSponsoringInfo {
  /** The address signing the approval transaction */
  from: string;
  /** The ERC-20 token contract address */
  asset: string;
  /** The address being approved (must be Canonical Permit2) */
  spender: string;
  /** Approval amount (typically MAX_UINT256) */
  amount: string;
  /** RLP-encoded signed transaction calling ERC20.approve() */
  signedTransaction: string;
  /** Extension version */
  version: "1";
}

/**
 * ERC-20 Approval Gas Sponsoring Declaration Info
 *
 * This is what facilitators advertise in their /supported response
 * and in PaymentRequired.extensions.erc20ApprovalGasSponsoring.info
 */
export interface ERC20ApprovalGasSponsoringDeclarationInfo {
  /** Human-readable description of the extension */
  description: string;
  /** Extension version */
  version: "1";
}

/**
 * ERC-20 Approval Gas Sponsoring Extension Declaration
 *
 * Full declaration structure for facilitators to advertise support.
 * Included in PaymentRequired.extensions.
 */
export interface ERC20ApprovalGasSponsoringDeclaration {
  info: ERC20ApprovalGasSponsoringDeclarationInfo;
  schema: ERC20ApprovalGasSponsoringSchema;
}

/**
 * Full extension structure in PaymentPayload.extensions
 */
export interface ERC20ApprovalGasSponsoringPayload {
  info: ERC20ApprovalGasSponsoringInfo;
}

/**
 * JSON Schema type for ERC-20 approval gas sponsoring info validation
 */
export interface ERC20ApprovalGasSponsoringSchema {
  $schema: "https://json-schema.org/draft/2020-12/schema";
  type: "object";
  properties: {
    from: { type: "string"; pattern: string; description: string };
    asset: { type: "string"; pattern: string; description: string };
    spender: { type: "string"; pattern: string; description: string };
    amount: { type: "string"; pattern: string; description: string };
    signedTransaction: { type: "string"; pattern: string; description: string };
    version: { type: "string"; const: "1"; description: string };
  };
  required: readonly ["from", "asset", "spender", "amount", "signedTransaction", "version"];
}

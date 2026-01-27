/**
 * Type definitions for EIP-2612 Gas Sponsoring Extension
 */

/**
 * EIP-2612 Gas Sponsoring Extension Info
 *
 * This is what the client provides in PaymentPayload.extensions.eip2612GasSponsoring.info
 * when using EIP-2612 gasless approval for Permit2.
 */
export interface EIP2612GasSponsoringInfo {
  /** The address signing the permit (token owner) */
  from: string;
  /** The ERC-20 token contract address */
  asset: string;
  /** The address being approved (must be Canonical Permit2) */
  spender: string;
  /** Approval amount (typically MAX_UINT256) */
  amount: string;
  /** EIP-2612 nonce from the token contract */
  nonce: string;
  /** Permit deadline timestamp (seconds since epoch) */
  deadline: string;
  /** The 65-byte EIP-2612 permit signature (r || s || v) */
  signature: string;
  /** Extension version */
  version: "1";
}

/**
 * EIP-2612 Gas Sponsoring Declaration Info
 *
 * This is what facilitators advertise in their /supported response
 * and in PaymentRequired.extensions.eip2612GasSponsoring.info
 */
export interface EIP2612GasSponsoringDeclarationInfo {
  /** Human-readable description of the extension */
  description: string;
  /** Extension version */
  version: "1";
}

/**
 * EIP-2612 Gas Sponsoring Extension Declaration
 *
 * Full declaration structure for facilitators to advertise support.
 * Included in PaymentRequired.extensions.
 */
export interface EIP2612GasSponsoringDeclaration {
  info: EIP2612GasSponsoringDeclarationInfo;
  schema: EIP2612GasSponsoringSchema;
}

/**
 * Full extension structure in PaymentPayload.extensions
 */
export interface EIP2612GasSponsoringPayload {
  info: EIP2612GasSponsoringInfo;
}

/**
 * JSON Schema type for EIP-2612 gas sponsoring info validation
 */
export interface EIP2612GasSponsoringSchema {
  $schema: "https://json-schema.org/draft/2020-12/schema";
  type: "object";
  properties: {
    from: { type: "string"; pattern: string; description: string };
    asset: { type: "string"; pattern: string; description: string };
    spender: { type: "string"; pattern: string; description: string };
    amount: { type: "string"; pattern: string; description: string };
    nonce: { type: "string"; pattern: string; description: string };
    deadline: { type: "string"; pattern: string; description: string };
    signature: { type: "string"; pattern: string; description: string };
    version: { type: "string"; const: "1"; description: string };
  };
  required: readonly [
    "from",
    "asset",
    "spender",
    "amount",
    "nonce",
    "deadline",
    "signature",
    "version",
  ];
}

/**
 * JSON Schemas for ERC-20 Approval Gas Sponsoring Extension validation
 */

import type { ERC20ApprovalGasSponsoringSchema } from "./types";

/**
 * JSON Schema for validating ERC-20 approval gas sponsoring extension info.
 * This schema defines what the client must provide in PaymentPayload.extensions.
 */
export const ERC20_APPROVAL_GAS_SPONSORING_SCHEMA: ERC20ApprovalGasSponsoringSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    from: {
      type: "string",
      pattern: "^0x[a-fA-F0-9]{40}$",
      description: "The address of the sender.",
    },
    asset: {
      type: "string",
      pattern: "^0x[a-fA-F0-9]{40}$",
      description: "The ERC-20 token contract address to approve.",
    },
    spender: {
      type: "string",
      pattern: "^0x[a-fA-F0-9]{40}$",
      description: "The address of the spender (must be Canonical Permit2).",
    },
    amount: {
      type: "string",
      pattern: "^[0-9]+$",
      description: "Approval amount (uint256). Typically MaxUint256.",
    },
    signedTransaction: {
      type: "string",
      pattern: "^0x[a-fA-F0-9]+$",
      description: "RLP-encoded signed transaction calling ERC20.approve().",
    },
    version: {
      type: "string",
      const: "1",
      description: "Extension version identifier.",
    },
  },
  required: ["from", "asset", "spender", "amount", "signedTransaction", "version"] as const,
};

/**
 * JSON Schema for validating the declaration (what facilitators advertise)
 */
export const ERC20_APPROVAL_GAS_SPONSORING_DECLARATION_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    info: {
      type: "object",
      properties: {
        description: { type: "string" },
        version: { type: "string", const: "1" },
      },
      required: ["description", "version"],
    },
    schema: { type: "object" },
  },
  required: ["info", "schema"],
} as const;

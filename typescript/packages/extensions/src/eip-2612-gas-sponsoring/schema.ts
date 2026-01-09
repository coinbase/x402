/**
 * JSON Schemas for EIP-2612 Gas Sponsoring Extension validation
 */

import type { EIP2612GasSponsoringSchema } from "./types";

/**
 * JSON Schema for validating EIP-2612 gas sponsoring extension info.
 * This schema defines what the client must provide in PaymentPayload.extensions.
 */
export const EIP2612_GAS_SPONSORING_SCHEMA: EIP2612GasSponsoringSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    from: {
      type: "string",
      pattern: "^0x[a-fA-F0-9]{40}$",
      description: "The address of the sender/owner.",
    },
    asset: {
      type: "string",
      pattern: "^0x[a-fA-F0-9]{40}$",
      description: "The address of the ERC-20 token contract.",
    },
    spender: {
      type: "string",
      pattern: "^0x[a-fA-F0-9]{40}$",
      description: "The address of the spender (must be Canonical Permit2).",
    },
    amount: {
      type: "string",
      pattern: "^[0-9]+$",
      description: "The amount to approve (uint256). Typically MaxUint256.",
    },
    nonce: {
      type: "string",
      pattern: "^[0-9]+$",
      description: "The current EIP-2612 nonce of the owner from the token contract.",
    },
    deadline: {
      type: "string",
      pattern: "^[0-9]+$",
      description: "The timestamp at which the permit expires (seconds since epoch).",
    },
    signature: {
      type: "string",
      pattern: "^0x[a-fA-F0-9]+$",
      description: "The 65-byte concatenated signature (r || s || v) as a hex string.",
    },
    version: {
      type: "string",
      const: "1",
      description: "Extension version identifier.",
    },
  },
  required: [
    "from",
    "asset",
    "spender",
    "amount",
    "nonce",
    "deadline",
    "signature",
    "version",
  ] as const,
};

/**
 * JSON Schema for validating the declaration (what facilitators advertise)
 */
export const EIP2612_GAS_SPONSORING_DECLARATION_SCHEMA = {
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

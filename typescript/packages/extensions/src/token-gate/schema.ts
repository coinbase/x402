/**
 * JSON Schema for token-gate proof validation
 */

/**
 * Build JSON Schema for TokenGateProof validation.
 *
 * @returns JSON Schema object for validating token-gate client proofs
 */
export function buildTokenGateSchema(): object {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      address: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
      domain: { type: "string" },
      issuedAt: { type: "string", format: "date-time" },
      signature: { type: "string", pattern: "^0x" },
    },
    required: ["address", "domain", "issuedAt", "signature"],
  };
}

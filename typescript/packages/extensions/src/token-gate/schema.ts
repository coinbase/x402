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
      address: { type: "string" },
      domain: { type: "string" },
      issuedAt: { type: "string", format: "date-time" },
      signature: { type: "string" },
      signatureType: { type: "string", enum: ["eip191", "ed25519"] },
    },
    required: ["address", "domain", "issuedAt", "signature", "signatureType"],
  };
}

/**
 * Facilitator Attestation Utilities
 *
 * Functions for creating and verifying facilitator settlement attestations.
 * Attestations prove that a facilitator executed a specific payment settlement.
 */

/// <reference lib="dom" />

import type {
  FacilitatorAttestation,
  FacilitatorAttestationConfig,
  FacilitatorSigner,
} from "./types";

// Use globalThis for cross-platform compatibility
const encoder = new globalThis.TextEncoder();

// ============================================================================
// Attestation Creation
// ============================================================================

/**
 * Parameters for creating a facilitator attestation
 */
export interface CreateAttestationParams {
  /**
   * CAIP-220 payment transaction reference
   */
  taskRef: string;

  /**
   * Amount in atomic units
   */
  settledAmount: string;

  /**
   * Token address/mint
   */
  settledAsset: string;

  /**
   * Recipient address
   */
  payTo: string;

  /**
   * Payer address
   */
  payer: string;

  /**
   * Unix timestamp of settlement (defaults to now)
   */
  settledAt?: number;
}

/**
 * Builds the attestation message for signing
 *
 * Message format:
 * keccak256(UTF8(taskRef) || UTF8(settledAmount) || UTF8(settledAsset) ||
 * UTF8(payTo) || UTF8(payer) || uint64BE(settledAt))
 *
 * @param params - Parameters for creating the attestation
 * @returns The concatenated message bytes ready for hashing
 */
export function buildAttestationMessage(params: CreateAttestationParams): Uint8Array {
  const settledAt = params.settledAt ?? Math.floor(Date.now() / 1000);

  // Concatenate all fields as UTF-8 bytes
  const taskRefBytes = encoder.encode(params.taskRef);
  const amountBytes = encoder.encode(params.settledAmount);
  const assetBytes = encoder.encode(params.settledAsset);
  const payToBytes = encoder.encode(params.payTo);
  const payerBytes = encoder.encode(params.payer);

  // settledAt as 8-byte big-endian
  const timestampBytes = new Uint8Array(8);
  const view = new DataView(timestampBytes.buffer);
  view.setBigUint64(0, BigInt(settledAt), false); // false = big-endian

  // Concatenate all
  const totalLength =
    taskRefBytes.length +
    amountBytes.length +
    assetBytes.length +
    payToBytes.length +
    payerBytes.length +
    timestampBytes.length;

  const message = new Uint8Array(totalLength);
  let offset = 0;

  message.set(taskRefBytes, offset);
  offset += taskRefBytes.length;
  message.set(amountBytes, offset);
  offset += amountBytes.length;
  message.set(assetBytes, offset);
  offset += assetBytes.length;
  message.set(payToBytes, offset);
  offset += payToBytes.length;
  message.set(payerBytes, offset);
  offset += payerBytes.length;
  message.set(timestampBytes, offset);

  return message;
}

/**
 * Hash the attestation message using keccak256
 *
 * Note: This uses a simple implementation. In production, you'd use
 * a proper keccak256 library like @noble/hashes or ethers.
 *
 * @param message - The message bytes to hash
 * @returns SHA-256 hash of the message as Uint8Array
 */
export async function hashAttestationMessage(message: Uint8Array): Promise<Uint8Array> {
  // Use SubtleCrypto SHA-256 as fallback
  // In production, you should use keccak256 from @noble/hashes
  // For now, we'll use SHA-256 which is available in all environments
  // TODO: Replace with keccak256 when integrating with x402/core dependencies
  // Note: We create a new ArrayBuffer to ensure compatibility with strict TypeScript settings
  const buffer = new ArrayBuffer(message.length);
  new Uint8Array(buffer).set(message);
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return new Uint8Array(hashBuffer);
}

/**
 * Creates a facilitator attestation for a settlement
 *
 * @param params - Settlement parameters to attest
 * @param config - Facilitator configuration with signing function
 * @returns Complete attestation object
 *
 * @example
 * ```typescript
 * const attestation = await createAttestation(
 *   {
 *     taskRef: "solana:5eykt4...:5A2CSREG...",
 *     settledAmount: "1000",
 *     settledAsset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
 *     payTo: "CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5",
 *     payer: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
 *   },
 *   {
 *     facilitatorId: "eip155:8453:0x8004F123...",
 *     sign: async (msg) => signWithPrivateKey(msg)
 *   }
 * );
 * ```
 */
export async function createAttestation(
  params: CreateAttestationParams,
  config: FacilitatorAttestationConfig,
): Promise<FacilitatorAttestation> {
  const settledAt = params.settledAt ?? Math.floor(Date.now() / 1000);

  // Build and hash the message
  const message = buildAttestationMessage({ ...params, settledAt });
  const hash = await hashAttestationMessage(message);

  // Sign the hash
  const signature = await config.sign(hash);

  return {
    facilitatorId: config.facilitatorId,
    settledAt,
    settledAmount: params.settledAmount,
    settledAsset: params.settledAsset,
    payTo: params.payTo,
    payer: params.payer,
    attestationSignature: signature,
  };
}

// ============================================================================
// Attestation Verification
// ============================================================================

/**
 * Parameters for verifying an attestation
 */
export interface VerifyAttestationParams {
  /**
   * The attestation to verify
   */
  attestation: FacilitatorAttestation;

  /**
   * Expected taskRef (from settlement response)
   */
  taskRef: string;

  /**
   * Valid signers from facilitator registration file
   */
  signers: FacilitatorSigner[];

  /**
   * Signature verification function
   * Should return true if signature is valid for the message and public key
   */
  verify: (
    message: Uint8Array,
    signature: string,
    publicKey: string,
    algorithm: string,
  ) => Promise<boolean>;
}

/**
 * Result of attestation verification
 */
export interface VerifyAttestationResult {
  valid: boolean;
  error?: string;
  signer?: FacilitatorSigner;
}

/**
 * Verifies a facilitator attestation
 *
 * @param params - Verification parameters
 * @returns Verification result with optional error message
 *
 * @example
 * ```typescript
 * const result = await verifyAttestation({
 *   attestation: settlementResponse.extensions["8004-reputation"].facilitatorAttestation,
 *   taskRef: "solana:5eykt4...:5A2CSREG...",
 *   signers: facilitatorRegistration.signers,
 *   verify: async (msg, sig, pubkey, algo) => ed25519.verify(sig, msg, pubkey)
 * });
 *
 * if (result.valid) {
 *   console.log("Attestation verified by:", result.signer?.comment);
 * }
 * ```
 */
export async function verifyAttestation(
  params: VerifyAttestationParams,
): Promise<VerifyAttestationResult> {
  const { attestation, taskRef, signers, verify } = params;

  // Filter for currently valid signers
  const now = Math.floor(Date.now() / 1000);
  const validSigners = signers.filter(
    s => s.validFrom <= now && (s.validUntil === null || s.validUntil > now),
  );

  if (validSigners.length === 0) {
    return { valid: false, error: "No valid signers found" };
  }

  // Reconstruct the message that was signed
  const message = buildAttestationMessage({
    taskRef,
    settledAmount: attestation.settledAmount,
    settledAsset: attestation.settledAsset,
    payTo: attestation.payTo,
    payer: attestation.payer,
    settledAt: attestation.settledAt,
  });
  const hash = await hashAttestationMessage(message);

  // Try each valid signer
  for (const signer of validSigners) {
    try {
      const isValid = await verify(
        hash,
        attestation.attestationSignature,
        signer.publicKey,
        signer.algorithm,
      );

      if (isValid) {
        return { valid: true, signer };
      }
    } catch {
      // Try next signer
      continue;
    }
  }

  return { valid: false, error: "Signature verification failed for all signers" };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extracts network from a CAIP-220 taskRef
 *
 * @param taskRef - CAIP-220 format: "{namespace}:{chainId}:{txHash}"
 * @returns CAIP-2 network identifier
 *
 * @example
 * ```typescript
 * const network = extractNetworkFromTaskRef("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:5A2CSREG...");
 * // Returns: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
 * ```
 */
export function extractNetworkFromTaskRef(taskRef: string): string {
  const parts = taskRef.split(":");
  if (parts.length < 3) {
    throw new Error(`Invalid taskRef format: ${taskRef}`);
  }
  return `${parts[0]}:${parts[1]}`;
}

/**
 * Extracts transaction hash from a CAIP-220 taskRef
 *
 * @param taskRef - CAIP-220 format: "{namespace}:{chainId}:{txHash}"
 * @returns Transaction hash/signature
 */
export function extractTxHashFromTaskRef(taskRef: string): string {
  const parts = taskRef.split(":");
  if (parts.length < 3) {
    throw new Error(`Invalid taskRef format: ${taskRef}`);
  }
  return parts.slice(2).join(":"); // Handle case where txHash might contain ":"
}

/**
 * Creates a CAIP-220 taskRef from components
 *
 * @param network - CAIP-2 network identifier
 * @param txHash - Transaction hash/signature
 * @returns CAIP-220 taskRef
 */
export function createTaskRef(network: string, txHash: string): string {
  return `${network}:${txHash}`;
}

/**
 * Validates that an attestation matches settlement data
 *
 * @param attestation - Attestation to validate
 * @param expected - Expected values from settlement
 * @param expected.payer - Expected payer address
 * @param expected.payTo - Expected recipient address
 * @param expected.amount - Expected settlement amount
 * @param expected.asset - Expected asset identifier
 * @returns true if attestation matches expected values
 */
export function validateAttestationData(
  attestation: FacilitatorAttestation,
  expected: {
    payer?: string;
    payTo?: string;
    amount?: string;
    asset?: string;
  },
): boolean {
  if (expected.payer && attestation.payer !== expected.payer) {
    return false;
  }
  if (expected.payTo && attestation.payTo !== expected.payTo) {
    return false;
  }
  if (expected.amount && attestation.settledAmount !== expected.amount) {
    return false;
  }
  if (expected.asset && attestation.settledAsset !== expected.asset) {
    return false;
  }
  return true;
}

/**
 * Converts attestation to hex-encoded string for transport
 *
 * @param attestation - The attestation to encode
 * @returns JSON string representation of the attestation
 */
export function encodeAttestation(attestation: FacilitatorAttestation): string {
  return JSON.stringify(attestation);
}

/**
 * Decodes attestation from string
 *
 * @param encoded - JSON string to decode
 * @returns Parsed FacilitatorAttestation object
 */
export function decodeAttestation(encoded: string): FacilitatorAttestation {
  return JSON.parse(encoded) as FacilitatorAttestation;
}

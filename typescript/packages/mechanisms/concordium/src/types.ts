/**
 * Concordium types for x402 payment protocol.
 */

/**
 * Concordium payment payload (V2).
 */
export interface ExactConcordiumPayloadV2 {
  [key: string]: unknown;
  /** Transaction hash */
  txHash: string;
  /** Sender address */
  sender: string;
  /** Asset symbol ("" for CCD, "EURR" for PLT) */
  asset?: string;
  /** Block hash */
  blockHash?: string;
}

/**
 * Concordium payment payload (V1 - legacy).
 */
export interface ExactConcordiumPayloadV1 {
  [key: string]: unknown;
  /** Transaction hash */
  txHash: string;
  /** Sender address */
  sender: string;
  /** Asset symbol ("" for CCD, "EURR" for PLT) */
  asset?: string;
}

/**
 * CAIP-2 network identifier.
 *
 * @example "ccd:9dd9ca4d19e9393877d2c44b70f89acb"
 */
export type ConcordiumNetwork = `ccd:${string}`;

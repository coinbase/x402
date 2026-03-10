/**
 * AVM (Algorand) Types for x402 Payment Protocol
 *
 * Defines payload structures and type guards for Algorand transactions.
 */

/**
 * V2 Payload for Algorand exact payment scheme
 *
 * Contains an atomic transaction group with a designated payment transaction.
 * Transactions are encoded as base64 msgpack.
 *
 * @example
 * ```typescript
 * const payload: ExactAvmPayloadV2 = {
 *   paymentGroup: [
 *     "gqNzaWfEQ...", // Fee payer transaction (signed by facilitator)
 *     "gqNzaWfEQ...", // ASA transfer (signed by client)
 *   ],
 *   paymentIndex: 1,  // Payment is the second transaction
 * };
 * ```
 */
export interface ExactAvmPayloadV2 {
  /**
   * Array of base64-encoded msgpack transactions forming an atomic group.
   * May include unsigned transactions (for fee payer) that the facilitator will sign.
   */
  paymentGroup: string[]

  /**
   * Zero-based index of the payment transaction within paymentGroup.
   * This transaction must be an ASA transfer to the payTo address.
   */
  paymentIndex: number
}

/**
 * V1 Payload for Algorand exact payment scheme (backward compatibility)
 *
 * Same structure as V2 for Algorand.
 */
export type ExactAvmPayloadV1 = ExactAvmPayloadV2

/**
 * Type guard to check if a payload is an ExactAvmPayloadV2
 *
 * @param payload - The payload to check
 * @returns True if the payload is a valid ExactAvmPayloadV2
 */
export function isExactAvmPayload(payload: unknown): payload is ExactAvmPayloadV2 {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'paymentGroup' in payload &&
    'paymentIndex' in payload &&
    Array.isArray((payload as ExactAvmPayloadV2).paymentGroup) &&
    typeof (payload as ExactAvmPayloadV2).paymentIndex === 'number' &&
    (payload as ExactAvmPayloadV2).paymentGroup.every(item => typeof item === 'string')
  )
}

/**
 * Decoded Algorand transaction information
 * Used internally for verification
 */
export interface DecodedTransaction {
  /**
   * Transaction type (e.g., "pay" for payment, "axfer" for asset transfer)
   */
  type: string

  /**
   * Sender address
   */
  sender: string

  /**
   * Transaction fee in microAlgos
   */
  fee: number

  /**
   * First valid round
   */
  firstValid: number

  /**
   * Last valid round
   */
  lastValid: number

  /**
   * Genesis hash (base64)
   */
  genesisHash: string

  /**
   * Genesis ID (optional)
   */
  genesisId?: string

  /**
   * Note field (optional, base64)
   */
  note?: string

  /**
   * Lease (optional, base64)
   */
  lease?: string

  /**
   * Rekey address (optional)
   */
  rekeyTo?: string

  /**
   * Group ID (optional, base64)
   */
  group?: string

  // Payment-specific fields (type === "pay")

  /**
   * Receiver address for payment transactions
   */
  receiver?: string

  /**
   * Amount in microAlgos for payment transactions
   */
  amount?: number

  /**
   * Close remainder to address (optional)
   */
  closeRemainderTo?: string

  // Asset transfer-specific fields (type === "axfer")

  /**
   * Asset ID for asset transfer transactions
   */
  assetIndex?: number

  /**
   * Asset receiver address
   */
  assetReceiver?: string

  /**
   * Asset amount (in asset's smallest unit)
   */
  assetAmount?: bigint

  /**
   * Asset close to address (optional)
   */
  assetCloseTo?: string

  /**
   * Asset sender (for clawback, optional)
   */
  assetSender?: string
}

/**
 * Decoded signed transaction
 */
export interface DecodedSignedTransaction {
  /**
   * The decoded transaction
   */
  txn: DecodedTransaction

  /**
   * Ed25519 signature (optional, 64 bytes, base64)
   */
  sig?: string

  /**
   * Multisig metadata (optional)
   */
  msig?: {
    version: number
    threshold: number
    subsigs: Array<{
      pk: string
      s?: string
    }>
  }

  /**
   * Logic signature (optional)
   */
  lsig?: {
    l: string
    arg?: string[]
    sig?: string
    msig?: {
      version: number
      threshold: number
      subsigs: Array<{
        pk: string
        s?: string
      }>
    }
  }

  /**
   * Whether this transaction needs to be signed by the facilitator
   */
  needsFacilitatorSignature?: boolean
}

/**
 * Verification result for a single transaction
 */
export interface TransactionVerificationResult {
  /**
   * Whether the transaction passed verification
   */
  valid: boolean

  /**
   * Error message if verification failed
   */
  error?: string

  /**
   * Transaction index in the group
   */
  index: number
}

/**
 * Verification result for the entire payment group
 */
export interface PaymentGroupVerificationResult {
  /**
   * Whether the entire group passed verification
   */
  valid: boolean

  /**
   * Error message if verification failed
   */
  error?: string

  /**
   * Individual transaction verification results
   */
  transactions: TransactionVerificationResult[]
}

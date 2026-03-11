/**
 * AVM Facilitator Scheme for Exact Payment Protocol
 *
 * Verifies and settles Algorand ASA transfer payments.
 */

import {
  decodeTransaction as decodeUnsignedTxn,
  decodeSignedTransaction as decodeSignedTxn,
  encodeTransactionRaw,
  encodeSignedTransaction,
  bytesForSigning,
} from '@algorandfoundation/algokit-utils/transact'
import type { Transaction, SignedTransaction } from '@algorandfoundation/algokit-utils/transact'
import { ed25519Verifier } from '@algorandfoundation/algokit-utils/crypto'
import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
} from '@x402/core/types'
import type { FacilitatorAvmSigner } from '../../signer'
import type { ExactAvmPayloadV2 } from '../../types'
import { isExactAvmPayload } from '../../types'
import { decodeTransaction, hasSignature } from '../../utils'
import { MAX_ATOMIC_GROUP_SIZE, MAX_REASONABLE_FEE } from '../../constants'

/**
 * Verification error reasons
 */
export const VerifyErrorReason = {
  INVALID_PAYLOAD_FORMAT: 'Invalid payload format',
  GROUP_SIZE_EXCEEDED: 'Transaction group exceeds maximum size',
  INVALID_PAYMENT_INDEX: 'Payment index out of bounds',
  INVALID_TRANSACTION: 'Invalid transaction encoding',
  INVALID_GROUP_ID: 'Transactions have inconsistent group IDs',
  PAYMENT_NOT_ASSET_TRANSFER: 'Payment transaction is not an asset transfer',
  AMOUNT_MISMATCH: 'Payment amount does not match requirements',
  RECEIVER_MISMATCH: 'Payment receiver does not match payTo address',
  ASSET_MISMATCH: 'Payment asset does not match requirements',
  INVALID_FEE_PAYER: 'Fee payer transaction has invalid parameters',
  FEE_TOO_HIGH: 'Fee payer transaction fee exceeds maximum',
  PAYMENT_NOT_SIGNED: 'Payment transaction is not signed',
  INVALID_SIGNATURE: 'Payment transaction signature does not match sender',
  SIMULATION_FAILED: 'Transaction simulation failed',
  FACILITATOR_TRANSFERRING_FUNDS: 'Facilitator signer cannot be the payment sender',
  GENESIS_HASH_MISMATCH: 'Transaction genesis hash does not match expected network',
  // Security error reasons
  UNSIGNED_NON_FACILITATOR_TXN: 'Unsigned transaction from non-facilitator address',
  SECURITY_REKEY_NOT_ALLOWED: 'Rekey transactions are not allowed',
  SECURITY_CLOSE_TO_NOT_ALLOWED: 'Close-to transactions are not allowed',
  SECURITY_KEYREG_NOT_ALLOWED: 'Key registration transactions are not allowed',
} as const

/**
 * AVM facilitator implementation for the Exact payment scheme.
 *
 * Verifies atomic transaction groups and settles ASA transfers for x402 payments.
 * Supports gasless transactions by signing fee payer transactions.
 */
export class ExactAvmScheme implements SchemeNetworkFacilitator {
  readonly scheme = 'exact'
  readonly caipFamily = 'algorand:*'

  /**
   * Creates a new ExactAvmScheme facilitator instance.
   *
   * @param signer - The AVM signer for facilitator operations
   */
  constructor(private readonly signer: FacilitatorAvmSigner) {}

  /**
   * Get mechanism-specific extra data for the supported kinds endpoint.
   * For AVM, returns the feePayer address for gasless transactions.
   *
   * @param _ - The network identifier (unused, feePayer is network-agnostic)
   * @returns Extra data with feePayer address
   */
  getExtra(_: string): Record<string, unknown> | undefined {
    const addresses = this.signer.getAddresses()
    if (addresses.length === 0) {
      return undefined
    }

    // Random selection distributes ALGO fee costs across multiple signer accounts,
    // preventing any single fee payer from being depleted faster than others.
    const randomIndex = Math.floor(Math.random() * addresses.length)
    return { feePayer: addresses[randomIndex] }
  }

  /**
   * Get signer addresses used by this facilitator.
   * Returns all addresses this facilitator can use for signing fee payer transactions.
   *
   * @param _ - The network identifier (unused, addresses are network-agnostic)
   * @returns Array of facilitator wallet addresses
   */
  getSigners(_: string): string[] {
    return [...this.signer.getAddresses()]
  }

  /**
   * Verifies a payment payload.
   *
   * Verification steps:
   * 1. Validate payload format and structure
   * 2. Decode and validate transaction group
   * 3. Apply security constraints
   * 4. Verify payment transaction (amount, receiver, asset)
   * 5. Prepare signed group (verify + sign fee payers)
   * 6. Simulate transaction group
   *
   * @param payload - The payment payload to verify
   * @param requirements - The payment requirements
   * @returns Promise resolving to verification response
   */
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    const rawPayload = payload.payload as unknown

    if (!isExactAvmPayload(rawPayload)) {
      return { isValid: false, invalidReason: VerifyErrorReason.INVALID_PAYLOAD_FORMAT }
    }

    const { paymentGroup, paymentIndex } = rawPayload as ExactAvmPayloadV2

    if (paymentGroup.length > MAX_ATOMIC_GROUP_SIZE) {
      return { isValid: false, invalidReason: VerifyErrorReason.GROUP_SIZE_EXCEEDED }
    }
    if (paymentIndex < 0 || paymentIndex >= paymentGroup.length) {
      return { isValid: false, invalidReason: VerifyErrorReason.INVALID_PAYMENT_INDEX }
    }

    const facilitatorAddresses = this.signer.getAddresses()

    // Decode all transactions and validate group structure
    const decoded = this.decodeTransactionGroup(paymentGroup, facilitatorAddresses)
    if ('error' in decoded) return decoded.error

    // Extract payer from payment transaction
    const paymentTxn = decoded.txns[paymentIndex].txn
    const payer = paymentTxn.sender.toString()

    // Validate genesis hash matches network
    const networkStr = String(requirements.network)
    if (networkStr.startsWith('algorand:')) {
      const expectedGenesisHash = networkStr.slice('algorand:'.length)
      for (const stxn of decoded.txns) {
        const txnGenesisHash = stxn.txn.genesisHash
          ? Buffer.from(stxn.txn.genesisHash).toString('base64')
          : ''
        if (txnGenesisHash !== expectedGenesisHash) {
          return { isValid: false, invalidReason: VerifyErrorReason.GENESIS_HASH_MISMATCH }
        }
      }
    }

    // SECURITY: Verify facilitator's signers are not transferring their own funds
    if (facilitatorAddresses.includes(payer)) {
      return { isValid: false, invalidReason: VerifyErrorReason.FACILITATOR_TRANSFERRING_FUNDS }
    }

    // Security constraints on all transactions
    const securityCheck = this.verifySecurityConstraints(decoded.txns)
    if (!securityCheck.isValid) return securityCheck

    // Payment transaction correctness
    const paymentCheck = await this.verifyPaymentTransaction(
      decoded.txns[paymentIndex],
      requirements,
      paymentGroup[paymentIndex],
    )
    if (!paymentCheck.isValid) return paymentCheck

    // Verify fee payers and sign them for simulation
    const prepared = await this.prepareSignedGroup(decoded.txns, paymentGroup)
    if ('error' in prepared) return prepared.error

    // Simulate the assembled group
    const simResult = await this.simulateTransactionGroup(prepared.signedTxns, requirements.network)
    if (!simResult.isValid) return simResult

    return { isValid: true, payer }
  }

  /**
   * Settles a payment by submitting the transaction group.
   *
   * Settlement steps:
   * 1. Verify the payment first
   * 2. Sign fee payer transactions
   * 3. Submit transaction group
   * 4. Return transaction ID
   *
   * Note: Algorand has instant finality, so no confirmation wait is needed.
   *
   * @param payload - The payment payload to settle
   * @param requirements - The payment requirements
   * @returns Promise resolving to settlement response
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    // First verify the payment
    const verification = await this.verify(payload, requirements)
    if (!verification.isValid) {
      return {
        success: false,
        errorReason: verification.invalidReason,
        transaction: '',
        network: requirements.network,
        payer: verification.payer,
      }
    }

    const avmPayload = payload.payload as unknown as ExactAvmPayloadV2
    const { paymentGroup, paymentIndex } = avmPayload

    // Decode and sign transactions (handles both signed and unsigned for fee abstraction)
    const facilitatorAddresses = this.signer.getAddresses()
    const signedTxns: Uint8Array[] = []

    for (let i = 0; i < paymentGroup.length; i++) {
      const txnBytes = decodeTransaction(paymentGroup[i])

      // Try to decode as signed, fall back to unsigned for fee payer transactions
      let txn: Transaction
      let isAlreadySigned = false
      try {
        const stxn = decodeSignedTxn(txnBytes)
        // Validate the decode produced a valid signed transaction.
        // algokit-utils decodeSignedTransaction is lenient and may succeed on raw unsigned
        // bytes, returning a transaction with type "unknown" and missing fields.
        if (!stxn.txn.type || stxn.txn.type === 'unknown') {
          throw new Error('Invalid signed transaction: missing type')
        }
        txn = stxn.txn
        isAlreadySigned =
          stxn.sig !== undefined || stxn.lsig !== undefined || stxn.msig !== undefined
      } catch {
        txn = decodeUnsignedTxn(txnBytes)
        isAlreadySigned = false
      }

      const sender = txn.sender.toString()

      if (facilitatorAddresses.includes(sender)) {
        // Sign fee payer transaction
        const unsignedTxn = encodeTransactionRaw(txn)
        const signedTxn = await this.signer.signTransaction(unsignedTxn, sender)
        signedTxns.push(signedTxn)
      } else if (isAlreadySigned) {
        // Use the already-signed transaction
        signedTxns.push(txnBytes)
      } else {
        // Transaction needs signing but we're not the sender - this shouldn't happen
        return {
          success: false,
          errorReason: `Transaction at index ${i} is unsigned but sender ${sender} is not a facilitator address`,
          transaction: '',
          network: requirements.network,
        }
      }
    }

    // Submit transaction group
    try {
      await this.signer.sendTransactions(signedTxns, requirements.network)

      // Get the payment transaction ID
      const paymentTxnBytes = signedTxns[paymentIndex]
      const paymentStxn = decodeSignedTxn(paymentTxnBytes)
      const paymentTxId = paymentStxn.txn.txId()

      return {
        success: true,
        transaction: paymentTxId,
        network: requirements.network,
        payer: verification.payer,
      }
    } catch (error) {
      return {
        success: false,
        errorReason: `Failed to submit transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
        transaction: '',
        network: requirements.network,
        payer: verification.payer,
      }
    }
  }

  /**
   * Decodes all transactions in the group and validates structure.
   *
   * - Signed transactions are decoded as-is
   * - Unsigned transactions are only accepted from facilitator addresses (fee payers)
   * - Verifies group ID consistency across all transactions
   *
   * @param paymentGroup - Array of base64-encoded transaction strings
   * @param facilitatorAddresses - Addresses controlled by this facilitator
   * @returns Decoded transactions or an error response
   */
  private decodeTransactionGroup(
    paymentGroup: string[],
    facilitatorAddresses: readonly string[],
  ): { txns: SignedTransaction[] } | { error: VerifyResponse } {
    const txns: SignedTransaction[] = []

    for (let i = 0; i < paymentGroup.length; i++) {
      try {
        const bytes = decodeTransaction(paymentGroup[i])

        try {
          const stxn = decodeSignedTxn(bytes)
          // Validate that decoding actually produced a valid signed transaction.
          // algokit-utils decodeSignedTransaction is lenient and may succeed on raw unsigned
          // bytes, returning a transaction with type "unknown" and missing fields.
          if (!stxn.txn.type || stxn.txn.type === 'unknown') {
            throw new Error('Invalid signed transaction: missing type')
          }
          txns.push(stxn)
        } catch {
          // Unsigned transaction — only the facilitator's fee payer txn should be unsigned
          const unsignedTxn = decodeUnsignedTxn(bytes)
          const sender = unsignedTxn.sender.toString()

          if (!facilitatorAddresses.includes(sender)) {
            return {
              error: {
                isValid: false,
                invalidReason: `${VerifyErrorReason.UNSIGNED_NON_FACILITATOR_TXN}: transaction at index ${i} from ${sender}`,
              },
            }
          }

          // Wrap unsigned txn for simulation (empty signature)
          const encodedForSimulate = encodeSignedTransaction({ txn: unsignedTxn })
          txns.push(decodeSignedTxn(encodedForSimulate))
        }
      } catch {
        return {
          error: {
            isValid: false,
            invalidReason: `${VerifyErrorReason.INVALID_TRANSACTION}: Failed to decode transaction at index ${i}`,
          },
        }
      }
    }

    // Verify group ID consistency
    if (txns.length > 1) {
      const firstGroup = txns[0].txn.group
      const firstGroupId = firstGroup ? Buffer.from(firstGroup).toString('base64') : null

      for (let i = 1; i < txns.length; i++) {
        const group = txns[i].txn.group
        const groupId = group ? Buffer.from(group).toString('base64') : null
        if (groupId !== firstGroupId) {
          return {
            error: { isValid: false, invalidReason: VerifyErrorReason.INVALID_GROUP_ID },
          }
        }
      }
    }

    return { txns }
  }

  /**
   * Verifies fee payer transactions and signs them, returning the assembled group
   * ready for simulation or submission.
   *
   * @param decodedTxns - Decoded signed transaction objects
   * @param paymentGroup - Original base64-encoded transaction strings
   * @returns Signed transaction bytes or an error response
   */
  private async prepareSignedGroup(
    decodedTxns: SignedTransaction[],
    paymentGroup: string[],
  ): Promise<{ signedTxns: Uint8Array[] } | { error: VerifyResponse }> {
    const facilitatorAddresses = this.signer.getAddresses()
    const signedTxns: Uint8Array[] = []

    for (let i = 0; i < decodedTxns.length; i++) {
      const txn = decodedTxns[i].txn
      const sender = txn.sender.toString()

      if (facilitatorAddresses.includes(sender)) {
        const feeCheck = this.verifyFeePayerTransaction(txn)
        if (!feeCheck.isValid) return { error: feeCheck }

        try {
          const signedTxn = await this.signer.signTransaction(encodeTransactionRaw(txn), sender)
          signedTxns.push(signedTxn)
        } catch (error) {
          return {
            error: {
              isValid: false,
              invalidReason: `Failed to sign fee payer transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          }
        }
      } else {
        signedTxns.push(decodeTransaction(paymentGroup[i]))
      }
    }

    return { signedTxns }
  }

  /**
   * Simulates the transaction group and returns the verification result.
   *
   * @param signedTxns - Signed transaction bytes to simulate
   * @param network - Target network for simulation
   * @returns Verification result from simulation
   */
  private async simulateTransactionGroup(
    signedTxns: Uint8Array[],
    network: Network,
  ): Promise<VerifyResponse> {
    try {
      const simResult = (await this.signer.simulateTransactions(signedTxns, network)) as {
        txnGroups?: Array<{ failureMessage?: string }>
      }

      if (simResult.txnGroups?.[0]?.failureMessage) {
        return {
          isValid: false,
          invalidReason: `${VerifyErrorReason.SIMULATION_FAILED}: ${simResult.txnGroups[0].failureMessage}`,
        }
      }

      return { isValid: true }
    } catch (error) {
      return {
        isValid: false,
        invalidReason: `${VerifyErrorReason.SIMULATION_FAILED}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  /**
   * Verifies the payment transaction matches requirements
   *
   * @param stxn - The signed payment transaction
   * @param requirements - Payment requirements to verify against
   * @param encodedTxn - Base64-encoded transaction for signature check
   * @returns Verification result
   */
  private async verifyPaymentTransaction(
    stxn: SignedTransaction,
    requirements: PaymentRequirements,
    encodedTxn: string,
  ): Promise<VerifyResponse> {
    const txn = stxn.txn

    // Must be an asset transfer
    if (txn.type !== 'axfer') {
      return {
        isValid: false,
        invalidReason: VerifyErrorReason.PAYMENT_NOT_ASSET_TRANSFER,
      }
    }

    // Access asset transfer properties — properly typed in algokit-utils v10
    const assetTransfer = txn.assetTransfer

    if (!assetTransfer) {
      return {
        isValid: false,
        invalidReason: `${VerifyErrorReason.PAYMENT_NOT_ASSET_TRANSFER}: missing assetTransfer data`,
      }
    }

    // Use BigInt comparison to avoid string format mismatches (e.g. "1000" vs "1000.0")
    const amount = assetTransfer.amount ?? BigInt(0)

    if (amount !== BigInt(requirements.amount)) {
      return {
        isValid: false,
        invalidReason: `${VerifyErrorReason.AMOUNT_MISMATCH}: expected ${requirements.amount}, got ${amount.toString()}`,
      }
    }

    // Verify receiver address matches payTo
    const receiver = assetTransfer.receiver ? assetTransfer.receiver.toString() : ''

    if (receiver !== requirements.payTo) {
      return {
        isValid: false,
        invalidReason: `${VerifyErrorReason.RECEIVER_MISMATCH}: expected ${requirements.payTo}, got ${receiver}`,
      }
    }

    // Verify asset
    const assetId = assetTransfer.assetId?.toString() ?? ''

    if (assetId !== requirements.asset) {
      return {
        isValid: false,
        invalidReason: `${VerifyErrorReason.ASSET_MISMATCH}: expected ${requirements.asset}, got ${assetId}`,
      }
    }

    // Verify signature exists
    const txnBytes = decodeTransaction(encodedTxn)
    if (!hasSignature(txnBytes)) {
      return {
        isValid: false,
        invalidReason: VerifyErrorReason.PAYMENT_NOT_SIGNED,
      }
    }

    // Verify the ed25519 signature was actually made by the sender
    if (stxn.sig) {
      const signedMsg = bytesForSigning.transaction(txn)
      const isValidSig = await ed25519Verifier(stxn.sig, signedMsg, txn.sender.publicKey)
      if (!isValidSig) {
        return {
          isValid: false,
          invalidReason: VerifyErrorReason.INVALID_SIGNATURE,
        }
      }
    }

    return { isValid: true }
  }

  /**
   * Verifies a fee payer transaction is safe to sign
   *
   * @param txn - The fee payer transaction to validate
   * @returns Verification result
   */
  private verifyFeePayerTransaction(txn: Transaction): VerifyResponse {
    // Must be a payment transaction (for fee payment)
    if (txn.type !== 'pay') {
      return {
        isValid: false,
        invalidReason: `${VerifyErrorReason.INVALID_FEE_PAYER}: expected payment transaction, got ${txn.type}`,
      }
    }

    // Access payment fields — properly typed in algokit-utils v10
    const paymentFields = txn.payment

    // Must have zero amount (self-payment for fee coverage)
    const payAmount = paymentFields?.amount ?? BigInt(0)
    if (payAmount > BigInt(0)) {
      return {
        isValid: false,
        invalidReason: `${VerifyErrorReason.INVALID_FEE_PAYER}: amount must be 0`,
      }
    }

    // Must be self-payment (receiver == sender)
    if (paymentFields?.receiver) {
      const receiverAddr = paymentFields.receiver.toString()
      const senderAddr = txn.sender.toString()
      if (receiverAddr !== senderAddr) {
        return {
          isValid: false,
          invalidReason: `${VerifyErrorReason.INVALID_FEE_PAYER}: receiver must be same as sender (self-payment)`,
        }
      }
    }

    // Must not have close remainder to
    if (paymentFields?.closeRemainderTo) {
      return {
        isValid: false,
        invalidReason: `${VerifyErrorReason.INVALID_FEE_PAYER}: closeRemainderTo not allowed`,
      }
    }

    // Must not have rekey to
    if (txn.rekeyTo) {
      return {
        isValid: false,
        invalidReason: `${VerifyErrorReason.INVALID_FEE_PAYER}: rekeyTo not allowed`,
      }
    }

    // Fee must be reasonable
    const fee = Number(txn.fee ?? 0)
    if (fee > MAX_REASONABLE_FEE) {
      return {
        isValid: false,
        invalidReason: `${VerifyErrorReason.FEE_TOO_HIGH}: ${fee} exceeds maximum ${MAX_REASONABLE_FEE}`,
      }
    }

    return { isValid: true }
  }

  /**
   * Verifies security constraints for ALL transactions in the group.
   *
   * Security checks:
   * 1. No keyreg (key registration) transactions allowed
   * 2. No rekey transactions allowed
   * 3. No close-to or close-remainder-to fields allowed on any transaction
   *
   * @param txns - Signed transactions to check for security violations
   * @returns Verification result
   */
  private verifySecurityConstraints(txns: SignedTransaction[]): VerifyResponse {
    for (let i = 0; i < txns.length; i++) {
      const txn = txns[i].txn

      // Check for keyreg transaction type - not allowed
      if (txn.type === 'keyreg') {
        return {
          isValid: false,
          invalidReason: `${VerifyErrorReason.SECURITY_KEYREG_NOT_ALLOWED}: Transaction at index ${i} is a key registration transaction`,
        }
      }

      // Check for rekey - not allowed on any transaction
      if (txn.rekeyTo) {
        return {
          isValid: false,
          invalidReason: `${VerifyErrorReason.SECURITY_REKEY_NOT_ALLOWED}: Transaction at index ${i} has rekeyTo set`,
        }
      }

      // Check for close-to fields based on transaction type
      // These are dangerous as they can drain accounts

      // For payment transactions - check CloseRemainderTo
      if (txn.type === 'pay') {
        if (txn.payment?.closeRemainderTo) {
          return {
            isValid: false,
            invalidReason: `${VerifyErrorReason.SECURITY_CLOSE_TO_NOT_ALLOWED}: Transaction at index ${i} has CloseRemainderTo set`,
          }
        }
      }

      // For asset transfer transactions - check AssetCloseTo
      if (txn.type === 'axfer') {
        if (txn.assetTransfer?.closeRemainderTo) {
          return {
            isValid: false,
            invalidReason: `${VerifyErrorReason.SECURITY_CLOSE_TO_NOT_ALLOWED}: Transaction at index ${i} has AssetCloseTo set`,
          }
        }
      }
    }

    return { isValid: true }
  }
}

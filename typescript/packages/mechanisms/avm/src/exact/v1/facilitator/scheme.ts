/**
 * AVM Facilitator Scheme V1 for Exact Payment Protocol (Backward Compatibility)
 *
 * Provides V1 API compatibility for Algorand ASA transfer verification and settlement.
 */

import {
  decodeSignedTransaction as decodeSignedTxn,
} from '@algorandfoundation/algokit-utils/transact'
import type { SignedTransaction } from '@algorandfoundation/algokit-utils/transact'
import type {
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
  Network,
} from '@x402/core/types'
import type { FacilitatorAvmSigner } from '../../../signer'
import type { ExactAvmPayloadV1 } from '../../../types'
import { isExactAvmPayload } from '../../../types'
import { decodeTransaction, hasSignature, v1ToCaip2 } from '../../../utils'
import { MAX_ATOMIC_GROUP_SIZE } from '../../../constants'

/**
 * AVM facilitator implementation for the Exact payment scheme (V1).
 *
 * Provides backward compatibility with V1 x402 API.
 */
export class ExactAvmSchemeV1 implements SchemeNetworkFacilitator {
  readonly scheme = 'exact'
  readonly caipFamily = 'algorand:*'

  /**
   * Creates a new ExactAvmSchemeV1 facilitator instance.
   *
   * @param signer - The AVM signer for facilitator operations
   */
  constructor(private readonly signer: FacilitatorAvmSigner) {}

  /**
   * Get mechanism-specific extra data for the supported kinds endpoint.
   *
   * @param _ - The network identifier (unused)
   * @returns Extra data with feePayer address
   */
  getExtra(_: string): Record<string, unknown> | undefined {
    const addresses = this.signer.getAddresses()
    if (addresses.length === 0) {
      return undefined
    }
    const randomIndex = Math.floor(Math.random() * addresses.length)
    return { feePayer: addresses[randomIndex] }
  }

  /**
   * Get signer addresses used by this facilitator.
   *
   * @param _ - The network identifier (unused)
   * @returns Array of facilitator wallet addresses
   */
  getSigners(_: string): string[] {
    return [...this.signer.getAddresses()]
  }

  /**
   * Verifies a V1 payment payload.
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
      return {
        isValid: false,
        invalidReason: 'Invalid payload format',
      }
    }

    const avmPayload = rawPayload as ExactAvmPayloadV1
    const { paymentGroup, paymentIndex } = avmPayload

    if (paymentGroup.length > MAX_ATOMIC_GROUP_SIZE) {
      return {
        isValid: false,
        invalidReason: 'Transaction group exceeds maximum size',
      }
    }

    if (paymentIndex < 0 || paymentIndex >= paymentGroup.length) {
      return {
        isValid: false,
        invalidReason: 'Payment index out of bounds',
      }
    }

    // Decode payment transaction
    let paymentTxn: SignedTransaction
    try {
      const txnBytes = decodeTransaction(paymentGroup[paymentIndex])
      paymentTxn = decodeSignedTxn(txnBytes)
    } catch (error) {
      return {
        isValid: false,
        invalidReason: `Invalid transaction encoding: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }

    const txn = paymentTxn.txn

    // Verify it's an asset transfer
    if (txn.type !== 'axfer') {
      return {
        isValid: false,
        invalidReason: 'Payment transaction is not an asset transfer',
      }
    }

    // Verify amount (V1 uses maxAmountRequired)
    const assetTransfer = txn.assetTransfer
    const amount = (assetTransfer?.amount ?? BigInt(0)).toString()
    const requiredAmount =
      (requirements as { maxAmountRequired?: string }).maxAmountRequired ?? requirements.amount
    if (amount !== requiredAmount) {
      return {
        isValid: false,
        invalidReason: `Amount mismatch: expected ${requiredAmount}, got ${amount}`,
      }
    }

    // Verify receiver
    const receiver = assetTransfer?.receiver ? assetTransfer.receiver.toString() : ''
    if (receiver !== requirements.payTo) {
      return {
        isValid: false,
        invalidReason: `Receiver mismatch: expected ${requirements.payTo}, got ${receiver}`,
      }
    }

    // Verify asset
    const assetId = assetTransfer?.assetId?.toString() ?? ''
    if (assetId !== requirements.asset) {
      return {
        isValid: false,
        invalidReason: `Asset mismatch: expected ${requirements.asset}, got ${assetId}`,
      }
    }

    // Verify signature
    const txnBytes = decodeTransaction(paymentGroup[paymentIndex])
    if (!hasSignature(txnBytes)) {
      return {
        isValid: false,
        invalidReason: 'Payment transaction is not signed',
      }
    }

    return { isValid: true }
  }

  /**
   * Settles a V1 payment.
   *
   * @param payload - The payment payload to settle
   * @param requirements - The payment requirements
   * @returns Promise resolving to settlement response
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const verification = await this.verify(payload, requirements)
    if (!verification.isValid) {
      return {
        success: false,
        errorReason: verification.invalidReason,
        transaction: '',
        network: requirements.network,
      }
    }

    const avmPayload = payload.payload as unknown as ExactAvmPayloadV1
    const { paymentGroup, paymentIndex } = avmPayload

    // Convert V1 network to CAIP-2
    const caip2Network = v1ToCaip2(requirements.network as string) as Network

    // Decode signed transactions
    const signedTxns = paymentGroup.map(encoded => decodeTransaction(encoded))

    try {
      await this.signer.sendTransactions(signedTxns, caip2Network)

      // Get payment transaction ID
      const paymentStxn = decodeSignedTxn(signedTxns[paymentIndex])
      const paymentTxId = paymentStxn.txn.txId()

      return {
        success: true,
        transaction: paymentTxId,
        network: requirements.network,
      }
    } catch (error) {
      return {
        success: false,
        errorReason: `Failed to submit transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
        transaction: '',
        network: requirements.network,
      }
    }
  }
}

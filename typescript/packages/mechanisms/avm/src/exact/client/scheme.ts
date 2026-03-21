/**
 * AVM Client Scheme for Exact Payment Protocol
 *
 * Creates atomic transaction groups for Algorand ASA transfers.
 * Uses AlgorandClient and TransactionComposer from algokit-utils v10
 * for transaction construction, fee pooling, and group management.
 */

import { AlgorandClient } from '@algorandfoundation/algokit-utils/algorand-client'
import {
  encodeTransactionRaw,
  makeEmptyTransactionSigner,
} from '@algorandfoundation/algokit-utils/transact'
import { microAlgo, transactionFees } from '@algorandfoundation/algokit-utils/amount'
import type {
  PaymentRequirements,
  SchemeNetworkClient,
  PaymentPayloadResult,
} from '@x402/core/types'
import type { ClientAvmSigner, ClientAvmConfig } from '../../signer'
import type { ExactAvmPayloadV2 } from '../../types'
import { encodeTransaction } from '../../utils'
import { USDC_CONFIG } from '../../constants'
import { isTestnetNetwork } from '../../utils'

/**
 * AVM client implementation for the Exact payment scheme.
 *
 * Creates atomic transaction groups with ASA transfers for x402 payments.
 * Supports optional fee payer transactions for gasless payments.
 */
export class ExactAvmScheme implements SchemeNetworkClient {
  readonly scheme = 'exact'

  /**
   * Creates a new ExactAvmScheme instance.
   *
   * @param signer - The AVM signer for client operations
   * @param config - Optional configuration for Algod client
   */
  constructor(
    private readonly signer: ClientAvmSigner,
    private readonly config?: ClientAvmConfig,
  ) {}

  /**
   * Creates or retrieves an AlgorandClient for the given network.
   *
   * @param network - Network identifier (CAIP-2 or V1 format)
   * @returns AlgorandClient instance
   */
  private getAlgorandClient(network: string): AlgorandClient {
    if (this.config?.algorandClient) {
      return this.config.algorandClient
    }
    if (this.config?.algodUrl) {
      return AlgorandClient.fromConfig({
        algodConfig: {
          server: this.config.algodUrl,
          token: this.config.algodToken ?? '',
        },
      })
    }
    // Auto-detect network
    return isTestnetNetwork(network) ? AlgorandClient.testNet() : AlgorandClient.mainNet()
  }

  /**
   * Creates a payment payload for the Exact scheme.
   *
   * Constructs an atomic transaction group with:
   * - Optional fee payer transaction (if feePayer specified in requirements.extra)
   * - ASA transfer transaction to payTo address
   *
   * Uses TransactionComposer for automatic suggested params, group ID assignment,
   * and fee pooling.
   *
   * @param x402Version - The x402 protocol version
   * @param paymentRequirements - The payment requirements
   * @returns Promise resolving to a payment payload result
   */
  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
  ): Promise<PaymentPayloadResult> {
    const { amount, asset, payTo, network, extra } = paymentRequirements

    const algorandClient = this.getAlgorandClient(network)

    // Get asset ID (from requirements or default USDC)
    const assetId = this.getAssetId(asset, network)

    // Get fee payer address from extra if provided
    const feePayer = extra?.feePayer as string | undefined

    // Calculate total transaction count for fee pooling
    const totalTxnCount = feePayer ? 2 : 1
    let paymentIndex = 0

    // Use an empty signer for building — we sign manually after
    // (fee payer txns stay unsigned for the facilitator to sign)
    const emptySigner = makeEmptyTransactionSigner()

    // Build the transaction group using TransactionComposer
    const composer = algorandClient.newGroup()

    if (feePayer) {
      composer.addPayment({
        sender: feePayer,
        receiver: feePayer,
        amount: microAlgo(0),
        staticFee: transactionFees(totalTxnCount),
        note: `x402-fee-payer-${Date.now()}`,
        signer: emptySigner,
      })
      paymentIndex = 1
    }

    composer.addAssetTransfer({
      sender: this.signer.address,
      receiver: payTo,
      assetId: BigInt(assetId),
      amount: BigInt(amount),
      staticFee: feePayer ? microAlgo(0) : undefined, // 0 fee when fee payer covers
      note: `x402-payment-v${x402Version}-${Date.now()}`,
      signer: emptySigner,
    })

    // Build transactions with automatic grouping (assigns group ID, suggested params, etc.)
    // Note: build() handles group ID assignment, unlike buildTransactions() which skips grouping
    const built = await composer.build()
    const transactions = built.transactions.map(tws => tws.txn)

    // Encode all transactions to raw bytes
    const encodedTxns = transactions.map(txn => encodeTransactionRaw(txn))

    // Determine which transactions the client should sign
    const clientIndexes = transactions
      .map((txn, i) => (txn.sender.toString() === this.signer.address ? i : -1))
      .filter(i => i !== -1)

    // Log transaction details for debugging
    console.log('[x402 AVM Client] Creating payment:', {
      sender: this.signer.address,
      receiver: payTo,
      amount: amount,
      assetId,
      network,
      clientIndexes,
      txnCount: transactions.length,
      hasFeePayer: !!feePayer,
    })

    // Sign client's transactions
    const signedTxns = await this.signer.signTransactions(encodedTxns, clientIndexes)

    // Log signing result
    console.log('[x402 AVM Client] Signed transactions:', {
      signedCount: signedTxns.filter(t => t !== null).length,
      totalCount: signedTxns.length,
      signedIndexes: signedTxns.map((t, i) => (t !== null ? i : -1)).filter(i => i !== -1),
    })

    // Build payment group with signed/unsigned transactions
    const paymentGroup: string[] = encodedTxns.map((txnBytes, i) => {
      const signedTxn = signedTxns[i]
      if (signedTxn) {
        return encodeTransaction(signedTxn)
      }
      // Return unsigned transaction for facilitator to sign
      return encodeTransaction(txnBytes)
    })

    const payload: ExactAvmPayloadV2 = {
      paymentGroup,
      paymentIndex,
    }

    return {
      x402Version,
      payload: payload as unknown as Record<string, unknown>,
    }
  }

  /**
   * Gets the asset ID from the requirements or defaults to USDC
   *
   * @param asset - Asset identifier from requirements
   * @param network - Network identifier
   * @returns Asset ID as string
   */
  private getAssetId(asset: string, network: string): string {
    // If asset is already a numeric string, use it directly
    if (/^\d+$/.test(asset)) {
      return asset
    }

    // Try to get from USDC config
    const usdcConfig = USDC_CONFIG[network]
    if (usdcConfig) {
      return usdcConfig.asaId
    }

    // Default to the asset as-is (might be an ASA ID)
    return asset
  }
}

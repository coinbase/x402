/**
 * @module @x402/avm - x402 Payment Protocol AVM (Algorand) Implementation
 *
 * This module provides the Algorand-specific implementation of the x402 payment protocol.
 *
 * @example Client signer:
 * ```typescript
 * import { toClientAvmSigner } from "@x402/avm";
 *
 * const signer = toClientAvmSigner(process.env.AVM_PRIVATE_KEY!);
 * ```
 *
 * @example Facilitator signer:
 * ```typescript
 * import { toFacilitatorAvmSigner } from "@x402/avm";
 *
 * const signer = toFacilitatorAvmSigner(process.env.AVM_PRIVATE_KEY!);
 * ```
 */

// Exact scheme client
export { ExactAvmScheme } from './exact'

// Signer helpers and interfaces
export { isAvmSignerWallet, toClientAvmSigner, toFacilitatorAvmSigner } from './signer'
export type {
  ClientAvmSigner,
  ClientAvmConfig,
  FacilitatorAvmSigner,
  FacilitatorAvmSignerConfig,
} from './signer'

// Types
export type {
  ExactAvmPayloadV1,
  ExactAvmPayloadV2,
  DecodedTransaction,
  DecodedSignedTransaction,
  TransactionVerificationResult,
  PaymentGroupVerificationResult,
} from './types'
export { isExactAvmPayload } from './types'

// Constants
export {
  // CAIP-2 Network Identifiers
  ALGORAND_MAINNET_CAIP2,
  ALGORAND_TESTNET_CAIP2,
  CAIP2_NETWORKS,
  // Genesis Hashes
  ALGORAND_MAINNET_GENESIS_HASH,
  ALGORAND_TESTNET_GENESIS_HASH,
  // V1 Network Identifiers
  V1_ALGORAND_MAINNET,
  V1_ALGORAND_TESTNET,
  V1_NETWORKS,
  V1_TO_CAIP2,
  CAIP2_TO_V1,
  // USDC Configuration
  USDC_MAINNET_ASA_ID,
  USDC_TESTNET_ASA_ID,
  USDC_DECIMALS,
  USDC_CONFIG,
  // Algod Endpoints
  DEFAULT_ALGOD_MAINNET,
  DEFAULT_ALGOD_TESTNET,
  NETWORK_TO_ALGOD,
  // Transaction Limits
  MAX_ATOMIC_GROUP_SIZE,
  MIN_TXN_FEE,
  MAX_REASONABLE_FEE,
  // Address Validation
  ALGORAND_ADDRESS_REGEX,
  ALGORAND_ADDRESS_LENGTH,
} from './constants'

// Utilities
export {
  createAlgodClient,
  encodeTransaction,
  decodeTransaction,
  decodeSignedTransaction,
  decodeUnsignedTransaction,
  isValidAlgorandAddress,
  getSenderFromTransaction,
  convertToTokenAmount,
  convertFromTokenAmount,
  getNetworkFromCaip2,
  isAlgorandNetwork,
  isTestnetNetwork,
  v1ToCaip2,
  caip2ToV1,
  getGenesisHashFromTransaction,
  validateGroupId,
  assignGroupId,
  getTransactionId,
  hasSignature,
} from './utils'

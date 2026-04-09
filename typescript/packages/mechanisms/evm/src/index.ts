/**
 * @module @x402/evm - x402 Payment Protocol EVM Implementation
 *
 * This module provides the EVM-specific implementation of the x402 payment protocol.
 */

// Exact scheme client
export { ExactEvmScheme } from "./exact";
export {
  createPermit2ApprovalTx,
  getPermit2AllowanceReadParams,
  erc20AllowanceAbi,
  type Permit2AllowanceParams,
} from "./exact/client";

// Signers
export { toClientEvmSigner, toFacilitatorEvmSigner } from "./signer";
export type { ClientEvmSigner, FacilitatorEvmSigner } from "./signer";

// Types
export type {
  AssetTransferMethod,
  ExactEIP3009Payload,
  ExactPermit2Payload,
  ExactEvmPayloadV1,
  ExactEvmPayloadV2,
  Permit2Witness,
  Permit2Authorization,
} from "./types";
export { isPermit2Payload, isEIP3009Payload } from "./types";

// Upto scheme client
export { UptoEvmScheme } from "./upto";

// Upto types
export type { UptoPermit2Payload, UptoPermit2Witness, UptoPermit2Authorization } from "./types";
export { isUptoPermit2Payload } from "./types";

// Batch-settlement (deferred) scheme client
export { DeferredEvmScheme } from "./deferred";

// Batch-settlement types
export type {
  ChannelConfig,
  DeferredDepositPayload,
  DeferredVoucherPayload,
  DeferredVoucherFields,
  DeferredErc3009Authorization,
  DeferredClaimPayload,
  DeferredClaimWithSignaturePayload,
  DeferredSettleActionPayload,
  DeferredDepositSettlePayload,
  DeferredCooperativeWithdrawPayload,
  DeferredCooperativeWithdrawWithSignaturePayload,
  DeferredVoucherClaim,
  DeferredPayload,
  DeferredSettlePayload,
} from "./types";
export {
  isDeferredDepositPayload,
  isDeferredVoucherPayload,
  isDeferredClaimPayload,
  isDeferredClaimWithSignaturePayload,
  isDeferredSettleActionPayload,
  isDeferredDepositSettlePayload,
  isDeferredCooperativeWithdrawPayload,
  isDeferredCooperativeWithdrawWithSignaturePayload,
} from "./types";

// Batch-settlement constants
export {
  BATCH_SETTLEMENT_ADDRESS,
  BATCH_SETTLEMENT_DOMAIN,
  voucherTypes,
  cooperativeWithdrawTypes,
  claimBatchTypes,
} from "./deferred/constants";

// Default stablecoins (USD string pricing → token address per chain)
export { getDefaultAsset } from "./shared/defaultAssets";
export type { DefaultAssetInfo, ExactDefaultAssetInfo } from "./shared/defaultAssets";

// Constants
export {
  PERMIT2_ADDRESS,
  x402ExactPermit2ProxyAddress,
  x402UptoPermit2ProxyAddress,
  permit2WitnessTypes,
  uptoPermit2WitnessTypes,
  authorizationTypes,
  eip3009ABI,
  x402ExactPermit2ProxyABI,
  x402UptoPermit2ProxyABI,
} from "./constants";

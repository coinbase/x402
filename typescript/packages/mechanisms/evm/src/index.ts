/**
 * @module @x402/evm - x402 Payment Protocol EVM Implementation
 *
 * This module provides the EVM-specific implementation of the x402 payment protocol.
 */

// Export EVM implementation modules here
// The actual implementation logic will be added by copying from the core/src/schemes/evm folder

export { ExactEvmScheme } from "./exact";
export { toClientEvmSigner, toFacilitatorEvmSigner } from "./signer";
export type { ClientEvmSigner, FacilitatorEvmSigner } from "./signer";

// Export types for ERC-7710 and other payload types
export type {
  ExactEIP3009Payload,
  ExactERC7710Payload,
  ExactEvmPayloadV1,
  ExactEvmPayloadV2,
  AssetTransferMethod,
  ERC7710PaymentParams,
  ERC7710PaymentDelegation,
  ERC7710PaymentProvider,
} from "./types";
export { isEIP3009Payload, isERC7710Payload } from "./types";

// Export ERC-7710 client types
export type { ExactEvmSchemeClientConfig } from "./exact/client";

// Export constants for ERC-7710
export {
  delegationManagerABI,
  erc20TransferABI,
  ERC7579_SINGLE_CALL_MODE,
} from "./constants";

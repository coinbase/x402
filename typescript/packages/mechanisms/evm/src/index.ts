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

// Export types
export type {
  AssetTransferMethod,
  ExactEIP3009Payload,
  ExactPermit2Payload,
  Permit2Authorization,
  Permit2Witness,
  EIP2612PermitParams,
  ExactEvmPayloadV1,
  ExactEvmPayloadV2,
} from "./types";
export { isPermit2Payload, isEIP3009Payload } from "./types";

// Export constants
export {
  authorizationTypes,
  permit2WitnessTypes,
  eip2612PermitTypes,
  x402Permit2ProxyAddress,
  PERMIT2_ADDRESS,
  x402Permit2ProxyABI,
  eip3009ABI,
} from "./constants";

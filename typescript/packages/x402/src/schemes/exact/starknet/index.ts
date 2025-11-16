/**
 * Starknet Exact Scheme Exports
 *
 * This module exports the Starknet implementation for the x402 exact scheme,
 * providing all necessary functions and types for Starknet payment processing.
 */

// Export client functions
export {
  createPaymentHeader,
  createAndSignPayment,
  prepareStarknetPayment,
  signStarknetPayment,
  validateStarknetPaymentRequirements,
  type StarknetClientConfig,
} from "./client";

// Re-export shared Starknet components
export {
  // Provider
  StarknetPaymentProvider,
  PaymentVerificationError,
  PaymentSettlementError,
  createPaymentHeader as createStarknetPaymentHeader,
} from "../../../shared/starknet/provider";

// Client utilities
export {
  createStarknetConnectedClient,
  type StarknetConnectedClient,
} from "../../../shared/starknet/client";

// Wallet types
export { type StarknetSigner, isStarknetSigner } from "../../../shared/starknet/wallet";

// Transfer utilities
export {
  type StarknetTransferAuthorization,
  signTransferAuthorization,
  verifyTransferAuthorization,
  executeTransferWithAuthorization,
  createX402PaymentPayload,
} from "../../../shared/starknet/x402-transfers";

// Account contract support
export {
  X402RateLimiter,
  supportsX402,
  createX402AccountContract,
  type X402AccountInterface,
  type SessionKeyPermissions,
} from "../../../shared/starknet/account-contract";

// USDC utilities
export {
  getUsdcContractAddress,
  getUsdcBalance,
  transferUsdc,
  approveUsdc,
} from "../../../shared/starknet/usdc";

// NOTE: State management exports removed - x402 is stateless by design
// Replay protection happens at the blockchain level, not via server-side state

// Facilitator
export {
  X402StarknetFacilitator,
  createStarknetFacilitator,
  createStarknetFacilitatorMiddleware,
  createStandardStarknetPaymentRequirements,
} from "../../../shared/starknet/facilitator";

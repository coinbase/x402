/**
 * Named error reason constants for the upto EVM facilitator.
 *
 * Shared Permit2 errors are re-exported from exact/facilitator/errors.ts.
 * Upto-specific errors are defined here.
 *
 * These strings must be character-for-character identical to the Go constants
 * to maintain cross-SDK parity.
 */

// Re-export shared EVM errors
export { ErrAssetNotDeployedContract } from "../../exact/facilitator/errors";

// Re-export shared Permit2 errors
export {
  ErrPermit2InvalidSpender,
  ErrPermit2RecipientMismatch,
  ErrPermit2DeadlineExpired,
  ErrPermit2NotYetValid,
  ErrPermit2AmountMismatch,
  ErrPermit2TokenMismatch,
  ErrPermit2InvalidSignature,
  ErrPermit2AllowanceRequired,
  ErrPermit2InvalidAmount,
  ErrPermit2InvalidDestination,
  ErrPermit2InvalidOwner,
  ErrPermit2PaymentTooEarly,
  ErrPermit2InvalidNonce,
  ErrPermit2612AmountMismatch,
  ErrErc20ApprovalInvalidFormat,
  ErrErc20ApprovalFromMismatch,
  ErrErc20ApprovalAssetMismatch,
  ErrErc20ApprovalSpenderNotPermit2,
  ErrErc20ApprovalTxWrongTarget,
  ErrErc20ApprovalTxWrongSelector,
  ErrErc20ApprovalTxWrongSpender,
  ErrErc20ApprovalTxInvalidCalldata,
  ErrErc20ApprovalTxSignerMismatch,
  ErrErc20ApprovalTxInvalidSignature,
  ErrErc20ApprovalTxFailed,
  ErrErc20ApprovalBroadcastFailed,
  ErrErc20ApprovalTxParseFailed,
} from "../../exact/facilitator/errors";

// Upto-specific errors
export const ErrUptoTransactionFailed = "invalid_upto_evm_transaction_failed";
export const ErrUptoInvalidScheme = "invalid_upto_evm_scheme";
export const ErrUptoNetworkMismatch = "invalid_upto_evm_network_mismatch";
export const ErrUptoInvalidPayload = "invalid_upto_evm_payload";
export const ErrUptoPendingMismatch = "invalid_upto_evm_pending_mismatch";
export const ErrUptoSettlementExceedsAmount = "invalid_upto_evm_payload_settlement_exceeds_amount";
export const ErrUptoAmountExceedsPermitted = "upto_amount_exceeds_permitted";
export const ErrUptoUnauthorizedFacilitator = "upto_unauthorized_facilitator";
export const ErrUptoFacilitatorMismatch = "upto_facilitator_mismatch";
export const ErrUptoEip3009MissingDomain = "invalid_upto_evm_eip3009_missing_domain";
export const ErrUptoEip3009ReceiverMismatch = "invalid_upto_evm_eip3009_receiver_mismatch";
export const ErrUptoEip3009AmountMismatch = "invalid_upto_evm_eip3009_amount_mismatch";
export const ErrUptoEip3009RecipientMismatch = "invalid_upto_evm_eip3009_recipient_mismatch";
export const ErrUptoEip3009SettlerMismatch = "invalid_upto_evm_eip3009_settler_mismatch";
export const ErrUptoEip3009NonceMismatch = "invalid_upto_evm_eip3009_nonce_mismatch";
export const ErrUptoEip3009ValidBefore = "invalid_upto_evm_eip3009_valid_before";
export const ErrUptoEip3009ValidAfter = "invalid_upto_evm_eip3009_valid_after";
export const ErrUptoEip3009NonceAlreadyUsed = "invalid_upto_evm_eip3009_nonce_already_used";
export const ErrUptoEip3009InsufficientBalance = "invalid_upto_evm_eip3009_insufficient_balance";
export const ErrUptoEip3009InvalidSignature = "invalid_upto_evm_eip3009_signature";
export const ErrUptoEip3009SimulationFailed = "invalid_upto_evm_eip3009_simulation_failed";

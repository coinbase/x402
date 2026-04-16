/** Facilitator error codes for the batched EVM scheme. */

export const ErrChannelNotFound = "batch_settlement_evm_channel_not_found";
export const ErrWithdrawalPending = "batch_settlement_evm_withdrawal_pending";
export const ErrTokenMismatch = "batch_settlement_evm_token_mismatch";
export const ErrInvalidVoucherSignature = "batch_settlement_evm_invalid_voucher_signature";
export const ErrCumulativeExceedsBalance = "batch_settlement_evm_cumulative_exceeds_balance";
export const ErrCumulativeAmountBelowClaimed = "batch_settlement_evm_cumulative_below_claimed";
export const ErrInsufficientBalance = "batch_settlement_evm_insufficient_balance";
export const ErrDepositTransactionFailed = "batch_settlement_evm_deposit_transaction_failed";
export const ErrClaimTransactionFailed = "batch_settlement_evm_claim_transaction_failed";
export const ErrSettleTransactionFailed = "batch_settlement_evm_settle_transaction_failed";
export const ErrInvalidScheme = "batch_settlement_evm_invalid_scheme";
export const ErrNetworkMismatch = "batch_settlement_evm_network_mismatch";
export const ErrDepositVoucherMismatch = "batch_settlement_evm_deposit_voucher_mismatch";
export const ErrMissingEip712Domain = "batch_settlement_evm_missing_eip712_domain";
export const ErrValidBeforeExpired = "batch_settlement_evm_payload_authorization_valid_before";
export const ErrValidAfterInFuture = "batch_settlement_evm_payload_authorization_valid_after";
export const ErrInvalidReceiveAuthorizationSignature =
  "batch_settlement_evm_invalid_receive_authorization_signature";
export const ErrErc3009AuthorizationRequired =
  "batch_settlement_evm_erc3009_authorization_required";
export const ErrRefundTransactionFailed = "batch_settlement_evm_refund_transaction_failed";
export const ErrInvalidPayloadType = "batch_settlement_evm_invalid_payload_type";
export const ErrWithdrawDelayOutOfRange = "batch_settlement_evm_withdraw_delay_out_of_range";
export const ErrChannelIdMismatch = "batch_settlement_evm_channel_id_mismatch";
export const ErrReceiverMismatch = "batch_settlement_evm_receiver_mismatch";
export const ErrReceiverAuthorizerMismatch = "batch_settlement_evm_receiver_authorizer_mismatch";
export const ErrWithdrawDelayMismatch = "batch_settlement_evm_withdraw_delay_mismatch";

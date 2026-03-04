/**
 * Named error reason constants for the exact EVM facilitator.
 *
 * These strings must be character-for-character identical to the Go constants in
 * go/mechanisms/evm/exact/facilitator/errors.go to maintain cross-SDK parity.
 */

// EIP-3009 verify errors
export const ErrInvalidScheme = "invalid_exact_evm_scheme";
export const ErrNetworkMismatch = "invalid_exact_evm_network_mismatch";

// Permit2 verify errors
export const ErrPermit2InvalidSpender = "invalid_permit2_spender";
export const ErrPermit2RecipientMismatch = "invalid_permit2_recipient_mismatch";
export const ErrPermit2DeadlineExpired = "permit2_deadline_expired";
export const ErrPermit2NotYetValid = "permit2_not_yet_valid";
export const ErrPermit2InsufficientAmount = "permit2_insufficient_amount";
export const ErrPermit2TokenMismatch = "permit2_token_mismatch";
export const ErrPermit2InvalidSignature = "invalid_permit2_signature";
export const ErrPermit2AllowanceRequired = "permit2_allowance_required";

// Permit2 settle errors (from contract reverts)
export const ErrPermit2InvalidAmount = "permit2_invalid_amount";
export const ErrPermit2InvalidDestination = "permit2_invalid_destination";
export const ErrPermit2InvalidOwner = "permit2_invalid_owner";
export const ErrPermit2PaymentTooEarly = "permit2_payment_too_early";
export const ErrPermit2InvalidNonce = "permit2_invalid_nonce";
export const ErrPermit2612AmountMismatch = "permit2_2612_amount_mismatch";

// ERC-20 approval gas sponsoring verify errors
export const ErrErc20ApprovalInvalidFormat = "invalid_erc20_approval_extension_format";
export const ErrErc20ApprovalFromMismatch = "erc20_approval_from_mismatch";
export const ErrErc20ApprovalAssetMismatch = "erc20_approval_asset_mismatch";
export const ErrErc20ApprovalSpenderNotPermit2 = "erc20_approval_spender_not_permit2";
export const ErrErc20ApprovalTxWrongTarget = "erc20_approval_tx_wrong_target";
export const ErrErc20ApprovalTxWrongSelector = "erc20_approval_tx_wrong_selector";
export const ErrErc20ApprovalTxWrongSpender = "erc20_approval_tx_wrong_spender";
export const ErrErc20ApprovalTxInvalidCalldata = "erc20_approval_tx_invalid_calldata";
export const ErrErc20ApprovalTxSignerMismatch = "erc20_approval_tx_signer_mismatch";
export const ErrErc20ApprovalTxInvalidSignature = "erc20_approval_tx_invalid_signature";
export const ErrErc20ApprovalTxParseFailed = "erc20_approval_tx_parse_failed";

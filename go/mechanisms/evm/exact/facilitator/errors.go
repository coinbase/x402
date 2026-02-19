package facilitator

// Facilitator error constants for the exact EVM scheme
const (
	// EIP-3009 Verify errors
	ErrInvalidScheme             = "invalid_exact_evm_scheme"
	ErrNetworkMismatch           = "invalid_exact_evm_network_mismatch"
	ErrInvalidPayload            = "invalid_exact_evm_payload"
	ErrMissingSignature          = "invalid_exact_evm_payload_missing_signature"
	ErrFailedToGetNetworkConfig  = "invalid_exact_evm_failed_to_get_network_config"
	ErrFailedToGetAssetInfo      = "invalid_exact_evm_failed_to_get_asset_info"
	ErrRecipientMismatch         = "invalid_exact_evm_recipient_mismatch"
	ErrInvalidAuthorizationValue = "invalid_exact_evm_authorization_value"
	ErrInvalidRequiredAmount     = "invalid_exact_evm_required_amount"
	ErrInsufficientAmount        = "invalid_exact_evm_insufficient_amount"
	ErrFailedToCheckNonce        = "invalid_exact_evm_failed_to_check_nonce"
	ErrNonceAlreadyUsed          = "invalid_exact_evm_nonce_already_used"
	ErrFailedToGetBalance        = "invalid_exact_evm_failed_to_get_balance"
	ErrInsufficientBalance       = "invalid_exact_evm_insufficient_balance"
	ErrInvalidSignatureFormat    = "invalid_exact_evm_signature_format"
	ErrFailedToVerifySignature   = "invalid_exact_evm_failed_to_verify_signature"
	ErrInvalidSignature          = "invalid_exact_evm_signature"
	ErrValidBeforeExpired        = "invalid_exact_evm_payload_authorization_valid_before"
	ErrValidAfterInFuture        = "invalid_exact_evm_payload_authorization_valid_after"

	// EIP-3009 Settle errors
	ErrVerificationFailed      = "invalid_exact_evm_verification_failed"
	ErrFailedToParseSignature  = "invalid_exact_evm_failed_to_parse_signature"
	ErrFailedToCheckDeployment = "invalid_exact_evm_failed_to_check_deployment"
	ErrFailedToExecuteTransfer = "invalid_exact_evm_failed_to_execute_transfer"
	ErrFailedToGetReceipt      = "invalid_exact_evm_failed_to_get_receipt"
	ErrTransactionFailed       = "invalid_exact_evm_transaction_failed"

	// Smart wallet errors (shared by EIP-3009 and Permit2)
	ErrUndeployedSmartWallet       = "invalid_exact_evm_payload_undeployed_smart_wallet"
	ErrSmartWalletDeploymentFailed = "smart_wallet_deployment_failed"
	ErrUnsupportedPayloadType      = "unsupported_payload_type"

	// Permit2 verify errors
	ErrPermit2InvalidSpender     = "invalid_permit2_spender"
	ErrPermit2RecipientMismatch  = "invalid_permit2_recipient_mismatch"
	ErrPermit2DeadlineExpired    = "permit2_deadline_expired"
	ErrPermit2NotYetValid        = "permit2_not_yet_valid"
	ErrPermit2InsufficientAmount = "permit2_insufficient_amount"
	ErrPermit2TokenMismatch      = "permit2_token_mismatch"
	ErrPermit2InvalidSignature   = "invalid_permit2_signature"
	ErrPermit2AllowanceRequired  = "permit2_allowance_required"

	// Permit2 settle errors (from contract reverts)
	ErrPermit2AmountExceedsPermitted = "permit2_amount_exceeds_permitted"
	ErrPermit2InvalidDestination     = "permit2_invalid_destination"
	ErrPermit2InvalidOwner           = "permit2_invalid_owner"
	ErrPermit2PaymentTooEarly        = "permit2_payment_too_early"
	ErrPermit2InvalidNonce           = "permit2_invalid_nonce"

	// ERC-20 Approval Gas Sponsoring errors
	ErrErc20GasSponsoringNotConfigured = "erc20_gas_sponsoring_not_configured"
	ErrErc20InvalidSignedTx            = "erc20_invalid_signed_transaction"
	ErrErc20SignerMismatch             = "erc20_signer_mismatch"
	ErrErc20TokenMismatch              = "erc20_token_mismatch"
	ErrErc20SpenderNotPermit2          = "erc20_spender_not_permit2"
	ErrErc20InvalidCalldata            = "erc20_invalid_calldata"
)

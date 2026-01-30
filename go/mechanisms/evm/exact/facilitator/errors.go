package facilitator

// Facilitator error constants for the exact EVM scheme
const (
	// Verify errors
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

	// Settle errors
	ErrVerificationFailed      = "invalid_exact_evm_verification_failed"
	ErrFailedToParseSignature  = "invalid_exact_evm_failed_to_parse_signature"
	ErrFailedToCheckDeployment = "invalid_exact_evm_failed_to_check_deployment"
	ErrFailedToExecuteTransfer = "invalid_exact_evm_failed_to_execute_transfer"
	ErrFailedToGetReceipt      = "invalid_exact_evm_failed_to_get_receipt"
	ErrTransactionFailed       = "invalid_exact_evm_transaction_failed"
)

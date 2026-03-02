package facilitator

// ERC-4337 facilitator error constants
const (
	ErrMissingUserOperation = "erc4337_missing_user_operation"
	ErrMissingBundlerUrl    = "erc4337_missing_bundler_url"
	ErrMissingEntryPoint    = "erc4337_missing_entry_point"
	ErrGasEstimationFailed  = "erc4337_gas_estimation_failed"
	ErrSendFailed           = "erc4337_send_failed"
	ErrReceiptTimeout       = "erc4337_receipt_timeout"
	ErrReceiptPollFailed    = "erc4337_receipt_poll_failed"
)

package server

// Server error constants for the auth-capture EVM scheme.
const (
	ErrAmountMustBeString              = "invalid_auth_capture_evm_server_amount_must_be_string"
	ErrNoAssetSpecified                = "invalid_auth_capture_evm_server_no_asset_specified"
	ErrFailedToParseAmount             = "invalid_auth_capture_evm_server_failed_to_parse_amount"
	ErrFailedToConvertAmount           = "invalid_auth_capture_evm_server_failed_to_convert_amount"
	ErrMissingCaptureAuthorizer        = "invalid_auth_capture_evm_server_missing_capture_authorizer"
	ErrMissingFeeRecipient             = "invalid_auth_capture_evm_server_missing_fee_recipient"
	ErrMissingReceiverAuthorizerSigner = "invalid_auth_capture_evm_server_missing_receiver_authorizer_signer"
	ErrInvalidCollectPayload           = "invalid_auth_capture_evm_server_invalid_collect_payload"
	ErrFailedToSignCapture             = "invalid_auth_capture_evm_server_failed_to_sign_capture"
	ErrFailedToSignVoid                = "invalid_auth_capture_evm_server_failed_to_sign_void"
)

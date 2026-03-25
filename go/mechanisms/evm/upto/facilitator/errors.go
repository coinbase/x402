package facilitator

// Upto-specific error constants.
// Shared Permit2 error constants are imported from exact/facilitator where needed.
const (
	ErrUptoInvalidScheme            = "invalid_upto_evm_scheme"
	ErrUptoNetworkMismatch          = "invalid_upto_evm_network_mismatch"
	ErrUptoInvalidPayload           = "invalid_upto_evm_payload"
	ErrUptoSettlementExceedsAmount  = "invalid_upto_evm_payload_settlement_exceeds_amount"
	ErrUptoAmountExceedsPermitted   = "upto_amount_exceeds_permitted"
	ErrUptoUnauthorizedFacilitator  = "upto_unauthorized_facilitator"
	ErrUptoFacilitatorMismatch      = "upto_facilitator_mismatch"
	ErrUptoVerificationFailed       = "invalid_upto_evm_verification_failed"
	ErrUptoFailedToGetNetworkConfig = "invalid_upto_evm_failed_to_get_network_config"
	ErrUptoFailedToGetReceipt       = "invalid_upto_evm_failed_to_get_receipt"
	ErrUptoTransactionFailed        = "invalid_upto_evm_transaction_failed"

	// Shared Permit2 error constants (same values as exact for cross-SDK parity)
	ErrPermit2InvalidSpender      = "invalid_permit2_spender"
	ErrPermit2RecipientMismatch   = "invalid_permit2_recipient_mismatch"
	ErrPermit2DeadlineExpired     = "permit2_deadline_expired"
	ErrPermit2NotYetValid         = "permit2_not_yet_valid"
	ErrPermit2AmountMismatch      = "permit2_amount_mismatch"
	ErrPermit2TokenMismatch       = "permit2_token_mismatch"
	ErrPermit2InvalidSignature    = "invalid_permit2_signature"
	ErrPermit2InvalidAmount       = "permit2_invalid_amount"
	ErrPermit2InvalidDestination  = "permit2_invalid_destination"
	ErrPermit2InvalidOwner        = "permit2_invalid_owner"
	ErrPermit2PaymentTooEarly     = "permit2_payment_too_early"
	ErrPermit2InvalidNonce        = "permit2_invalid_nonce"
	ErrPermit2612AmountMismatch   = "permit2_2612_amount_mismatch"
	ErrPermit2SimulationFailed    = "permit2_simulation_failed"
	ErrPermit2InsufficientBalance = "permit2_insufficient_balance"
	ErrPermit2ProxyNotDeployed    = "permit2_proxy_not_deployed"
	ErrPermit2AllowanceRequired   = "permit2_allowance_required"

	ErrErc20ApprovalInsufficientEth = "erc20_approval_insufficient_eth_for_gas"
	ErrErc20ApprovalBroadcastFailed = "erc20_approval_broadcast_failed"

	ErrInvalidSignatureFormat = "invalid_upto_evm_signature_format"
	ErrInvalidRequiredAmount  = "invalid_upto_evm_required_amount"
)

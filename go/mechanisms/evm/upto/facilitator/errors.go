package facilitator

import "github.com/x402-foundation/x402/go/v2/mechanisms/evm"

// Upto-specific error constants.
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
	// Reserved wire value; do not reassign.
	ErrUptoFailedToGetReceipt = "invalid_upto_evm_failed_to_get_receipt"
	ErrUptoTransactionFailed  = "invalid_upto_evm_transaction_failed"
	ErrUptoPendingMismatch    = "invalid_upto_evm_pending_mismatch"

	ErrUptoEIP3009MissingDomain       = "invalid_upto_evm_eip3009_missing_domain"
	ErrUptoEIP3009ReceiverMismatch    = "invalid_upto_evm_eip3009_receiver_mismatch"
	ErrUptoEIP3009AmountMismatch      = "invalid_upto_evm_eip3009_amount_mismatch"
	ErrUptoEIP3009RecipientMismatch   = "invalid_upto_evm_eip3009_recipient_mismatch"
	ErrUptoEIP3009SettlerMismatch     = "invalid_upto_evm_eip3009_settler_mismatch"
	ErrUptoEIP3009NonceMismatch       = "invalid_upto_evm_eip3009_nonce_mismatch"
	ErrUptoEIP3009ValidBefore         = "invalid_upto_evm_eip3009_valid_before"
	ErrUptoEIP3009ValidAfter          = "invalid_upto_evm_eip3009_valid_after"
	ErrUptoEIP3009NonceAlreadyUsed    = "invalid_upto_evm_eip3009_nonce_already_used"
	ErrUptoEIP3009InsufficientBalance = "invalid_upto_evm_eip3009_insufficient_balance"
	ErrUptoEIP3009InvalidSignature    = "invalid_upto_evm_eip3009_signature"
	ErrUptoEIP3009SimulationFailed    = "invalid_upto_evm_eip3009_simulation_failed"

	ErrSettlementPending = evm.ErrSettlementPending

	// Shared Permit2 error constants — canonical values live in evm.ErrPermit2*
	ErrPermit2InvalidSpender      = evm.ErrPermit2InvalidSpender
	ErrPermit2RecipientMismatch   = evm.ErrPermit2RecipientMismatch
	ErrPermit2DeadlineExpired     = evm.ErrPermit2DeadlineExpired
	ErrPermit2NotYetValid         = evm.ErrPermit2NotYetValid
	ErrPermit2AmountMismatch      = evm.ErrPermit2AmountMismatch
	ErrPermit2TokenMismatch       = evm.ErrPermit2TokenMismatch
	ErrPermit2InvalidSignature    = evm.ErrPermit2InvalidSignature
	ErrPermit2InvalidAmount       = evm.ErrPermit2InvalidAmount
	ErrPermit2InvalidDestination  = evm.ErrPermit2InvalidDestination
	ErrPermit2InvalidOwner        = evm.ErrPermit2InvalidOwner
	ErrPermit2PaymentTooEarly     = evm.ErrPermit2PaymentTooEarly
	ErrPermit2InvalidNonce        = evm.ErrPermit2InvalidNonce
	ErrPermit2612AmountMismatch   = evm.ErrPermit2612AmountMismatch
	ErrPermit2SimulationFailed    = evm.ErrPermit2SimulationFailed
	ErrPermit2InsufficientBalance = evm.ErrPermit2InsufficientBalance
	ErrPermit2ProxyNotDeployed    = evm.ErrPermit2ProxyNotDeployed
	ErrPermit2AllowanceRequired   = evm.ErrPermit2AllowanceRequired

	ErrErc20ApprovalTxFailed        = evm.ErrErc20ApprovalTxFailed
	ErrErc20ApprovalInsufficientEth = evm.ErrErc20ApprovalInsufficientEth
	ErrErc20ApprovalBroadcastFailed = evm.ErrErc20ApprovalBroadcastFailed

	ErrInvalidSignatureFormat = "invalid_upto_evm_signature_format"
	ErrInvalidRequiredAmount  = "invalid_upto_evm_required_amount"
)

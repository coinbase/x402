package facilitator

import x402 "github.com/x402-foundation/x402/go/v2"

// Facilitator error constants for the exact SVM (Solana) scheme (V2)
const (
	// Verify errors
	ErrUnsupportedScheme              = "invalid_exact_solana_unsupported_scheme"
	ErrNetworkMismatch                = "invalid_exact_solana_network_mismatch"
	ErrMissingFeePayer                = "invalid_exact_solana_payload_missing_fee_payer"
	ErrFeePayerNotManaged             = "invalid_exact_solana_fee_payer_not_managed_by_facilitator"
	ErrInvalidPayloadTransaction      = "invalid_exact_solana_payload_transaction"
	ErrTransactionCouldNotBeDecoded   = "invalid_exact_solana_payload_transaction_could_not_be_decoded"
	ErrTransactionInstructionsLength  = "invalid_exact_solana_payload_transaction_instructions_length"
	ErrUnknownFourthInstruction       = "invalid_exact_solana_payload_unknown_fourth_instruction"
	ErrUnknownFifthInstruction        = "invalid_exact_solana_payload_unknown_fifth_instruction"
	ErrUnknownSixthInstruction        = "invalid_exact_solana_payload_unknown_sixth_instruction"
	ErrComputeLimitInstruction        = "invalid_exact_solana_payload_transaction_instructions_compute_limit_instruction"
	ErrComputePriceInstruction        = "invalid_exact_solana_payload_transaction_instructions_compute_price_instruction"
	ErrComputePriceInstructionTooHigh = "invalid_exact_solana_payload_transaction_instructions_compute_price_instruction_too_high"
	ErrNoTransferInstruction          = "invalid_exact_solana_payload_no_transfer_instruction"
	ErrFeePayerTransferringFunds      = "invalid_exact_solana_payload_transaction_fee_payer_transferring_funds"
	ErrMintMismatch                   = "invalid_exact_solana_payload_mint_mismatch"
	ErrRecipientMismatch              = "invalid_exact_solana_payload_recipient_mismatch"
	ErrAmountInsufficient             = "invalid_exact_solana_payload_amount_insufficient"
	ErrInvalidFeePayer                = "invalid_exact_solana_invalid_fee_payer"
	ErrTransactionSigningFailed       = "invalid_exact_solana_transaction_signing_failed"
	ErrTransactionSimulationFailed    = "invalid_exact_solana_transaction_simulation_failed"

	// Memo verification errors
	ErrMemoMismatch = "invalid_exact_solana_payload_memo_mismatch"
	ErrMemoCount    = "invalid_exact_solana_payload_memo_count"

	// Settle errors
	ErrVerificationFailed  = "invalid_exact_solana_verification_failed"
	ErrFeePayerMismatch    = "invalid_exact_solana_fee_payer_mismatch"
	ErrTransactionFailed   = "invalid_exact_solana_transaction_failed"
	ErrDuplicateSettlement = "duplicate_settlement"
)

// ErrSettlementPending is the non-terminal settle error reason used when a
// transaction was broadcast but ConfirmTransaction couldn't observe its
// confirmation in time. It always carries the broadcast signature (as
// SettleError.Transaction) so a caller can reconcile onchain, and mirrors
// x402.ErrSettlementPending / evm.ErrSettlementPending so
// x402ResourceServer's generic single-retry-on-settlement_pending logic
// (see settleWithPendingRetry in server.go) recognizes it uniformly across
// schemes/networks. Replaces the former ErrTransactionConfirmationFailed,
// which was terminal and gave callers no reconciliation path.
const ErrSettlementPending = x402.ErrSettlementPending

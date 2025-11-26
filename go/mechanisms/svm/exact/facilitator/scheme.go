package facilitator

import (
	"context"
	"fmt"
	"strconv"
	"time"

	solana "github.com/gagliardetto/solana-go"
	computebudget "github.com/gagliardetto/solana-go/programs/compute-budget"
	"github.com/gagliardetto/solana-go/programs/token"
	"github.com/gagliardetto/solana-go/rpc"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/mechanisms/svm"
	"github.com/coinbase/x402/go/types"
)

// ExactSvmScheme implements the SchemeNetworkFacilitator interface for SVM (Solana) exact payments (V2)
type ExactSvmScheme struct {
	signer svm.FacilitatorSvmSigner
}

// NewExactSvmScheme creates a new ExactSvmScheme
func NewExactSvmScheme(signer svm.FacilitatorSvmSigner) *ExactSvmScheme {
	return &ExactSvmScheme{
		signer: signer,
	}
}

// Scheme returns the scheme identifier
func (f *ExactSvmScheme) Scheme() string {
	return svm.SchemeExact
}

// CaipFamily returns the CAIP family pattern this facilitator supports
func (f *ExactSvmScheme) CaipFamily() string {
	return "solana:*"
}

// GetExtra returns mechanism-specific extra data for the supported kinds endpoint.
// For SVM, this includes the fee payer address.
func (f *ExactSvmScheme) GetExtra(network x402.Network) map[string]interface{} {
	feePayerAddress := f.signer.GetAddress(string(network))
	return map[string]interface{}{
		"feePayer": feePayerAddress.String(),
	}
}

// GetSigners returns signer addresses used by this facilitator.
// For SVM, returns the fee payer address for the given network.
func (f *ExactSvmScheme) GetSigners() []string {
	// Return fee payer address for devnet (default)
	// Note: In practice, this should return all addresses used across all networks
	feePayerAddress := f.signer.GetAddress("solana-devnet")
	return []string{feePayerAddress.String()}
}

// Verify verifies a V2 payment payload against requirements
func (f *ExactSvmScheme) Verify(
	ctx context.Context,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
) (*x402.VerifyResponse, error) {
	network := x402.Network(requirements.Network)

	// Step 1: Validate Payment Requirements
	if payload.Accepted.Scheme != svm.SchemeExact || requirements.Scheme != svm.SchemeExact {
		return nil, x402.NewVerifyError("unsupported_scheme", "", network, nil)
	}

	if requirements.Extra == nil || requirements.Extra["feePayer"] == nil {
		return nil, x402.NewVerifyError("invalid_exact_solana_payload_missing_fee_payer", "", network, nil)
	}

	// Parse payload
	solanaPayload, err := svm.PayloadFromMap(payload.Payload)
	if err != nil {
		return nil, x402.NewVerifyError("invalid_exact_solana_payload_transaction", "", network, err)
	}

	// Step 2: Parse and Validate Transaction Structure
	tx, err := svm.DecodeTransaction(solanaPayload.Transaction)
	if err != nil {
		return nil, x402.NewVerifyError("invalid_exact_solana_payload_transaction", "", network, err)
	}

	// 3 instructions: ComputeLimit + ComputePrice + TransferChecked
	if len(tx.Message.Instructions) != 3 {
		return nil, x402.NewVerifyError("invalid_exact_solana_payload_transaction_instructions_length", "", network, nil)
	}

	// Step 3: Verify Compute Budget Instructions
	if err := f.verifyComputeLimitInstruction(tx, tx.Message.Instructions[0]); err != nil {
		return nil, x402.NewVerifyError(err.Error(), "", network, err)
	}

	if err := f.verifyComputePriceInstruction(tx, tx.Message.Instructions[1]); err != nil {
		return nil, x402.NewVerifyError(err.Error(), "", network, err)
	}

	// Extract payer from transaction
	payer, err := svm.GetTokenPayerFromTransaction(tx)
	if err != nil {
		return nil, x402.NewVerifyError("invalid_exact_solana_payload_no_transfer_instruction", payer, network, err)
	}

	// V2: payload.Accepted.Network is already validated by scheme lookup
	// Network matching is implicit - facilitator was selected based on requirements.Network

	// Convert requirements to old struct format for helper methods
	reqStruct := x402.PaymentRequirements{
		Scheme:  requirements.Scheme,
		Network: requirements.Network,
		Asset:   requirements.Asset,
		Amount:  requirements.Amount,
		PayTo:   requirements.PayTo,
		Extra:   requirements.Extra,
	}

	// Step 4: Verify Transfer Instruction
	if err := f.verifyTransferInstruction(ctx, tx, tx.Message.Instructions[2], reqStruct); err != nil {
		return nil, x402.NewVerifyError(err.Error(), payer, network, err)
	}

	// Step 5: Sign and Simulate Transaction
	// CRITICAL: Simulation proves transaction will succeed (catches insufficient balance, invalid accounts, etc)
	if err := f.signer.SignTransaction(tx, string(requirements.Network)); err != nil {
		return nil, x402.NewVerifyError("transaction_simulation_failed", payer, network, err)
	}

	rpcClient, err := f.signer.GetRPC(string(requirements.Network))
	if err != nil {
		return nil, x402.NewVerifyError("failed_to_get_rpc_client", payer, network, err)
	}

	// Simulate transaction
	opts := rpc.SimulateTransactionOpts{
		SigVerify:              true,
		ReplaceRecentBlockhash: false,
		Commitment:             svm.DefaultCommitment,
	}

	simResult, err := rpcClient.SimulateTransactionWithOpts(ctx, tx, &opts)
	if err != nil || (simResult != nil && simResult.Value != nil && simResult.Value.Err != nil) {
		return nil, x402.NewVerifyError("transaction_simulation_failed", payer, network, err)
	}

	return &x402.VerifyResponse{
		IsValid: true,
		Payer:   payer,
	}, nil
}

// Settle settles a payment by submitting the transaction (V2)
func (f *ExactSvmScheme) Settle(
	ctx context.Context,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
) (*x402.SettleResponse, error) {
	network := x402.Network(requirements.Network)

	// First verify the payment
	verifyResp, err := f.Verify(ctx, payload, requirements)
	if err != nil {
		// Convert VerifyError to SettleError
		if ve, ok := err.(*x402.VerifyError); ok {
			return nil, x402.NewSettleError(ve.Reason, ve.Payer, ve.Network, "", ve.Err)
		}
		return nil, x402.NewSettleError("verification_failed", "", network, "", err)
	}

	// Parse payload
	solanaPayload, err := svm.PayloadFromMap(payload.Payload)
	if err != nil {
		return nil, x402.NewSettleError("invalid_exact_solana_payload_transaction", verifyResp.Payer, network, "", err)
	}

	// Decode transaction
	tx, err := svm.DecodeTransaction(solanaPayload.Transaction)
	if err != nil {
		return nil, x402.NewSettleError("invalid_exact_solana_payload_transaction", verifyResp.Payer, network, "", err)
	}

	// Sign with facilitator's key
	if err := f.signer.SignTransaction(tx, string(requirements.Network)); err != nil {
		return nil, x402.NewSettleError("transaction_failed", verifyResp.Payer, network, "", err)
	}

	// Send transaction
	signature, err := f.signer.SendTransaction(ctx, tx, string(requirements.Network))
	if err != nil {
		return nil, x402.NewSettleError("transaction_failed", verifyResp.Payer, network, "", err)
	}

	// Wait for confirmation
	if err := f.confirmTransactionWithRetry(ctx, signature, string(requirements.Network)); err != nil {
		return nil, x402.NewSettleError("transaction_confirmation_failed", verifyResp.Payer, network, signature.String(), err)
	}

	return &x402.SettleResponse{
		Success:     true,
		Transaction: signature.String(),
		Network:     network,
		Payer:       verifyResp.Payer,
	}, nil
}

// verifyComputeLimitInstruction verifies the compute unit limit instruction
func (f *ExactSvmScheme) verifyComputeLimitInstruction(tx *solana.Transaction, inst solana.CompiledInstruction) error {
	progID := tx.Message.AccountKeys[inst.ProgramIDIndex]

	if !progID.Equals(solana.ComputeBudget) {
		return fmt.Errorf("invalid_exact_solana_payload_transaction_instructions_compute_limit_instruction")
	}

	// Check discriminator (should be 2 for SetComputeUnitLimit)
	if len(inst.Data) < 1 || inst.Data[0] != 2 {
		return fmt.Errorf("invalid_exact_solana_payload_transaction_instructions_compute_limit_instruction")
	}

	// Decode to validate format
	accounts, err := inst.ResolveInstructionAccounts(&tx.Message)
	if err != nil {
		return fmt.Errorf("invalid_exact_solana_payload_transaction_instructions_compute_limit_instruction")
	}

	_, err = computebudget.DecodeInstruction(accounts, inst.Data)
	if err != nil {
		return fmt.Errorf("invalid_exact_solana_payload_transaction_instructions_compute_limit_instruction")
	}

	return nil
}

// verifyComputePriceInstruction verifies the compute unit price instruction
func (f *ExactSvmScheme) verifyComputePriceInstruction(tx *solana.Transaction, inst solana.CompiledInstruction) error {
	progID := tx.Message.AccountKeys[inst.ProgramIDIndex]

	if !progID.Equals(solana.ComputeBudget) {
		return fmt.Errorf("invalid_exact_solana_payload_transaction_instructions_compute_price_instruction")
	}

	// Check discriminator (should be 3 for SetComputeUnitPrice)
	if len(inst.Data) < 1 || inst.Data[0] != 3 {
		return fmt.Errorf("invalid_exact_solana_payload_transaction_instructions_compute_price_instruction")
	}

	// Decode to get microLamports
	accounts, err := inst.ResolveInstructionAccounts(&tx.Message)
	if err != nil {
		return fmt.Errorf("invalid_exact_solana_payload_transaction_instructions_compute_price_instruction")
	}

	decoded, err := computebudget.DecodeInstruction(accounts, inst.Data)
	if err != nil {
		return fmt.Errorf("invalid_exact_solana_payload_transaction_instructions_compute_price_instruction")
	}

	// Check if it's SetComputeUnitPrice and validate the price
	if priceInst, ok := decoded.Impl.(*computebudget.SetComputeUnitPrice); ok {
		// Check if price exceeds maximum (5 lamports per compute unit = 5,000,000 microlamports)
		if priceInst.MicroLamports > uint64(svm.MaxComputeUnitPrice*1_000_000) {
			return fmt.Errorf("invalid_exact_solana_payload_transaction_instructions_compute_price_instruction_too_high")
		}
	} else {
		return fmt.Errorf("invalid_exact_solana_payload_transaction_instructions_compute_price_instruction")
	}

	return nil
}

// verifyTransferInstruction verifies the transfer instruction
func (f *ExactSvmScheme) verifyTransferInstruction(
	ctx context.Context,
	tx *solana.Transaction,
	inst solana.CompiledInstruction,
	requirements x402.PaymentRequirements,
) error {
	progID := tx.Message.AccountKeys[inst.ProgramIDIndex]

	// Must be Token Program or Token-2022 Program
	if progID != solana.TokenProgramID && progID != solana.Token2022ProgramID {
		return fmt.Errorf("invalid_exact_solana_payload_no_transfer_instruction")
	}

	accounts, err := inst.ResolveInstructionAccounts(&tx.Message)
	if err != nil {
		return fmt.Errorf("invalid_exact_solana_payload_no_transfer_instruction")
	}

	if len(accounts) < 4 {
		return fmt.Errorf("invalid_exact_solana_payload_no_transfer_instruction")
	}

	decoded, err := token.DecodeInstruction(accounts, inst.Data)
	if err != nil {
		return fmt.Errorf("invalid_exact_solana_payload_no_transfer_instruction")
	}

	transferChecked, ok := decoded.Impl.(*token.TransferChecked)
	if !ok {
		return fmt.Errorf("invalid_exact_solana_payload_no_transfer_instruction")
	}

	// SECURITY: Verify that the fee payer is not transferring their own funds
	// Prevent facilitator from signing away their own tokens
	authorityAddr := accounts[3].PublicKey.String() // TransferChecked: [source, mint, destination, authority, ...]
	feePayerAddr, ok := requirements.Extra["feePayer"].(string)
	if ok && authorityAddr == feePayerAddr {
		return fmt.Errorf("invalid_exact_solana_payload_transaction_fee_payer_transferring_funds")
	}

	// Verify mint address
	mintAddr := accounts[1].PublicKey.String()
	if mintAddr != requirements.Asset {
		return fmt.Errorf("invalid_exact_solana_payload_mint_mismatch")
	}

	// Verify destination ATA
	payToPubkey, err := solana.PublicKeyFromBase58(requirements.PayTo)
	if err != nil {
		return fmt.Errorf("invalid_exact_solana_payload_recipient_mismatch")
	}

	mintPubkey, err := solana.PublicKeyFromBase58(requirements.Asset)
	if err != nil {
		return fmt.Errorf("invalid_exact_solana_payload_mint_mismatch")
	}

	expectedDestATA, _, err := solana.FindAssociatedTokenAddress(payToPubkey, mintPubkey)
	if err != nil {
		return fmt.Errorf("invalid_exact_solana_payload_recipient_mismatch")
	}

	destATA := transferChecked.GetDestinationAccount().PublicKey
	if destATA.String() != expectedDestATA.String() {
		return fmt.Errorf("invalid_exact_solana_payload_recipient_mismatch")
	}

	// Verify amount
	requiredAmount, err := strconv.ParseUint(requirements.Amount, 10, 64)
	if err != nil {
		return fmt.Errorf("invalid_exact_solana_payload_amount_insufficient")
	}

	if *transferChecked.Amount < requiredAmount {
		return fmt.Errorf("invalid_exact_solana_payload_amount_insufficient")
	}

	return nil
}

// confirmTransactionWithRetry waits for transaction confirmation with retries
// Uses getSignatureStatuses for faster confirmation detection (matches TypeScript implementation)
func (f *ExactSvmScheme) confirmTransactionWithRetry(ctx context.Context, signature solana.Signature, network string) error {
	rpcClient, err := f.signer.GetRPC(network)
	if err != nil {
		return fmt.Errorf("failed to get RPC client: %w", err)
	}

	for attempt := 0; attempt < svm.MaxConfirmAttempts; attempt++ {
		// Check for context cancellation
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		// Try getSignatureStatuses first (faster than getTransaction)
		statuses, err := rpcClient.GetSignatureStatuses(ctx, true, signature)
		if err == nil && statuses != nil && statuses.Value != nil && len(statuses.Value) > 0 {
			status := statuses.Value[0]
			if status != nil {
				// Check if transaction failed
				if status.Err != nil {
					return fmt.Errorf("transaction failed on-chain")
				}
				// Check if confirmed or finalized
				if status.ConfirmationStatus == rpc.ConfirmationStatusConfirmed ||
					status.ConfirmationStatus == rpc.ConfirmationStatusFinalized {
					return nil
				}
			}
		}

		// Fallback to getTransaction if signature status not available yet
		if err != nil {
			txResult, txErr := rpcClient.GetTransaction(ctx, signature, &rpc.GetTransactionOpts{
				Encoding:   solana.EncodingBase58,
				Commitment: svm.DefaultCommitment,
			})

			if txErr == nil && txResult != nil && txResult.Meta != nil {
				if txResult.Meta.Err != nil {
					return fmt.Errorf("transaction failed on-chain")
				}
				// Success!
				return nil
			}
		}

		// Wait before retrying (fixed delay, no jitter for predictability)
		time.Sleep(svm.ConfirmRetryDelay)
	}

	return fmt.Errorf("transaction confirmation timed out after %d attempts", svm.MaxConfirmAttempts)
}

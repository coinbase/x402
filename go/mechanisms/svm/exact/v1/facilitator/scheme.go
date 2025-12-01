package facilitator

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	solana "github.com/gagliardetto/solana-go"
	computebudget "github.com/gagliardetto/solana-go/programs/compute-budget"
	"github.com/gagliardetto/solana-go/programs/token"
	"github.com/gagliardetto/solana-go/rpc"

	x402 "github.com/coinbase/x402/go"
	svm "github.com/coinbase/x402/go/mechanisms/svm"
	"github.com/coinbase/x402/go/types"
)

// ExactSvmSchemeV1 implements the SchemeNetworkFacilitator interface for SVM (Solana) exact payments (V1)
type ExactSvmSchemeV1 struct {
	signer svm.FacilitatorSvmSigner
}

// NewExactSvmSchemeV1 creates a new ExactSvmSchemeV1
func NewExactSvmSchemeV1(signer svm.FacilitatorSvmSigner) *ExactSvmSchemeV1 {
	return &ExactSvmSchemeV1{
		signer: signer,
	}
}

// Scheme returns the scheme identifier
func (f *ExactSvmSchemeV1) Scheme() string {
	return svm.SchemeExact
}

// CaipFamily returns the CAIP family pattern this facilitator supports
func (f *ExactSvmSchemeV1) CaipFamily() string {
	return "solana:*"
}

// GetExtra returns mechanism-specific extra data for the supported kinds endpoint.
// For SVM, this includes the fee payer address.
func (f *ExactSvmSchemeV1) GetExtra(network x402.Network) map[string]interface{} {
	feePayerAddress := f.signer.GetAddress(context.Background(), string(network))
	return map[string]interface{}{
		"feePayer": feePayerAddress.String(),
	}
}

// GetSigners returns signer addresses used by this facilitator.
// For SVM, returns the fee payer address for the given network.
func (f *ExactSvmSchemeV1) GetSigners() []string {
	// Return fee payer address for devnet (default)
	// Note: In practice, this should return all addresses used across all networks
	feePayerAddress := f.signer.GetAddress(context.Background(), "solana-devnet")
	return []string{feePayerAddress.String()}
}

// Verify verifies a V1 payment payload against requirements
func (f *ExactSvmSchemeV1) Verify(
	ctx context.Context,
	payload types.PaymentPayloadV1,
	requirements types.PaymentRequirementsV1,
) (*x402.VerifyResponse, error) {
	network := x402.Network(requirements.Network)

	// Step 1: Validate Payment Requirements
	// V1: Check scheme from top level (not in Accepted)
	if payload.Scheme != svm.SchemeExact || requirements.Scheme != svm.SchemeExact {
		return nil, x402.NewVerifyError("unsupported_scheme", "", network, nil)
	}

	// Parse extra field for feePayer
	var reqExtraMap map[string]interface{}
	if requirements.Extra != nil {
		json.Unmarshal(*requirements.Extra, &reqExtraMap)
	}

	if reqExtraMap == nil || reqExtraMap["feePayer"] == nil {
		return nil, x402.NewVerifyError("invalid_exact_solana_payload_missing_fee_payer", "", network, nil)
	}

	// Parse payload
	svmPayload, err := svm.PayloadFromMap(payload.Payload)
	if err != nil {
		return nil, x402.NewVerifyError("invalid_exact_solana_payload_transaction", "", network, err)
	}

	// Step 2: Parse and Validate Transaction Structure
	tx, err := svm.DecodeTransaction(svmPayload.Transaction)
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

	// V1: Use payload.Network for validation (top level, not in Accepted)
	if payload.Network != requirements.Network {
		return nil, x402.NewVerifyError("network_mismatch", payer, network, nil)
	}

	// Step 4: Verify Transfer Instruction
	if err := f.verifyTransferInstruction(ctx, tx, tx.Message.Instructions[2], requirements); err != nil {
		return nil, x402.NewVerifyError(err.Error(), payer, network, err)
	}

	// Step 5: Sign and Simulate Transaction
	// CRITICAL: Simulation proves transaction will succeed (catches insufficient balance, invalid accounts, etc)
	if err := f.signer.SignTransaction(ctx, tx, string(requirements.Network)); err != nil {
		return nil, x402.NewVerifyError("transaction_simulation_failed", payer, network, err)
	}

	rpcClient, err := f.signer.GetRPC(ctx, string(requirements.Network))
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

// Settle settles a payment by submitting the transaction (V1)
func (f *ExactSvmSchemeV1) Settle(
	ctx context.Context,
	payload types.PaymentPayloadV1,
	requirements types.PaymentRequirementsV1,
) (*x402.SettleResponse, error) {
	network := x402.Network(payload.Network)

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
	svmPayload, err := svm.PayloadFromMap(payload.Payload)
	if err != nil {
		return nil, x402.NewSettleError("invalid_exact_solana_payload_transaction", verifyResp.Payer, network, "", err)
	}

	// Decode transaction
	tx, err := svm.DecodeTransaction(svmPayload.Transaction)
	if err != nil {
		return nil, x402.NewSettleError("invalid_exact_solana_payload_transaction", verifyResp.Payer, network, "", err)
	}

	// Sign with facilitator's key
	if err := f.signer.SignTransaction(ctx, tx, string(requirements.Network)); err != nil {
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
func (f *ExactSvmSchemeV1) verifyComputeLimitInstruction(tx *solana.Transaction, inst solana.CompiledInstruction) error {
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
func (f *ExactSvmSchemeV1) verifyComputePriceInstruction(tx *solana.Transaction, inst solana.CompiledInstruction) error {
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
func (f *ExactSvmSchemeV1) verifyTransferInstruction(
	ctx context.Context,
	tx *solana.Transaction,
	inst solana.CompiledInstruction,
	requirements types.PaymentRequirementsV1,
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

	// Parse Extra to get feePayer
	var reqExtraMap map[string]interface{}
	if requirements.Extra != nil {
		json.Unmarshal(*requirements.Extra, &reqExtraMap)
	}
	feePayerAddr, ok := reqExtraMap["feePayer"].(string)
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

	// Verify amount - V1: Use MaxAmountRequired
	amountStr := requirements.MaxAmountRequired

	requiredAmount, err := strconv.ParseUint(amountStr, 10, 64)
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
func (f *ExactSvmSchemeV1) confirmTransactionWithRetry(ctx context.Context, signature solana.Signature, network string) error {
	rpcClient, err := f.signer.GetRPC(ctx, network)
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

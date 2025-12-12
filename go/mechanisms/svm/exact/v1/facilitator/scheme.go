package facilitator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"strconv"

	solana "github.com/gagliardetto/solana-go"
	computebudget "github.com/gagliardetto/solana-go/programs/compute-budget"
	"github.com/gagliardetto/solana-go/programs/token"

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
// For SVM, this includes a randomly selected fee payer address.
// Random selection distributes load across multiple signers.
func (f *ExactSvmSchemeV1) GetExtra(network x402.Network) map[string]interface{} {
	addresses := f.signer.GetAddresses(context.Background(), string(network))

	// Randomly select from available addresses to distribute load
	randomIndex := rand.Intn(len(addresses))

	return map[string]interface{}{
		"feePayer": addresses[randomIndex].String(),
	}
}

// GetSigners returns signer addresses used by this facilitator.
// For SVM, returns all available fee payer addresses for the given network.
func (f *ExactSvmSchemeV1) GetSigners(network x402.Network) []string {
	addresses := f.signer.GetAddresses(context.Background(), string(network))
	result := make([]string, len(addresses))
	for i, addr := range addresses {
		result[i] = addr.String()
	}
	return result
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

	// V1: Use payload.Network for validation (top level, not in Accepted)
	if payload.Network != requirements.Network {
		return nil, x402.NewVerifyError("network_mismatch", "", network, nil)
	}

	// Parse extra field for feePayer
	var reqExtraMap map[string]interface{}
	if requirements.Extra != nil {
		if err := json.Unmarshal(*requirements.Extra, &reqExtraMap); err != nil {
			return nil, x402.NewVerifyError("invalid_extra_field", "", network, err)
		}
	}

	if reqExtraMap == nil || reqExtraMap["feePayer"] == nil {
		return nil, x402.NewVerifyError("invalid_exact_solana_payload_missing_fee_payer", "", network, nil)
	}

	feePayerStr, ok := reqExtraMap["feePayer"].(string)
	if !ok {
		return nil, x402.NewVerifyError("invalid_exact_solana_payload_missing_fee_payer", "", network, nil)
	}

	// Verify that the requested feePayer is managed by this facilitator
	signerAddresses := f.signer.GetAddresses(ctx, string(network))
	signerAddressStrs := make([]string, len(signerAddresses))
	for i, addr := range signerAddresses {
		signerAddressStrs[i] = addr.String()
	}

	feePayerManaged := false
	for _, addr := range signerAddressStrs {
		if addr == feePayerStr {
			feePayerManaged = true
			break
		}
	}
	if !feePayerManaged {
		return nil, x402.NewVerifyError("fee_payer_not_managed_by_facilitator", "", network, nil)
	}

	// Parse payload
	svmPayload, err := svm.PayloadFromMap(payload.Payload)
	if err != nil {
		return nil, x402.NewVerifyError("invalid_exact_solana_payload_transaction", "", network, err)
	}

	// Step 2: Parse and Validate Transaction Structure
	tx, err := svm.DecodeTransaction(svmPayload.Transaction)
	if err != nil {
		return nil, x402.NewVerifyError("invalid_exact_solana_payload_transaction_could_not_be_decoded", "", network, err)
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

	// Step 4: Verify Transfer Instruction
	if err := f.verifyTransferInstruction(tx, tx.Message.Instructions[2], requirements, signerAddressStrs); err != nil {
		return nil, x402.NewVerifyError(err.Error(), payer, network, err)
	}

	// Step 5: Sign and Simulate Transaction
	// CRITICAL: Simulation proves transaction will succeed (catches insufficient balance, invalid accounts, etc)

	// feePayer already validated in Step 1
	feePayer, err := solana.PublicKeyFromBase58(feePayerStr)
	if err != nil {
		return nil, x402.NewVerifyError("invalid_fee_payer", payer, network, err)
	}

	// Sign transaction with the feePayer's signer
	if err := f.signer.SignTransaction(ctx, tx, feePayer, string(requirements.Network)); err != nil {
		return nil, x402.NewVerifyError("transaction_signing_failed", payer, network, err)
	}

	// Simulate transaction to verify it would succeed
	if err := f.signer.SimulateTransaction(ctx, tx, string(requirements.Network)); err != nil {
		return nil, x402.NewVerifyError("transaction_simulation_failed", payer, network, err)
	}

	return &x402.VerifyResponse{
		IsValid: true,
		Payer:   payer,
	}, nil
}

// Settle settles a payment by submitting the transaction (V1)
// Ensures the correct signer is used based on the feePayer specified in requirements.
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
		ve := &x402.VerifyError{}
		if errors.As(err, &ve) {
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

	// Parse extra field for feePayer (V1 uses *json.RawMessage)
	var reqExtraMap map[string]interface{}
	if requirements.Extra != nil {
		if err := json.Unmarshal(*requirements.Extra, &reqExtraMap); err != nil {
			return nil, x402.NewSettleError("invalid_extra_field", verifyResp.Payer, network, "", err)
		}
	}

	// Extract and validate feePayer from requirements matches transaction
	feePayerStr, ok := reqExtraMap["feePayer"].(string)
	if !ok {
		return nil, x402.NewSettleError("missing_fee_payer", verifyResp.Payer, network, "", nil)
	}

	expectedFeePayer, err := solana.PublicKeyFromBase58(feePayerStr)
	if err != nil {
		return nil, x402.NewSettleError("invalid_fee_payer", verifyResp.Payer, network, "", err)
	}

	// Verify transaction feePayer matches requirements
	actualFeePayer := tx.Message.AccountKeys[0] // First account is fee payer
	if actualFeePayer != expectedFeePayer {
		return nil, x402.NewSettleError("fee_payer_mismatch", verifyResp.Payer, network, "",
			fmt.Errorf("expected %s, got %s", expectedFeePayer, actualFeePayer))
	}

	// Sign with the feePayer's signer
	if err := f.signer.SignTransaction(ctx, tx, expectedFeePayer, string(requirements.Network)); err != nil {
		return nil, x402.NewSettleError("transaction_failed", verifyResp.Payer, network, "", err)
	}

	// Send transaction to network
	signature, err := f.signer.SendTransaction(ctx, tx, string(requirements.Network))
	if err != nil {
		return nil, x402.NewSettleError("transaction_failed", verifyResp.Payer, network, "", err)
	}

	// Wait for confirmation
	if err := f.signer.ConfirmTransaction(ctx, signature, string(requirements.Network)); err != nil {
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
		if priceInst.MicroLamports > uint64(svm.MaxComputeUnitPriceMicrolamports) {
			return fmt.Errorf("invalid_exact_solana_payload_transaction_instructions_compute_price_instruction_too_high")
		}
	} else {
		return fmt.Errorf("invalid_exact_solana_payload_transaction_instructions_compute_price_instruction")
	}

	return nil
}

// verifyTransferInstruction verifies the transfer instruction
func (f *ExactSvmSchemeV1) verifyTransferInstruction(
	tx *solana.Transaction,
	inst solana.CompiledInstruction,
	requirements types.PaymentRequirementsV1,
	signerAddresses []string,
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

	// SECURITY: Verify that the facilitator's signers are not transferring their own funds
	// Prevent facilitator from signing away their own tokens
	authorityAddr := accounts[3].PublicKey.String() // TransferChecked: [source, mint, destination, authority, ...]
	for _, signerAddr := range signerAddresses {
		if authorityAddr == signerAddr {
			return fmt.Errorf("invalid_exact_solana_payload_transaction_fee_payer_transferring_funds")
		}
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

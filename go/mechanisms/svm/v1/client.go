package v1

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"

	bin "github.com/gagliardetto/binary"
	solana "github.com/gagliardetto/solana-go"
	computebudget "github.com/gagliardetto/solana-go/programs/compute-budget"
	"github.com/gagliardetto/solana-go/programs/token"
	"github.com/gagliardetto/solana-go/rpc"

	svm "github.com/coinbase/x402/go/mechanisms/svm"
	"github.com/coinbase/x402/go/types"
)

// ExactSvmClientV1 implements the SchemeNetworkClient interface for SVM (Solana) exact payments (V1)
type ExactSvmClientV1 struct {
	signer svm.ClientSvmSigner
	config *svm.ClientConfig // Optional custom RPC configuration
}

// NewExactSvmClientV1 creates a new ExactSvmClientV1
func NewExactSvmClientV1(signer svm.ClientSvmSigner, config *svm.ClientConfig) *ExactSvmClientV1 {
	return &ExactSvmClientV1{
		signer: signer,
		config: config,
	}
}

// Scheme returns the scheme identifier
func (c *ExactSvmClientV1) Scheme() string {
	return svm.SchemeExact
}

// CreatePaymentPayload creates a payment payload for the Exact scheme (V1)
// Returns complete v1 payload (x402Version + scheme + network + payload)
func (c *ExactSvmClientV1) CreatePaymentPayload(
	ctx context.Context,
	version int,
	requirementsBytes []byte,
) ([]byte, error) {
	// Unmarshal to v1 requirements using helper
	requirements, err := types.ToPaymentRequirementsV1(requirementsBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal v1 requirements: %w", err)
	}

	// Validate network (V1 uses simple names, normalize to CAIP-2 internally)
	networkStr := requirements.Network
	if !svm.IsValidNetwork(networkStr) {
		return nil, fmt.Errorf("unsupported network: %s", requirements.Network)
	}

	// Get network configuration
	config, err := svm.GetNetworkConfig(networkStr)
	if err != nil {
		return nil, err
	}

	// Get RPC URL (custom or default)
	rpcURL := config.RPCURL
	if c.config != nil && c.config.RPCURL != "" {
		rpcURL = c.config.RPCURL
	}

	// Create RPC client
	rpcClient := rpc.New(rpcURL)

	// Parse mint address
	mintPubkey, err := solana.PublicKeyFromBase58(requirements.Asset)
	if err != nil {
		return nil, fmt.Errorf("invalid asset address: %w", err)
	}

	// Get mint account to determine token program
	mintAccount, err := rpcClient.GetAccountInfo(ctx, mintPubkey)
	if err != nil {
		return nil, fmt.Errorf("failed to get mint account: %w", err)
	}

	// Determine token program (Token or Token-2022)
	tokenProgramID := mintAccount.Value.Owner
	if tokenProgramID != solana.TokenProgramID && tokenProgramID != solana.Token2022ProgramID {
		return nil, fmt.Errorf("asset was not created by a known token program")
	}

	// Parse payTo address
	payToPubkey, err := solana.PublicKeyFromBase58(requirements.PayTo)
	if err != nil {
		return nil, fmt.Errorf("invalid payTo address: %w", err)
	}

	// Find source ATA (client's token account)
	sourceATA, _, err := solana.FindAssociatedTokenAddress(c.signer.Address(), mintPubkey)
	if err != nil {
		return nil, fmt.Errorf("failed to derive source ATA: %w", err)
	}

	// Find destination ATA (recipient's token account)
	destinationATA, _, err := solana.FindAssociatedTokenAddress(payToPubkey, mintPubkey)
	if err != nil {
		return nil, fmt.Errorf("failed to derive destination ATA: %w", err)
	}

	// Check that source ATA exists
	sourceAccount, err := rpcClient.GetAccountInfo(ctx, sourceATA)
	if err != nil || sourceAccount == nil || sourceAccount.Value == nil {
		return nil, fmt.Errorf(
			"invalid_exact_solana_payload_ata_not_found: Source ATA does not exist for client %s",
			c.signer.Address(),
		)
	}

	// Check that destination ATA exists
	destAccount, err := rpcClient.GetAccountInfo(ctx, destinationATA)
	if err != nil || destAccount == nil || destAccount.Value == nil {
		return nil, fmt.Errorf(
			"invalid_exact_solana_payload_ata_not_found: Destination ATA does not exist for recipient %s",
			requirements.PayTo,
		)
	}

	// V1: Use MaxAmountRequired field
	amountStr := requirements.MaxAmountRequired

	amount, err := strconv.ParseUint(amountStr, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid amount: %w", err)
	}

	// Get fee payer from requirements.extra (unmarshal Extra from json.RawMessage)
	var extraMap map[string]interface{}
	if requirements.Extra != nil {
		json.Unmarshal(*requirements.Extra, &extraMap)
	}

	feePayerAddr, ok := extraMap["feePayer"].(string)
	if !ok {
		return nil, fmt.Errorf("feePayer is required in paymentRequirements.extra for Solana transactions")
	}

	feePayer, err := solana.PublicKeyFromBase58(feePayerAddr)
	if err != nil {
		return nil, fmt.Errorf("invalid feePayer address: %w", err)
	}

	// Get mint account data to get decimals
	var mintData token.Mint
	err = bin.NewBinDecoder(mintAccount.Value.Data.GetBinary()).Decode(&mintData)
	if err != nil {
		return nil, fmt.Errorf("failed to decode mint data: %w", err)
	}

	// Get latest blockhash
	latestBlockhash, err := rpcClient.GetLatestBlockhash(ctx, rpc.CommitmentFinalized)
	if err != nil {
		return nil, fmt.Errorf("failed to get latest blockhash: %w", err)
	}
	recentBlockhash := latestBlockhash.Value.Blockhash

	// Hardcoded compute units for 3 instructions (ComputeLimit + ComputePrice + TransferChecked)
	const estimatedUnits uint32 = 6500

	// Build compute budget instructions
	cuLimit, err := computebudget.NewSetComputeUnitLimitInstructionBuilder().
		SetUnits(estimatedUnits).
		ValidateAndBuild()
	if err != nil {
		return nil, fmt.Errorf("failed to build compute limit instruction: %w", err)
	}

	cuPrice, err := computebudget.NewSetComputeUnitPriceInstructionBuilder().
		SetMicroLamports(svm.DefaultComputeUnitPrice).
		ValidateAndBuild()
	if err != nil {
		return nil, fmt.Errorf("failed to build compute price instruction: %w", err)
	}

	// Build final transfer instruction
	transferIx, err := token.NewTransferCheckedInstructionBuilder().
		SetAmount(amount).
		SetDecimals(mintData.Decimals).
		SetSourceAccount(sourceATA).
		SetMintAccount(mintPubkey).
		SetDestinationAccount(destinationATA).
		SetOwnerAccount(c.signer.Address()).
		ValidateAndBuild()
	if err != nil {
		return nil, fmt.Errorf("failed to build transfer instruction: %w", err)
	}

	// Create final transaction
	tx, err := solana.NewTransactionBuilder().
		AddInstruction(cuLimit).
		AddInstruction(cuPrice).
		AddInstruction(transferIx).
		SetRecentBlockHash(recentBlockhash).
		SetFeePayer(feePayer).
		Build()
	if err != nil {
		return nil, fmt.Errorf("failed to create transaction: %w", err)
	}

	// Partially sign with client's key
	if err := c.signer.SignTransaction(tx); err != nil {
		return nil, fmt.Errorf("failed to sign transaction: %w", err)
	}

	// Encode transaction to base64
	base64Tx, err := svm.EncodeTransaction(tx)
	if err != nil {
		return nil, fmt.Errorf("failed to encode transaction: %w", err)
	}

	// Create SVM payload
	svmPayload := &svm.ExactSvmPayload{
		Transaction: base64Tx,
	}

	// Build complete v1 payload (scheme/network at top level)
	v1Payload := types.PaymentPayloadV1{
		X402Version: version,
		Scheme:      requirements.Scheme,
		Network:     requirements.Network,
		Payload:     svmPayload.ToMap(),
	}

	return json.Marshal(v1Payload)
}

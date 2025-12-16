package client

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

// ExactSvmSchemeV1 implements the SchemeNetworkClientV1 interface for SVM (Solana) exact payments (V1)
type ExactSvmSchemeV1 struct {
	signer svm.ClientSvmSigner
	config *svm.ClientConfig // Optional custom RPC configuration
}

// NewExactSvmSchemeV1 creates a new ExactSvmSchemeV1
// Config is optional - if not provided, uses network defaults
func NewExactSvmSchemeV1(signer svm.ClientSvmSigner, config ...*svm.ClientConfig) *ExactSvmSchemeV1 {
	var cfg *svm.ClientConfig
	if len(config) > 0 {
		cfg = config[0]
	}
	return &ExactSvmSchemeV1{
		signer: signer,
		config: cfg,
	}
}

// Scheme returns the scheme identifier
func (c *ExactSvmSchemeV1) Scheme() string {
	return svm.SchemeExact
}

// CreatePaymentPayload creates a V1 payment payload for the Exact scheme
func (c *ExactSvmSchemeV1) CreatePaymentPayload(
	ctx context.Context,
	requirements types.PaymentRequirementsV1,
) (types.PaymentPayloadV1, error) {

	// Validate network (V1 uses simple names, normalize to CAIP-2 internally)
	networkStr := requirements.Network
	if !svm.IsValidNetwork(networkStr) {
		return types.PaymentPayloadV1{}, fmt.Errorf("unsupported network: %s", requirements.Network)
	}

	// Get network configuration
	config, err := svm.GetNetworkConfig(networkStr)
	if err != nil {
		return types.PaymentPayloadV1{}, err
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
		return types.PaymentPayloadV1{}, fmt.Errorf("invalid asset address: %w", err)
	}

	// Get mint account to determine token program
	mintAccount, err := rpcClient.GetAccountInfo(ctx, mintPubkey)
	if err != nil {
		return types.PaymentPayloadV1{}, fmt.Errorf("failed to get mint account: %w", err)
	}

	// Determine token program (Token or Token-2022)
	tokenProgramID := mintAccount.Value.Owner
	if tokenProgramID != solana.TokenProgramID && tokenProgramID != solana.Token2022ProgramID {
		return types.PaymentPayloadV1{}, fmt.Errorf("asset was not created by a known token program")
	}

	// Parse payTo address
	payToPubkey, err := solana.PublicKeyFromBase58(requirements.PayTo)
	if err != nil {
		return types.PaymentPayloadV1{}, fmt.Errorf("invalid payTo address: %w", err)
	}

	// Find source ATA (client's token account)
	sourceATA, _, err := solana.FindAssociatedTokenAddress(c.signer.Address(), mintPubkey)
	if err != nil {
		return types.PaymentPayloadV1{}, fmt.Errorf("failed to derive source ATA: %w", err)
	}

	// Find destination ATA (recipient's token account)
	destinationATA, _, err := solana.FindAssociatedTokenAddress(payToPubkey, mintPubkey)
	if err != nil {
		return types.PaymentPayloadV1{}, fmt.Errorf("failed to derive destination ATA: %w", err)
	}

	// V1: Use MaxAmountRequired field
	amountStr := requirements.MaxAmountRequired

	amount, err := strconv.ParseUint(amountStr, 10, 64)
	if err != nil {
		return types.PaymentPayloadV1{}, fmt.Errorf("invalid amount: %w", err)
	}

	// Get fee payer from requirements.extra (unmarshal Extra from json.RawMessage)
	var extraMap map[string]interface{}
	if requirements.Extra != nil {
		if err := json.Unmarshal(*requirements.Extra, &extraMap); err != nil {
			return types.PaymentPayloadV1{}, fmt.Errorf("invalid extra field: %w", err)
		}
	}

	feePayerAddr, ok := extraMap["feePayer"].(string)
	if !ok {
		return types.PaymentPayloadV1{}, fmt.Errorf("feePayer is required in paymentRequirements.extra for Solana transactions")
	}

	feePayer, err := solana.PublicKeyFromBase58(feePayerAddr)
	if err != nil {
		return types.PaymentPayloadV1{}, fmt.Errorf("invalid feePayer address: %w", err)
	}

	// Get mint account data to get decimals
	var mintData token.Mint
	err = bin.NewBinDecoder(mintAccount.Value.Data.GetBinary()).Decode(&mintData)
	if err != nil {
		return types.PaymentPayloadV1{}, fmt.Errorf("failed to decode mint data: %w", err)
	}

	// Get latest blockhash
	latestBlockhash, err := rpcClient.GetLatestBlockhash(ctx, rpc.CommitmentFinalized)
	if err != nil {
		return types.PaymentPayloadV1{}, fmt.Errorf("failed to get latest blockhash: %w", err)
	}
	recentBlockhash := latestBlockhash.Value.Blockhash

	// Build compute budget instructions
	cuLimit, err := computebudget.NewSetComputeUnitLimitInstructionBuilder().
		SetUnits(svm.DefaultComputeUnitLimit).
		ValidateAndBuild()
	if err != nil {
		return types.PaymentPayloadV1{}, fmt.Errorf("failed to build compute limit instruction: %w", err)
	}

	cuPrice, err := computebudget.NewSetComputeUnitPriceInstructionBuilder().
		SetMicroLamports(svm.DefaultComputeUnitPriceMicrolamports).
		ValidateAndBuild()
	if err != nil {
		return types.PaymentPayloadV1{}, fmt.Errorf("failed to build compute price instruction: %w", err)
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
		return types.PaymentPayloadV1{}, fmt.Errorf("failed to build transfer instruction: %w", err)
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
		return types.PaymentPayloadV1{}, fmt.Errorf("failed to create transaction: %w", err)
	}

	// Partially sign with client's key
	if err := c.signer.SignTransaction(ctx, tx); err != nil {
		return types.PaymentPayloadV1{}, fmt.Errorf("failed to sign transaction: %w", err)
	}

	// Encode transaction to base64
	base64Tx, err := svm.EncodeTransaction(tx)
	if err != nil {
		return types.PaymentPayloadV1{}, fmt.Errorf("failed to encode transaction: %w", err)
	}

	// Create SVM payload
	svmPayload := &svm.ExactSvmPayload{
		Transaction: base64Tx,
	}

	// Build complete v1 payload (scheme/network at top level)
	return types.PaymentPayloadV1{
		X402Version: 1,
		Scheme:      requirements.Scheme,
		Network:     requirements.Network,
		Payload:     svmPayload.ToMap(),
	}, nil
}

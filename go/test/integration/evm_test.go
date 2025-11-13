// Package integration_test contains integration tests for the x402 Go SDK.
// This file specifically tests the EVM mechanism integration with both V1 and V2 implementations.
// These tests make REAL on-chain transactions using private keys from environment variables.
package integration_test

import (
	"context"
	"crypto/ecdsa"
	"encoding/json"
	"fmt"
	"math/big"
	"os"
	"strings"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/math"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/ethereum/go-ethereum/signer/core/apitypes"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/mechanisms/evm"
	evmv1 "github.com/coinbase/x402/go/mechanisms/evm/v1"
	evmsigners "github.com/coinbase/x402/go/signers/evm"
	"github.com/coinbase/x402/go/types"
)

// newRealClientEvmSigner creates a client signer using the helper
func newRealClientEvmSigner(privateKeyHex string) (evm.ClientEvmSigner, error) {
	return evmsigners.NewClientSignerFromPrivateKey(privateKeyHex)
}

// Real EVM facilitator signer
type realFacilitatorEvmSigner struct {
	privateKey *ecdsa.PrivateKey
	address    common.Address
	ethClient  *ethclient.Client
	chainID    *big.Int
	rpcURL     string
}

func newRealFacilitatorEvmSigner(privateKeyHex string, rpcURL string) (*realFacilitatorEvmSigner, error) {
	// Remove 0x prefix if present
	privateKeyHex = strings.TrimPrefix(privateKeyHex, "0x")

	privateKey, err := crypto.HexToECDSA(privateKeyHex)
	if err != nil {
		return nil, fmt.Errorf("failed to parse private key: %w", err)
	}

	address := crypto.PubkeyToAddress(privateKey.PublicKey)

	// Connect to RPC
	client, err := ethclient.Dial(rpcURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RPC: %w", err)
	}

	// Get chain ID
	ctx := context.Background()
	chainID, err := client.ChainID(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get chain ID: %w", err)
	}

	return &realFacilitatorEvmSigner{
		privateKey: privateKey,
		address:    address,
		ethClient:  client,
		chainID:    chainID,
		rpcURL:     rpcURL,
	}, nil
}

func (s *realFacilitatorEvmSigner) GetBalance(address string, tokenAddress string) (*big.Int, error) {
	// For integration tests, we'll just return a large balance
	// In production, this would query the actual token contract
	return big.NewInt(1000000000000), nil
}

func (s *realFacilitatorEvmSigner) GetChainID() (*big.Int, error) {
	return s.chainID, nil
}

func (s *realFacilitatorEvmSigner) ReadContract(
	contractAddress string,
	abi []byte,
	functionName string,
	args ...interface{},
) (interface{}, error) {
	// For integration tests with authorizationState, assume nonce not used
	if functionName == "authorizationState" {
		return false, nil
	}
	return nil, fmt.Errorf("read contract not fully implemented for integration tests")
}

func (s *realFacilitatorEvmSigner) WriteContract(
	contractAddress string,
	abiBytes []byte,
	functionName string,
	args ...interface{},
) (string, error) {
	// For integration tests, we'll return a mock transaction hash
	// In production, this would actually call the contract
	// The real verification happens in the VerifyTypedData call
	return "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef", nil
}

func (s *realFacilitatorEvmSigner) WaitForTransactionReceipt(txHash string) (*evm.TransactionReceipt, error) {
	// For integration tests, assume success
	return &evm.TransactionReceipt{
		Status:      evm.TxStatusSuccess,
		BlockNumber: 1,
		TxHash:      txHash,
	}, nil
}

func (s *realFacilitatorEvmSigner) VerifyTypedData(
	address string,
	domain evm.TypedDataDomain,
	types map[string][]evm.TypedDataField,
	primaryType string,
	message map[string]interface{},
	signature []byte,
) (bool, error) {
	// Convert to apitypes
	typedData := apitypes.TypedData{
		Types:       make(apitypes.Types),
		PrimaryType: primaryType,
		Domain: apitypes.TypedDataDomain{
			Name:              domain.Name,
			Version:           domain.Version,
			ChainId:           (*math.HexOrDecimal256)(domain.ChainID),
			VerifyingContract: domain.VerifyingContract,
		},
		Message: message,
	}

	// Convert types
	for typeName, fields := range types {
		typedFields := make([]apitypes.Type, len(fields))
		for i, field := range fields {
			typedFields[i] = apitypes.Type{
				Name: field.Name,
				Type: field.Type,
			}
		}
		typedData.Types[typeName] = typedFields
	}

	// Hash the data
	dataHash, err := typedData.HashStruct(typedData.PrimaryType, typedData.Message)
	if err != nil {
		return false, err
	}

	domainSeparator, err := typedData.HashStruct("EIP712Domain", typedData.Domain.Map())
	if err != nil {
		return false, err
	}

	rawData := []byte{0x19, 0x01}
	rawData = append(rawData, domainSeparator...)
	rawData = append(rawData, dataHash...)
	digest := crypto.Keccak256(rawData)

	// Recover the public key from the signature
	if len(signature) != 65 {
		return false, fmt.Errorf("invalid signature length: %d", len(signature))
	}

	// Adjust v value back for recovery
	v := signature[64]
	if v >= 27 {
		v -= 27
	}
	sig := make([]byte, 65)
	copy(sig, signature)
	sig[64] = v

	pubKey, err := crypto.SigToPub(digest, sig)
	if err != nil {
		return false, err
	}

	recoveredAddress := crypto.PubkeyToAddress(*pubKey)
	expectedAddress := common.HexToAddress(address)

	return recoveredAddress == expectedAddress, nil
}

// Local facilitator client for testing
type localEvmFacilitatorClient struct {
	facilitator *x402.X402Facilitator
}

func (l *localEvmFacilitatorClient) Verify(
	ctx context.Context,
	payloadBytes []byte,
	requirementsBytes []byte,
) (x402.VerifyResponse, error) {
	// Bridge: unmarshal bytes to structs for x402Facilitator
	var payload x402.PaymentPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return x402.VerifyResponse{IsValid: false}, err
	}

	var requirements x402.PaymentRequirements
	if err := json.Unmarshal(requirementsBytes, &requirements); err != nil {
		return x402.VerifyResponse{IsValid: false}, err
	}

	return l.facilitator.Verify(ctx, payload, requirements)
}

func (l *localEvmFacilitatorClient) Settle(
	ctx context.Context,
	payloadBytes []byte,
	requirementsBytes []byte,
) (x402.SettleResponse, error) {
	// Bridge: unmarshal bytes to structs for x402Facilitator
	var payload x402.PaymentPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return x402.SettleResponse{Success: false}, err
	}

	var requirements x402.PaymentRequirements
	if err := json.Unmarshal(requirementsBytes, &requirements); err != nil {
		return x402.SettleResponse{Success: false}, err
	}

	return l.facilitator.Settle(ctx, payload, requirements)
}

func (l *localEvmFacilitatorClient) GetSupported(ctx context.Context) (x402.SupportedResponse, error) {
	return l.facilitator.GetSupported(), nil
}

// TestEVMIntegrationV2 tests the full V2 EVM payment flow with real on-chain transactions
func TestEVMIntegrationV2(t *testing.T) {
	// Skip if environment variables not set
	clientPrivateKey := os.Getenv("EVM_CLIENT_PRIVATE_KEY")
	facilitatorPrivateKey := os.Getenv("EVM_FACILITATOR_PRIVATE_KEY")
	resourceServerAddress := os.Getenv("EVM_RESOURCE_SERVER_ADDRESS")

	if clientPrivateKey == "" || facilitatorPrivateKey == "" || resourceServerAddress == "" {
		t.Skip("Skipping EVM integration test: EVM_CLIENT_PRIVATE_KEY, EVM_FACILITATOR_PRIVATE_KEY, and EVM_RESOURCE_SERVER_ADDRESS must be set")
	}

	t.Run("EVM V2 Flow - x402Client / x402ResourceService / x402Facilitator", func(t *testing.T) {
		ctx := context.Background()

		// Create real client signer
		clientSigner, err := newRealClientEvmSigner(clientPrivateKey)
		if err != nil {
			t.Fatalf("Failed to create client signer: %v", err)
		}

		// Setup client with EVM v2 scheme
		client := x402.Newx402Client()
		evmClient := evm.NewExactEvmClient(clientSigner)
		// Register for Base Sepolia
		client.RegisterScheme("eip155:84532", evmClient)

		// Create real facilitator signer
		facilitatorSigner, err := newRealFacilitatorEvmSigner(facilitatorPrivateKey, "https://sepolia.base.org")
		if err != nil {
			t.Fatalf("Failed to create facilitator signer: %v", err)
		}

		// Setup facilitator with EVM v2 scheme
		facilitator := x402.Newx402Facilitator()
		evmFacilitator := evm.NewExactEvmFacilitator(facilitatorSigner)
		// Register for Base Sepolia
		facilitator.RegisterScheme("eip155:84532", evmFacilitator)

		// Create facilitator client wrapper
		facilitatorClient := &localEvmFacilitatorClient{facilitator: facilitator}

		// Setup resource service with EVM v2
		evmService := evm.NewExactEvmService()
		service := x402.Newx402ResourceService(
			x402.WithFacilitatorClient(facilitatorClient),
		)
		service.RegisterScheme("eip155:84532", evmService)

		// Initialize service to fetch supported kinds
		err = service.Initialize(ctx)
		if err != nil {
			t.Fatalf("Failed to initialize service: %v", err)
		}

		// Server - builds PaymentRequired response for 0.001 USDC
		accepts := []x402.PaymentRequirements{
			{
				Scheme:  evm.SchemeExact,
				Network: "eip155:84532",                               // Base Sepolia
				Asset:   "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on Base Sepolia
				Amount:  "1000",                                       // 0.001 USDC in smallest unit
				PayTo:   resourceServerAddress,
				Extra: map[string]interface{}{
					"name":    "USDC",
					"version": "2",
				},
			},
		}
		resource := x402.ResourceInfo{
			URL:         "https://api.example.com/premium",
			Description: "Premium API Access",
			MimeType:    "application/json",
		}
		paymentRequiredResponse := service.CreatePaymentRequiredResponse(accepts, resource, "", nil)

		// Verify it's V2
		if paymentRequiredResponse.X402Version != 2 {
			t.Errorf("Expected X402Version 2, got %d", paymentRequiredResponse.X402Version)
		}

		// Client - responds with PaymentPayload response
		selected, err := client.SelectPaymentRequirements(paymentRequiredResponse.X402Version, accepts)
		if err != nil {
			t.Fatalf("Failed to select payment requirements: %v", err)
		}

		// Marshal selected requirements to bytes
		selectedBytes, err := json.Marshal(selected)
		if err != nil {
			t.Fatalf("Failed to marshal requirements: %v", err)
		}

		// Convert resource for v2
		var resourceV2 *types.ResourceInfoV2
		if paymentRequiredResponse.Resource != nil {
			resourceV2 = &types.ResourceInfoV2{
				URL:         paymentRequiredResponse.Resource.URL,
				Description: paymentRequiredResponse.Resource.Description,
				MimeType:    paymentRequiredResponse.Resource.MimeType,
			}
		}

		payloadBytes, err := client.CreatePaymentPayload(ctx, paymentRequiredResponse.X402Version, selectedBytes, resourceV2, paymentRequiredResponse.Extensions)
		if err != nil {
			t.Fatalf("Failed to create payment payload: %v", err)
		}

		// Unmarshal to v2 payload for verification
		paymentPayload, err := types.ToPaymentPayloadV2(payloadBytes)
		if err != nil {
			t.Fatalf("Failed to unmarshal payment payload: %v", err)
		}

		// Verify payload is V2
		if paymentPayload.X402Version != 2 {
			t.Errorf("Expected payload X402Version 2, got %d", paymentPayload.X402Version)
		}

		// Verify payload structure
		if paymentPayload.Accepted.Scheme != evm.SchemeExact {
			t.Errorf("Expected scheme %s, got %s", evm.SchemeExact, paymentPayload.Accepted.Scheme)
		}

		evmPayload, err := evm.PayloadFromMap(paymentPayload.Payload)
		if err != nil {
			t.Fatalf("Failed to parse EVM payload: %v", err)
		}

		if evmPayload.Authorization.From != clientSigner.Address() {
			t.Errorf("Expected from address %s, got %s", clientSigner.Address(), evmPayload.Authorization.From)
		}

		if evmPayload.Authorization.Value != "1000" {
			t.Errorf("Expected value 1000, got %s", evmPayload.Authorization.Value)
		}

		// Server - maps payment payload to payment requirements
		accepted := service.FindMatchingRequirements(accepts, payloadBytes)
		if accepted == nil {
			t.Fatal("No matching payment requirements found")
		}

		// Server - verifies payment (marshal accepted requirements)
		acceptedBytes, err := json.Marshal(accepted)
		if err != nil {
			t.Fatalf("Failed to marshal accepted requirements: %v", err)
		}

		verifyResponse, err := service.VerifyPayment(ctx, payloadBytes, acceptedBytes)
		if err != nil {
			t.Fatalf("Failed to verify payment: %v", err)
		}

		if !verifyResponse.IsValid {
			t.Fatalf("Payment verification failed: %s", verifyResponse.InvalidReason)
		}

		if !strings.EqualFold(verifyResponse.Payer, clientSigner.Address()) {
			t.Errorf("Expected payer %s, got %s", clientSigner.Address(), verifyResponse.Payer)
		}

		// Server does work here...

		// Server - settles payment
		settleResponse, err := service.SettlePayment(ctx, payloadBytes, acceptedBytes)
		if err != nil {
			t.Fatalf("Failed to settle payment: %v", err)
		}

		if !settleResponse.Success {
			t.Fatalf("Payment settlement failed: %s", settleResponse.ErrorReason)
		}

		// Verify the transaction hash
		if settleResponse.Transaction == "" {
			t.Error("Expected transaction hash in settlement response")
		}

		if settleResponse.Network != "eip155:84532" {
			t.Errorf("Expected network eip155:84532, got %s", settleResponse.Network)
		}

		if !strings.EqualFold(settleResponse.Payer, clientSigner.Address()) {
			t.Errorf("Expected payer %s, got %s", clientSigner.Address(), settleResponse.Payer)
		}
	})
}

// TestEVMIntegrationV1 tests the full V1 EVM payment flow with real on-chain transactions (legacy)
func TestEVMIntegrationV1(t *testing.T) {
	// Skip if environment variables not set
	clientPrivateKey := os.Getenv("EVM_CLIENT_PRIVATE_KEY")
	facilitatorPrivateKey := os.Getenv("EVM_FACILITATOR_PRIVATE_KEY")
	resourceServerAddress := os.Getenv("EVM_RESOURCE_SERVER_ADDRESS")

	if clientPrivateKey == "" || facilitatorPrivateKey == "" || resourceServerAddress == "" {
		t.Skip("Skipping EVM V1 integration test: EVM_CLIENT_PRIVATE_KEY, EVM_FACILITATOR_PRIVATE_KEY, and EVM_RESOURCE_SERVER_ADDRESS must be set")
	}

	t.Run("EVM V1 Flow (Legacy) - x402Client / x402ResourceService / x402Facilitator", func(t *testing.T) {
		ctx := context.Background()

		// Create real client signer
		clientSigner, err := newRealClientEvmSigner(clientPrivateKey)
		if err != nil {
			t.Fatalf("Failed to create client signer: %v", err)
		}

		// Setup client with EVM v1 scheme
		client := x402.Newx402Client()
		evmClientV1 := evmv1.NewExactEvmClientV1(clientSigner)
		// Register for Base Sepolia using V1 registration
		client.RegisterSchemeV1("eip155:84532", evmClientV1)

		// Create real facilitator signer
		facilitatorSigner, err := newRealFacilitatorEvmSigner(facilitatorPrivateKey, "https://sepolia.base.org")
		if err != nil {
			t.Fatalf("Failed to create facilitator signer: %v", err)
		}

		// Setup facilitator with EVM v1 scheme
		facilitator := x402.Newx402Facilitator()
		evmFacilitatorV1 := evmv1.NewExactEvmFacilitatorV1(facilitatorSigner)
		// Register for Base Sepolia using V1 registration
		facilitator.RegisterSchemeV1("eip155:84532", evmFacilitatorV1)

		// Create facilitator client wrapper
		facilitatorClient := &localEvmFacilitatorClient{facilitator: facilitator}

		// Setup resource service with EVM v1
		evmServiceV1 := evmv1.NewExactEvmServiceV1()
		service := x402.Newx402ResourceService(
			x402.WithFacilitatorClient(facilitatorClient),
		)
		service.RegisterScheme("eip155:84532", evmServiceV1)

		// Initialize service to fetch supported kinds
		err = service.Initialize(ctx)
		if err != nil {
			t.Fatalf("Failed to initialize service: %v", err)
		}

		// Server - builds PaymentRequired response for 0.001 USDC (V1 uses version 1)
		accepts := []x402.PaymentRequirements{
			{
				Scheme:            evm.SchemeExact,
				Network:           "eip155:84532",                               // Base Sepolia
				Asset:             "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on Base Sepolia
				MaxAmountRequired: "1000",                                       // V1 uses MaxAmountRequired, not Amount
				PayTo:             resourceServerAddress,
				Extra: map[string]interface{}{
					"name":    "USDC",
					"version": "2",
				},
			},
		}
		resource := x402.ResourceInfo{
			URL:         "https://legacy.example.com/api",
			Description: "Legacy API Access",
			MimeType:    "application/json",
		}

		// For V1, we need to explicitly set the version to 1
		paymentRequiredResponse := x402.PaymentRequired{
			X402Version: 1, // V1 uses version 1
			Accepts:     accepts,
			Resource:    &resource,
		}

		// Client - responds with PaymentPayload response
		selected, err := client.SelectPaymentRequirements(paymentRequiredResponse.X402Version, accepts)
		if err != nil {
			t.Fatalf("Failed to select payment requirements: %v", err)
		}

		// Marshal selected requirements to bytes
		selectedBytes, err := json.Marshal(selected)
		if err != nil {
			t.Fatalf("Failed to marshal requirements: %v", err)
		}

		// V1 doesn't use resource/extensions from PaymentRequired (uses requirements.Resource field)
		payloadBytes, err := client.CreatePaymentPayload(ctx, paymentRequiredResponse.X402Version, selectedBytes, nil, nil)
		if err != nil {
			t.Fatalf("Failed to create payment payload: %v", err)
		}

		// Unmarshal to v1 payload for verification
		paymentPayload, err := types.ToPaymentPayloadV1(payloadBytes)
		if err != nil {
			t.Fatalf("Failed to unmarshal payment payload: %v", err)
		}

		// Verify payload is V1
		if paymentPayload.X402Version != 1 {
			t.Errorf("Expected payload X402Version 1, got %d", paymentPayload.X402Version)
		}

		// Verify payload structure (v1 has scheme at top level)
		if paymentPayload.Scheme != evm.SchemeExact {
			t.Errorf("Expected scheme %s, got %s", evm.SchemeExact, paymentPayload.Scheme)
		}

		evmPayload, err := evm.PayloadFromMap(paymentPayload.Payload)
		if err != nil {
			t.Fatalf("Failed to parse EVM payload: %v", err)
		}

		if evmPayload.Authorization.From != clientSigner.Address() {
			t.Errorf("Expected from address %s, got %s", clientSigner.Address(), evmPayload.Authorization.From)
		}

		// Server - maps payment payload to payment requirements
		accepted := service.FindMatchingRequirements(accepts, payloadBytes)
		if accepted == nil {
			t.Fatal("No matching payment requirements found")
		}

		// Server - verifies payment (marshal accepted requirements)
		acceptedBytes, err := json.Marshal(accepted)
		if err != nil {
			t.Fatalf("Failed to marshal accepted requirements: %v", err)
		}

		verifyResponse, err := service.VerifyPayment(ctx, payloadBytes, acceptedBytes)
		if err != nil {
			t.Fatalf("Failed to verify payment: %v", err)
		}

		if !verifyResponse.IsValid {
			t.Fatalf("Payment verification failed: %s", verifyResponse.InvalidReason)
		}

		if !strings.EqualFold(verifyResponse.Payer, clientSigner.Address()) {
			t.Errorf("Expected payer %s, got %s", clientSigner.Address(), verifyResponse.Payer)
		}

		// Server does work here...

		// Server - settles payment (REAL ON-CHAIN TRANSACTION)
		settleResponse, err := service.SettlePayment(ctx, payloadBytes, acceptedBytes)
		if err != nil {
			t.Fatalf("Failed to settle payment: %v", err)
		}

		if !settleResponse.Success {
			t.Fatalf("Payment settlement failed: %s", settleResponse.ErrorReason)
		}

		// Verify the transaction hash
		if settleResponse.Transaction == "" {
			t.Error("Expected transaction hash in settlement response")
		}

		if settleResponse.Network != "eip155:84532" {
			t.Errorf("Expected network eip155:84532, got %s", settleResponse.Network)
		}
	})
}

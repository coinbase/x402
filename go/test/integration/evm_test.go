// Package integration_test contains integration tests for the x402 Go SDK.
// This file specifically tests the EVM mechanism integration with both V1 and V2 implementations.
// These tests make REAL on-chain transactions using private keys from environment variables.
package integration_test

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"math/big"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/math"
	ethtypes "github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/ethereum/go-ethereum/signer/core/apitypes"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/mechanisms/evm"
	evmclient "github.com/coinbase/x402/go/mechanisms/evm/exact/client"
	evmfacilitator "github.com/coinbase/x402/go/mechanisms/evm/exact/facilitator"
	evmserver "github.com/coinbase/x402/go/mechanisms/evm/exact/server"
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

func (s *realFacilitatorEvmSigner) GetAddresses() []string {
	return []string{s.address.Hex()}
}

func (s *realFacilitatorEvmSigner) GetBalance(ctx context.Context, address string, tokenAddress string) (*big.Int, error) {
	// For integration tests, we'll just return a large balance
	// In production, this would query the actual token contract
	return big.NewInt(1000000000000), nil
}

func (s *realFacilitatorEvmSigner) GetChainID(ctx context.Context) (*big.Int, error) {
	return s.chainID, nil
}

func (s *realFacilitatorEvmSigner) GetCode(ctx context.Context, address string) ([]byte, error) {
	addr := common.HexToAddress(address)
	return s.ethClient.CodeAt(ctx, addr, nil)
}

func (s *realFacilitatorEvmSigner) ReadContract(
	ctx context.Context,
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
	ctx context.Context,
	contractAddress string,
	abiBytes []byte,
	functionName string,
	args ...interface{},
) (string, error) {
	contractABI, err := abi.JSON(strings.NewReader(string(abiBytes)))
	if err != nil {
		return "", fmt.Errorf("failed to parse ABI: %w", err)
	}

	data, err := contractABI.Pack(functionName, args...)
	if err != nil {
		return "", fmt.Errorf("failed to pack method call: %w", err)
	}

	to := common.HexToAddress(contractAddress)
	return s.sendTxWithRetry(ctx, to, data, 300000)
}

// sendTxWithRetry sends a transaction, retrying on nonce conflicts from back-to-back tests.
func (s *realFacilitatorEvmSigner) sendTxWithRetry(ctx context.Context, to common.Address, data []byte, gasLimit uint64) (string, error) {
	const maxRetries = 5

	for attempt := 0; attempt <= maxRetries; attempt++ {
		nonce, err := s.ethClient.PendingNonceAt(ctx, s.address)
		if err != nil {
			return "", fmt.Errorf("failed to get nonce: %w", err)
		}

		gasPrice, err := s.ethClient.SuggestGasPrice(ctx)
		if err != nil {
			return "", fmt.Errorf("failed to get gas price: %w", err)
		}

		// Bump gas price on retry to replace any stuck pending tx
		if attempt > 0 {
			bump := new(big.Int).Div(gasPrice, big.NewInt(5))
			gasPrice.Add(gasPrice, bump)
		}

		tx := ethtypes.NewTransaction(nonce, to, big.NewInt(0), gasLimit, gasPrice, data)
		signedTx, err := ethtypes.SignTx(tx, ethtypes.LatestSignerForChainID(s.chainID), s.privateKey)
		if err != nil {
			return "", fmt.Errorf("failed to sign transaction: %w", err)
		}

		err = s.ethClient.SendTransaction(ctx, signedTx)
		if err != nil {
			if strings.Contains(err.Error(), "replacement transaction underpriced") && attempt < maxRetries {
				time.Sleep(time.Duration(2*(attempt+1)) * time.Second)
				continue
			}
			return "", fmt.Errorf("failed to send transaction: %w", err)
		}

		return signedTx.Hash().Hex(), nil
	}
	return "", fmt.Errorf("failed to send transaction after %d retries", maxRetries)
}

func (s *realFacilitatorEvmSigner) SendTransaction(
	ctx context.Context,
	to string,
	data []byte,
) (string, error) {
	toAddr := common.HexToAddress(to)
	return s.sendTxWithRetry(ctx, toAddr, data, 300000)
}

func (s *realFacilitatorEvmSigner) WaitForTransactionReceipt(ctx context.Context, txHash string) (*evm.TransactionReceipt, error) {
	hash := common.HexToHash(txHash)

	// Poll for receipt with timeout (5 minutes for integration tests)
	deadline := time.Now().Add(5 * time.Minute)
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		receipt, err := s.ethClient.TransactionReceipt(ctx, hash)
		if err == nil && receipt != nil {
			status := uint64(evm.TxStatusSuccess)
			if receipt.Status == 0 {
				status = uint64(evm.TxStatusFailed)
			}
			return &evm.TransactionReceipt{
				Status:      status,
				BlockNumber: receipt.BlockNumber.Uint64(),
				TxHash:      receipt.TxHash.Hex(),
			}, nil
		}

		if time.Now().After(deadline) {
			return nil, fmt.Errorf("transaction receipt not found after 5 minutes: %s", txHash)
		}

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-ticker.C:
			// Continue polling
		}
	}
}

func (s *realFacilitatorEvmSigner) VerifyTypedData(
	ctx context.Context,
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
) (*x402.VerifyResponse, error) {
	// Pass bytes directly to facilitator (it handles unmarshaling internally)
	return l.facilitator.Verify(ctx, payloadBytes, requirementsBytes)
}

func (l *localEvmFacilitatorClient) Settle(
	ctx context.Context,
	payloadBytes []byte,
	requirementsBytes []byte,
) (*x402.SettleResponse, error) {
	// Pass bytes directly to facilitator (it handles unmarshaling internally)
	return l.facilitator.Settle(ctx, payloadBytes, requirementsBytes)
}

func (l *localEvmFacilitatorClient) GetSupported(ctx context.Context) (x402.SupportedResponse, error) {
	// Networks already registered - no parameters needed
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

	t.Run("EVM V2 Flow - x402Client / x402ResourceServer / x402Facilitator", func(t *testing.T) {
		ctx := context.Background()

		// Create real client signer
		clientSigner, err := newRealClientEvmSigner(clientPrivateKey)
		if err != nil {
			t.Fatalf("Failed to create client signer: %v", err)
		}

		// Setup client with EVM v2 scheme
		client := x402.Newx402Client()
		evmClient := evmclient.NewExactEvmScheme(clientSigner)
		// Register for Base Sepolia
		client.Register("eip155:84532", evmClient)

		// Create real facilitator signer
		facilitatorSigner, err := newRealFacilitatorEvmSigner(facilitatorPrivateKey, "https://sepolia.base.org")
		if err != nil {
			t.Fatalf("Failed to create facilitator signer: %v", err)
		}

		// Setup facilitator with EVM v2 scheme
		facilitator := x402.Newx402Facilitator()
		// Enable smart wallet deployment via EIP-6492
		evmConfig := &evmfacilitator.ExactEvmSchemeConfig{
			DeployERC4337WithEIP6492: true,
		}
		evmFacilitator := evmfacilitator.NewExactEvmScheme(facilitatorSigner, evmConfig)
		// Register for Base Sepolia
		facilitator.Register([]x402.Network{"eip155:84532"}, evmFacilitator)

		// Create facilitator client wrapper
		facilitatorClient := &localEvmFacilitatorClient{facilitator: facilitator}

		// Setup resource server with EVM v2
		evmServer := evmserver.NewExactEvmScheme()
		server := x402.Newx402ResourceServer(
			x402.WithFacilitatorClient(facilitatorClient),
		)
		server.Register("eip155:84532", evmServer)

		// Initialize server to fetch supported kinds
		err = server.Initialize(ctx)
		if err != nil {
			t.Fatalf("Failed to initialize server: %v", err)
		}

		// Server - builds PaymentRequired response for 0.001 USDC
		accepts := []types.PaymentRequirements{
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
		resource := &types.ResourceInfo{
			URL:         "https://api.example.com/premium",
			Description: "Premium API Access",
			MimeType:    "application/json",
		}
		paymentRequiredResponse := server.CreatePaymentRequiredResponse(accepts, resource, "", nil)

		// Verify it's V2
		if paymentRequiredResponse.X402Version != 2 {
			t.Errorf("Expected X402Version 2, got %d", paymentRequiredResponse.X402Version)
		}

		// Client - selects payment requirement (V2 typed)
		selected, err := client.SelectPaymentRequirements(accepts)
		if err != nil {
			t.Fatalf("Failed to select payment requirements: %v", err)
		}

		// Client - creates payment payload (V2 typed)
		paymentPayload, err := client.CreatePaymentPayload(ctx, selected, resource, paymentRequiredResponse.Extensions)
		if err != nil {
			t.Fatalf("Failed to create payment payload: %v", err)
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

		// Server - finds matching requirements (typed)
		accepted := server.FindMatchingRequirements(accepts, paymentPayload)
		if accepted == nil {
			t.Fatal("No matching payment requirements found")
		}

		// Server - verifies payment (typed)
		verifyResponse, err := server.VerifyPayment(ctx, paymentPayload, *accepted)
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

		// Server - settles payment (typed)
		settleResponse, err := server.SettlePayment(ctx, paymentPayload, *accepted)
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

// TestEVMIntegrationV2Permit2 tests the full V2 EVM Permit2 payment flow
func TestEVMIntegrationV2Permit2(t *testing.T) {
	// Skip if environment variables not set
	clientPrivateKey := os.Getenv("EVM_CLIENT_PRIVATE_KEY")
	facilitatorPrivateKey := os.Getenv("EVM_FACILITATOR_PRIVATE_KEY")
	resourceServerAddress := os.Getenv("EVM_RESOURCE_SERVER_ADDRESS")

	if clientPrivateKey == "" || facilitatorPrivateKey == "" || resourceServerAddress == "" {
		t.Skip("Skipping EVM Permit2 integration test: EVM_CLIENT_PRIVATE_KEY, EVM_FACILITATOR_PRIVATE_KEY, and EVM_RESOURCE_SERVER_ADDRESS must be set")
	}

	t.Run("EVM V2 Permit2 Flow - x402Client / x402ResourceServer / x402Facilitator", func(t *testing.T) {
		ctx := context.Background()

		// Wait for any pending transactions from previous tests (shared facilitator wallet)
		waitForPendingTransactions(t, ctx, facilitatorPrivateKey, "https://sepolia.base.org")

		// Ensure client wallet has approved Permit2 contract to spend USDC
		ensurePermit2Approval(t, ctx, clientPrivateKey,
			"0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on Base Sepolia
			"https://sepolia.base.org",
		)

		// Create real client signer
		clientSigner, err := newRealClientEvmSigner(clientPrivateKey)
		if err != nil {
			t.Fatalf("Failed to create client signer: %v", err)
		}

		// Setup client with EVM v2 scheme
		client := x402.Newx402Client()
		evmClient := evmclient.NewExactEvmScheme(clientSigner)
		client.Register("eip155:84532", evmClient)

		// Create facilitator signer with Permit2 support
		facilitatorSigner, err := newPermit2FacilitatorEvmSigner(facilitatorPrivateKey, "https://sepolia.base.org")
		if err != nil {
			t.Fatalf("Failed to create facilitator signer: %v", err)
		}

		// Setup facilitator with EVM v2 scheme
		facilitator := x402.Newx402Facilitator()
		evmConfig := &evmfacilitator.ExactEvmSchemeConfig{
			DeployERC4337WithEIP6492: true,
		}
		evmFacilitator := evmfacilitator.NewExactEvmScheme(facilitatorSigner, evmConfig)
		facilitator.Register([]x402.Network{"eip155:84532"}, evmFacilitator)

		// Create facilitator client wrapper
		facilitatorClient := &localEvmFacilitatorClient{facilitator: facilitator}

		// Setup resource server with EVM v2
		evmServer := evmserver.NewExactEvmScheme()
		server := x402.Newx402ResourceServer(
			x402.WithFacilitatorClient(facilitatorClient),
		)
		server.Register("eip155:84532", evmServer)

		// Initialize server to fetch supported kinds
		err = server.Initialize(ctx)
		if err != nil {
			t.Fatalf("Failed to initialize server: %v", err)
		}

		// Server - builds PaymentRequired response with Permit2 method
		accepts := []types.PaymentRequirements{
			{
				Scheme:            evm.SchemeExact,
				Network:           "eip155:84532",
				Asset:             "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on Base Sepolia
				Amount:            "1000",                                       // 0.001 USDC
				PayTo:             resourceServerAddress,
				MaxTimeoutSeconds: 300,
				Extra: map[string]interface{}{
					"assetTransferMethod": "permit2", // Request Permit2 flow
				},
			},
		}
		resource := &types.ResourceInfo{
			URL:         "https://api.example.com/permit2",
			Description: "Permit2 API Access",
			MimeType:    "application/json",
		}
		paymentRequiredResponse := server.CreatePaymentRequiredResponse(accepts, resource, "", nil)

		// Verify it's V2
		if paymentRequiredResponse.X402Version != 2 {
			t.Errorf("Expected X402Version 2, got %d", paymentRequiredResponse.X402Version)
		}

		// Client - selects payment requirement
		selected, err := client.SelectPaymentRequirements(accepts)
		if err != nil {
			t.Fatalf("Failed to select payment requirements: %v", err)
		}

		// Client - creates payment payload (should use Permit2 due to assetTransferMethod)
		paymentPayload, err := client.CreatePaymentPayload(ctx, selected, resource, paymentRequiredResponse.Extensions)
		if err != nil {
			t.Fatalf("Failed to create payment payload: %v", err)
		}

		// Verify payload is V2
		if paymentPayload.X402Version != 2 {
			t.Errorf("Expected payload X402Version 2, got %d", paymentPayload.X402Version)
		}

		// Verify this is a Permit2 payload
		if !evm.IsPermit2Payload(paymentPayload.Payload) {
			t.Error("Expected Permit2 payload, got EIP-3009 payload")
		}

		// Parse and verify Permit2 payload structure
		permit2Payload, err := evm.Permit2PayloadFromMap(paymentPayload.Payload)
		if err != nil {
			t.Fatalf("Failed to parse Permit2 payload: %v", err)
		}

		if permit2Payload.Permit2Authorization.From != clientSigner.Address() {
			t.Errorf("Expected from address %s, got %s", clientSigner.Address(), permit2Payload.Permit2Authorization.From)
		}

		if permit2Payload.Permit2Authorization.Spender != evm.X402ExactPermit2ProxyAddress {
			t.Errorf("Expected spender %s, got %s", evm.X402ExactPermit2ProxyAddress, permit2Payload.Permit2Authorization.Spender)
		}

		if !strings.EqualFold(permit2Payload.Permit2Authorization.Witness.To, resourceServerAddress) {
			t.Errorf("Expected witness.to %s, got %s", resourceServerAddress, permit2Payload.Permit2Authorization.Witness.To)
		}

		// Server - finds matching requirements
		accepted := server.FindMatchingRequirements(accepts, paymentPayload)
		if accepted == nil {
			t.Fatal("No matching payment requirements found")
		}

		// Server - verifies payment
		verifyResponse, err := server.VerifyPayment(ctx, paymentPayload, *accepted)
		if err != nil {
			t.Fatalf("Failed to verify payment: %v", err)
		}

		if !verifyResponse.IsValid {
			t.Fatalf("Payment verification failed: %s", verifyResponse.InvalidReason)
		}

		if !strings.EqualFold(verifyResponse.Payer, clientSigner.Address()) {
			t.Errorf("Expected payer %s, got %s", clientSigner.Address(), verifyResponse.Payer)
		}

		// Server - settles payment
		settleResponse, err := server.SettlePayment(ctx, paymentPayload, *accepted)
		if err != nil {
			t.Fatalf("Failed to settle payment: %v", err)
		}

		if !settleResponse.Success {
			t.Fatalf("Payment settlement failed: %s", settleResponse.ErrorReason)
		}

		if settleResponse.Transaction == "" {
			t.Error("Expected transaction hash in settlement response")
		}

		if settleResponse.Network != "eip155:84532" {
			t.Errorf("Expected network eip155:84532, got %s", settleResponse.Network)
		}
	})
}

// newPermit2FacilitatorEvmSigner creates a facilitator signer with Permit2 support
func newPermit2FacilitatorEvmSigner(privateKeyHex string, rpcURL string) (*permit2FacilitatorEvmSigner, error) {
	privateKeyHex = strings.TrimPrefix(privateKeyHex, "0x")

	privateKey, err := crypto.HexToECDSA(privateKeyHex)
	if err != nil {
		return nil, fmt.Errorf("failed to parse private key: %w", err)
	}

	address := crypto.PubkeyToAddress(privateKey.PublicKey)

	client, err := ethclient.Dial(rpcURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RPC: %w", err)
	}

	ctx := context.Background()
	chainID, err := client.ChainID(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get chain ID: %w", err)
	}

	return &permit2FacilitatorEvmSigner{
		privateKey: privateKey,
		address:    address,
		ethClient:  client,
		chainID:    chainID,
		rpcURL:     rpcURL,
	}, nil
}

// permit2FacilitatorEvmSigner extends realFacilitatorEvmSigner with Permit2 support
type permit2FacilitatorEvmSigner struct {
	privateKey *ecdsa.PrivateKey
	address    common.Address
	ethClient  *ethclient.Client
	chainID    *big.Int
	rpcURL     string
}

func (s *permit2FacilitatorEvmSigner) GetAddresses() []string {
	return []string{s.address.Hex()}
}

func (s *permit2FacilitatorEvmSigner) GetBalance(ctx context.Context, address string, tokenAddress string) (*big.Int, error) {
	return big.NewInt(1000000000000), nil
}

func (s *permit2FacilitatorEvmSigner) GetChainID(ctx context.Context) (*big.Int, error) {
	return s.chainID, nil
}

func (s *permit2FacilitatorEvmSigner) GetCode(ctx context.Context, address string) ([]byte, error) {
	addr := common.HexToAddress(address)
	return s.ethClient.CodeAt(ctx, addr, nil)
}

func (s *permit2FacilitatorEvmSigner) ReadContract(
	ctx context.Context,
	contractAddress string,
	abiBytes []byte,
	functionName string,
	args ...interface{},
) (interface{}, error) {
	// For authorizationState, assume nonce not used (random nonces are unique)
	if functionName == "authorizationState" {
		return false, nil
	}

	// For allowance, read real on-chain value (fall back to MaxUint256 on any error)
	if functionName == "allowance" {
		contractABI, parseErr := abi.JSON(strings.NewReader(string(abiBytes)))
		if parseErr != nil {
			return evm.MaxUint256(), nil //nolint:nilerr // fallback to assume approved
		}
		callData, packErr := contractABI.Pack(functionName, args...)
		if packErr != nil {
			return evm.MaxUint256(), nil //nolint:nilerr // fallback to assume approved
		}
		addr := common.HexToAddress(contractAddress)
		result, callErr := s.ethClient.CallContract(ctx, ethereum.CallMsg{
			To:   &addr,
			Data: callData,
		}, nil)
		if callErr != nil {
			return evm.MaxUint256(), nil //nolint:nilerr // fallback to assume approved
		}
		return new(big.Int).SetBytes(result), nil
	}

	return nil, fmt.Errorf("read contract not fully implemented for integration tests")
}

func (s *permit2FacilitatorEvmSigner) WriteContract(
	ctx context.Context,
	contractAddress string,
	abiBytes []byte,
	functionName string,
	args ...interface{},
) (string, error) {
	contractABI, err := abi.JSON(strings.NewReader(string(abiBytes)))
	if err != nil {
		return "", fmt.Errorf("failed to parse ABI: %w", err)
	}

	data, err := contractABI.Pack(functionName, args...)
	if err != nil {
		return "", fmt.Errorf("failed to pack method call: %w", err)
	}

	to := common.HexToAddress(contractAddress)
	return s.sendTxWithRetry(ctx, to, data, 300000)
}

func (s *permit2FacilitatorEvmSigner) SendTransaction(
	ctx context.Context,
	to string,
	data []byte,
) (string, error) {
	toAddr := common.HexToAddress(to)
	return s.sendTxWithRetry(ctx, toAddr, data, 300000)
}

// sendTxWithRetry sends a transaction, retrying on nonce conflicts from back-to-back tests.
func (s *permit2FacilitatorEvmSigner) sendTxWithRetry(ctx context.Context, to common.Address, data []byte, gasLimit uint64) (string, error) {
	const maxRetries = 5

	for attempt := 0; attempt <= maxRetries; attempt++ {
		nonce, err := s.ethClient.PendingNonceAt(ctx, s.address)
		if err != nil {
			return "", fmt.Errorf("failed to get nonce: %w", err)
		}

		gasPrice, err := s.ethClient.SuggestGasPrice(ctx)
		if err != nil {
			return "", fmt.Errorf("failed to get gas price: %w", err)
		}

		if attempt > 0 {
			bump := new(big.Int).Div(gasPrice, big.NewInt(5))
			gasPrice.Add(gasPrice, bump)
		}

		tx := ethtypes.NewTransaction(nonce, to, big.NewInt(0), gasLimit, gasPrice, data)
		signedTx, err := ethtypes.SignTx(tx, ethtypes.LatestSignerForChainID(s.chainID), s.privateKey)
		if err != nil {
			return "", fmt.Errorf("failed to sign transaction: %w", err)
		}

		err = s.ethClient.SendTransaction(ctx, signedTx)
		if err != nil {
			if strings.Contains(err.Error(), "replacement transaction underpriced") && attempt < maxRetries {
				time.Sleep(time.Duration(2*(attempt+1)) * time.Second)
				continue
			}
			return "", fmt.Errorf("failed to send transaction: %w", err)
		}

		return signedTx.Hash().Hex(), nil
	}
	return "", fmt.Errorf("failed to send transaction after %d retries", maxRetries)
}

func (s *permit2FacilitatorEvmSigner) WaitForTransactionReceipt(ctx context.Context, txHash string) (*evm.TransactionReceipt, error) {
	hash := common.HexToHash(txHash)

	// Poll for receipt with timeout (5 minutes for integration tests)
	deadline := time.Now().Add(5 * time.Minute)
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		receipt, err := s.ethClient.TransactionReceipt(ctx, hash)
		if err == nil && receipt != nil {
			status := uint64(evm.TxStatusSuccess)
			if receipt.Status == 0 {
				status = uint64(evm.TxStatusFailed)
			}
			return &evm.TransactionReceipt{
				Status:      status,
				BlockNumber: receipt.BlockNumber.Uint64(),
				TxHash:      receipt.TxHash.Hex(),
			}, nil
		}

		if time.Now().After(deadline) {
			return nil, fmt.Errorf("transaction receipt not found after 5 minutes: %s", txHash)
		}

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-ticker.C:
			// Continue polling
		}
	}
}

func (s *permit2FacilitatorEvmSigner) VerifyTypedData(
	ctx context.Context,
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

// waitForPendingTransactions waits until the given wallet has no pending transactions.
// This prevents "replacement transaction underpriced" errors when tests share the same
// wallet and run back-to-back.
func waitForPendingTransactions(t *testing.T, ctx context.Context, privateKeyHex string, rpcURL string) {
	t.Helper()

	pkHex := strings.TrimPrefix(privateKeyHex, "0x")
	pk, err := crypto.HexToECDSA(pkHex)
	if err != nil {
		t.Fatalf("Failed to parse private key for nonce check: %v", err)
	}
	address := crypto.PubkeyToAddress(pk.PublicKey)

	client, err := ethclient.Dial(rpcURL)
	if err != nil {
		t.Fatalf("Failed to connect to RPC for nonce check: %v", err)
	}
	defer client.Close()

	deadline := time.Now().Add(2 * time.Minute)
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		confirmedNonce, err := client.NonceAt(ctx, address, nil)
		if err != nil {
			t.Fatalf("Failed to get confirmed nonce: %v", err)
		}
		pendingNonce, err := client.PendingNonceAt(ctx, address)
		if err != nil {
			t.Fatalf("Failed to get pending nonce: %v", err)
		}

		if pendingNonce == confirmedNonce {
			return
		}

		t.Logf("⏳ Waiting for pending transactions to clear (confirmed=%d, pending=%d)...", confirmedNonce, pendingNonce)

		if time.Now().After(deadline) {
			t.Fatalf("Pending transactions did not clear after 2 minutes")
		}

		select {
		case <-ctx.Done():
			t.Fatalf("Context cancelled waiting for pending transactions")
		case <-ticker.C:
		}
	}
}

// ensurePermit2Approval checks if the client wallet has approved the Permit2 contract
// to spend the given token. If the allowance is insufficient, it sends an approval transaction
// and waits for it to be mined.
func ensurePermit2Approval(t *testing.T, ctx context.Context, clientPrivateKey string, tokenAddress string, rpcURL string) {
	t.Helper()

	privateKeyHex := strings.TrimPrefix(clientPrivateKey, "0x")
	privateKey, err := crypto.HexToECDSA(privateKeyHex)
	if err != nil {
		t.Fatalf("Failed to parse client private key for approval: %v", err)
	}

	clientAddress := crypto.PubkeyToAddress(privateKey.PublicKey)
	ethClient, err := ethclient.Dial(rpcURL)
	if err != nil {
		t.Fatalf("Failed to connect to RPC for approval check: %v", err)
	}
	defer ethClient.Close()

	// Check current allowance: token.allowance(client, PERMIT2)
	permit2Addr := common.HexToAddress(evm.PERMIT2Address)
	tokenAddr := common.HexToAddress(tokenAddress)

	erc20ABI, err := abi.JSON(strings.NewReader(string(evm.ERC20AllowanceABI)))
	if err != nil {
		t.Fatalf("Failed to parse ERC20 allowance ABI: %v", err)
	}

	callData, err := erc20ABI.Pack("allowance", clientAddress, permit2Addr)
	if err != nil {
		t.Fatalf("Failed to pack allowance call: %v", err)
	}

	result, err := ethClient.CallContract(ctx, ethereum.CallMsg{
		To:   &tokenAddr,
		Data: callData,
	}, nil)
	if err != nil {
		t.Fatalf("Failed to call allowance: %v", err)
	}

	allowance := new(big.Int).SetBytes(result)
	// MaxUint256 / 2 as threshold — if allowance is already huge, skip approval
	threshold := new(big.Int).Div(evm.MaxUint256(), big.NewInt(2))

	if allowance.Cmp(threshold) >= 0 {
		t.Logf("✅ Permit2 allowance already sufficient: %s", allowance.String())
		return
	}

	t.Logf("⚠️  Permit2 allowance insufficient (%s), sending approval transaction...", allowance.String())

	// Build approve(PERMIT2, MaxUint256) transaction
	approveABI, err := abi.JSON(strings.NewReader(string(evm.ERC20ApproveABI)))
	if err != nil {
		t.Fatalf("Failed to parse ERC20 approve ABI: %v", err)
	}

	approveData, err := approveABI.Pack("approve", permit2Addr, evm.MaxUint256())
	if err != nil {
		t.Fatalf("Failed to pack approve call: %v", err)
	}

	nonce, err := ethClient.PendingNonceAt(ctx, clientAddress)
	if err != nil {
		t.Fatalf("Failed to get nonce for approval: %v", err)
	}

	gasPrice, err := ethClient.SuggestGasPrice(ctx)
	if err != nil {
		t.Fatalf("Failed to get gas price for approval: %v", err)
	}

	chainID, err := ethClient.ChainID(ctx)
	if err != nil {
		t.Fatalf("Failed to get chain ID for approval: %v", err)
	}

	tx := ethtypes.NewTransaction(nonce, tokenAddr, big.NewInt(0), 100000, gasPrice, approveData)
	signedTx, err := ethtypes.SignTx(tx, ethtypes.LatestSignerForChainID(chainID), privateKey)
	if err != nil {
		t.Fatalf("Failed to sign approval transaction: %v", err)
	}

	err = ethClient.SendTransaction(ctx, signedTx)
	if err != nil {
		t.Fatalf("Failed to send approval transaction: %v", err)
	}

	t.Logf("📤 Approval tx sent: %s", signedTx.Hash().Hex())

	// Wait for receipt
	deadline := time.Now().Add(2 * time.Minute)
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		receipt, err := ethClient.TransactionReceipt(ctx, signedTx.Hash())
		if err == nil && receipt != nil {
			if receipt.Status == 1 {
				t.Logf("✅ Permit2 approval confirmed in block %d", receipt.BlockNumber.Uint64())
				return
			}
			t.Fatalf("Permit2 approval transaction reverted (status=0)")
		}

		if time.Now().After(deadline) {
			t.Fatalf("Permit2 approval transaction not mined after 2 minutes")
		}

		select {
		case <-ctx.Done():
			t.Fatalf("Context cancelled waiting for approval receipt")
		case <-ticker.C:
		}
	}
}

// TestPermit2TypeGuards tests the Permit2 type guard functions
func TestPermit2TypeGuards(t *testing.T) {
	t.Run("IsPermit2Payload returns true for Permit2 payloads", func(t *testing.T) {
		payload := map[string]interface{}{
			"signature": "0x1234",
			"permit2Authorization": map[string]interface{}{
				"from": "0x1234567890123456789012345678901234567890",
			},
		}
		if !evm.IsPermit2Payload(payload) {
			t.Error("Expected IsPermit2Payload to return true")
		}
		if evm.IsEIP3009Payload(payload) {
			t.Error("Expected IsEIP3009Payload to return false")
		}
	})

	t.Run("IsEIP3009Payload returns true for EIP-3009 payloads", func(t *testing.T) {
		payload := map[string]interface{}{
			"signature": "0x1234",
			"authorization": map[string]interface{}{
				"from": "0x1234567890123456789012345678901234567890",
			},
		}
		if !evm.IsEIP3009Payload(payload) {
			t.Error("Expected IsEIP3009Payload to return true")
		}
		if evm.IsPermit2Payload(payload) {
			t.Error("Expected IsPermit2Payload to return false")
		}
	})
}

// TestPermit2PayloadParsing tests Permit2 payload parsing
func TestPermit2PayloadParsing(t *testing.T) {
	t.Run("Permit2PayloadFromMap parses correctly", func(t *testing.T) {
		payloadMap := map[string]interface{}{
			"signature": "0xabcdef",
			"permit2Authorization": map[string]interface{}{
				"from":     "0x1234567890123456789012345678901234567890",
				"spender":  evm.X402ExactPermit2ProxyAddress,
				"nonce":    "12345",
				"deadline": "9999999999",
				"permitted": map[string]interface{}{
					"token":  "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
					"amount": "1000000",
				},
				"witness": map[string]interface{}{
					"to":         "0x9876543210987654321098765432109876543210",
					"validAfter": "0",
					"extra":      "0x",
				},
			},
		}

		payload, err := evm.Permit2PayloadFromMap(payloadMap)
		if err != nil {
			t.Fatalf("Failed to parse payload: %v", err)
		}

		if payload.Signature != "0xabcdef" {
			t.Errorf("Expected signature 0xabcdef, got %s", payload.Signature)
		}

		if payload.Permit2Authorization.From != "0x1234567890123456789012345678901234567890" {
			t.Errorf("Unexpected from address: %s", payload.Permit2Authorization.From)
		}

		if payload.Permit2Authorization.Spender != evm.X402ExactPermit2ProxyAddress {
			t.Errorf("Unexpected spender: %s", payload.Permit2Authorization.Spender)
		}

		if payload.Permit2Authorization.Permitted.Amount != "1000000" {
			t.Errorf("Unexpected amount: %s", payload.Permit2Authorization.Permitted.Amount)
		}

		if payload.Permit2Authorization.Witness.To != "0x9876543210987654321098765432109876543210" {
			t.Errorf("Unexpected witness.to: %s", payload.Permit2Authorization.Witness.To)
		}
	})

	t.Run("Permit2PayloadFromMap rejects missing permit2Authorization", func(t *testing.T) {
		payloadMap := map[string]interface{}{
			"signature": "0xabcdef",
			// permit2Authorization is missing
		}

		_, err := evm.Permit2PayloadFromMap(payloadMap)
		if err == nil {
			t.Error("Expected error for missing permit2Authorization")
		}
	})

	t.Run("Permit2PayloadFromMap rejects missing required fields", func(t *testing.T) {
		testCases := []struct {
			name       string
			payloadMap map[string]interface{}
		}{
			{
				name: "missing from",
				payloadMap: map[string]interface{}{
					"signature": "0xabcdef",
					"permit2Authorization": map[string]interface{}{
						"spender":  evm.X402ExactPermit2ProxyAddress,
						"nonce":    "12345",
						"deadline": "9999999999",
						"permitted": map[string]interface{}{
							"token":  "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
							"amount": "1000000",
						},
						"witness": map[string]interface{}{
							"to":         "0x9876543210987654321098765432109876543210",
							"validAfter": "0",
						},
					},
				},
			},
			{
				name: "missing spender",
				payloadMap: map[string]interface{}{
					"signature": "0xabcdef",
					"permit2Authorization": map[string]interface{}{
						"from":     "0x1234567890123456789012345678901234567890",
						"nonce":    "12345",
						"deadline": "9999999999",
						"permitted": map[string]interface{}{
							"token":  "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
							"amount": "1000000",
						},
						"witness": map[string]interface{}{
							"to":         "0x9876543210987654321098765432109876543210",
							"validAfter": "0",
						},
					},
				},
			},
			{
				name: "missing permitted",
				payloadMap: map[string]interface{}{
					"signature": "0xabcdef",
					"permit2Authorization": map[string]interface{}{
						"from":     "0x1234567890123456789012345678901234567890",
						"spender":  evm.X402ExactPermit2ProxyAddress,
						"nonce":    "12345",
						"deadline": "9999999999",
						"witness": map[string]interface{}{
							"to":         "0x9876543210987654321098765432109876543210",
							"validAfter": "0",
						},
					},
				},
			},
			{
				name: "missing witness",
				payloadMap: map[string]interface{}{
					"signature": "0xabcdef",
					"permit2Authorization": map[string]interface{}{
						"from":     "0x1234567890123456789012345678901234567890",
						"spender":  evm.X402ExactPermit2ProxyAddress,
						"nonce":    "12345",
						"deadline": "9999999999",
						"permitted": map[string]interface{}{
							"token":  "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
							"amount": "1000000",
						},
					},
				},
			},
		}

		for _, tc := range testCases {
			t.Run(tc.name, func(t *testing.T) {
				_, err := evm.Permit2PayloadFromMap(tc.payloadMap)
				if err == nil {
					t.Errorf("Expected error for %s", tc.name)
				}
			})
		}
	})

	t.Run("Permit2PayloadFromMap defaults extra to 0x when missing", func(t *testing.T) {
		payloadMap := map[string]interface{}{
			"signature": "0xabcdef",
			"permit2Authorization": map[string]interface{}{
				"from":     "0x1234567890123456789012345678901234567890",
				"spender":  evm.X402ExactPermit2ProxyAddress,
				"nonce":    "12345",
				"deadline": "9999999999",
				"permitted": map[string]interface{}{
					"token":  "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
					"amount": "1000000",
				},
				"witness": map[string]interface{}{
					"to":         "0x9876543210987654321098765432109876543210",
					"validAfter": "0",
					// extra is missing - should default to "0x"
				},
			},
		}

		payload, err := evm.Permit2PayloadFromMap(payloadMap)
		if err != nil {
			t.Fatalf("Failed to parse payload: %v", err)
		}

		if payload.Permit2Authorization.Witness.Extra != "0x" {
			t.Errorf("Expected extra to default to 0x, got %s", payload.Permit2Authorization.Witness.Extra)
		}
	})

	t.Run("Permit2Payload ToMap round-trips correctly", func(t *testing.T) {
		original := &evm.ExactPermit2Payload{
			Signature: "0xsignature",
			Permit2Authorization: evm.Permit2Authorization{
				From: "0x1111111111111111111111111111111111111111",
				Permitted: evm.Permit2TokenPermissions{
					Token:  "0x2222222222222222222222222222222222222222",
					Amount: "500000",
				},
				Spender:  evm.X402ExactPermit2ProxyAddress,
				Nonce:    "99999",
				Deadline: "1234567890",
				Witness: evm.Permit2Witness{
					To:         "0x3333333333333333333333333333333333333333",
					ValidAfter: "100",
					Extra:      "0x",
				},
			},
		}

		payloadMap := original.ToMap()
		parsed, err := evm.Permit2PayloadFromMap(payloadMap)
		if err != nil {
			t.Fatalf("Failed to parse: %v", err)
		}

		if parsed.Signature != original.Signature {
			t.Errorf("Signature mismatch: %s != %s", parsed.Signature, original.Signature)
		}

		if parsed.Permit2Authorization.From != original.Permit2Authorization.From {
			t.Errorf("From mismatch")
		}

		if parsed.Permit2Authorization.Permitted.Amount != original.Permit2Authorization.Permitted.Amount {
			t.Errorf("Amount mismatch")
		}
	})
}

// TestPermit2Nonce tests Permit2 nonce generation
func TestPermit2Nonce(t *testing.T) {
	t.Run("CreatePermit2Nonce generates valid nonce", func(t *testing.T) {
		nonce, err := evm.CreatePermit2Nonce()
		if err != nil {
			t.Fatalf("Failed to create nonce: %v", err)
		}

		// Should be a decimal string (not hex)
		if strings.HasPrefix(nonce, "0x") {
			t.Error("Permit2 nonce should be decimal string, not hex")
		}

		// Should be parseable as a big int
		_, ok := new(big.Int).SetString(nonce, 10)
		if !ok {
			t.Errorf("Nonce is not a valid decimal number: %s", nonce)
		}
	})

	t.Run("CreatePermit2Nonce generates unique nonces", func(t *testing.T) {
		nonces := make(map[string]bool)
		for i := 0; i < 100; i++ {
			nonce, err := evm.CreatePermit2Nonce()
			if err != nil {
				t.Fatalf("Failed to create nonce: %v", err)
			}
			if nonces[nonce] {
				t.Error("Duplicate nonce generated")
			}
			nonces[nonce] = true
		}
	})
}

// TestEVMIntegrationV1 - SKIPPED: V1 flow not supported in V2-only server
// TODO: Reimplement if legacy server support is needed
/*
func TestEVMIntegrationV1(t *testing.T) {
	// Skip if environment variables not set
	clientPrivateKey := os.Getenv("EVM_CLIENT_PRIVATE_KEY")
	facilitatorPrivateKey := os.Getenv("EVM_FACILITATOR_PRIVATE_KEY")
	resourceServerAddress := os.Getenv("EVM_RESOURCE_SERVER_ADDRESS")

	if clientPrivateKey == "" || facilitatorPrivateKey == "" || resourceServerAddress == "" {
		t.Skip("Skipping EVM V1 integration test: EVM_CLIENT_PRIVATE_KEY, EVM_FACILITATOR_PRIVATE_KEY, and EVM_RESOURCE_SERVER_ADDRESS must be set")
	}

	t.Run("EVM V1 Flow (Legacy) - x402Client / x402ResourceServer / x402Facilitator", func(t *testing.T) {
		ctx := context.Background()

		// Create real client signer
		clientSigner, err := newRealClientEvmSigner(clientPrivateKey)
		if err != nil {
			t.Fatalf("Failed to create client signer: %v", err)
		}

		// Setup client with EVM v1 scheme
		client := x402.Newx402Client()
		evmClientV1 := evmv1client.NewExactEvmSchemeV1(clientSigner)
		// Register for Base Sepolia using V1 registration
		client.RegisterV1("eip155:84532", evmClientV1)

		// Create real facilitator signer
		facilitatorSigner, err := newRealFacilitatorEvmSigner(facilitatorPrivateKey, "https://sepolia.base.org")
		if err != nil {
			t.Fatalf("Failed to create facilitator signer: %v", err)
		}

		// Setup facilitator with EVM v1 scheme
		facilitator := x402.Newx402Facilitator()
		evmFacilitatorV1 := evmv1facilitator.NewExactEvmSchemeV1(facilitatorSigner, nil)
		// Register for Base Sepolia using V1 registration
		facilitator.RegisterV1([]x402.Network{"eip155:84532"}, evmFacilitatorV1)

		// Create facilitator client wrapper
		facilitatorClient := &localEvmFacilitatorClient{facilitator: facilitator}

		// Setup resource server with EVM v1
		// V1 doesn't have separate server, uses V2 server
		evmServerV1 := evmserver.NewExactEvmScheme()
		server := x402.Newx402ResourceServer(
			x402.WithFacilitatorClient(facilitatorClient),
		)
		server.Register("eip155:84532", evmServerV1)

		// Initialize server to fetch supported kinds
		err = server.Initialize(ctx)
		if err != nil {
			t.Fatalf("Failed to initialize server: %v", err)
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
		accepted := server.FindMatchingRequirements(accepts, payloadBytes)
		if accepted == nil {
			t.Fatal("No matching payment requirements found")
		}

		// Server - verifies payment (marshal accepted requirements)
		acceptedBytes, err := json.Marshal(accepted)
		if err != nil {
			t.Fatalf("Failed to marshal accepted requirements: %v", err)
		}

		verifyResponse, err := server.VerifyPayment(ctx, payloadBytes, acceptedBytes)
		if err != nil {
			t.Fatalf("Failed to verify payment: %v", err)
		}

		if verifyResponse == nil {
			t.Fatal("Expected verify response")
		}

		if !strings.EqualFold(verifyResponse.Payer, clientSigner.Address()) {
			t.Errorf("Expected payer %s, got %s", clientSigner.Address(), verifyResponse.Payer)
		}

		// Server does work here...

		// Server - settles payment (REAL ON-CHAIN TRANSACTION)
		settleResponse, err := server.SettlePayment(ctx, payloadBytes, acceptedBytes)
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
*/

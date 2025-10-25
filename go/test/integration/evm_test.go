// Package integration_test contains integration tests for the x402 Go SDK.
// This file specifically tests the EVM mechanism integration with both V1 and V2 implementations.
package integration_test

import (
	"context"
	"math/big"
	"testing"

	x402 "github.com/coinbase/x402-go/v2"
	"github.com/coinbase/x402-go/v2/mechanisms/evm"
	evmv1 "github.com/coinbase/x402-go/v2/mechanisms/evm/v1"
)

// Mock EVM signer for client
type mockClientEvmSigner struct {
	address string
}

func (m *mockClientEvmSigner) Address() string {
	if m.address == "" {
		return "0x1234567890123456789012345678901234567890"
	}
	return m.address
}

func (m *mockClientEvmSigner) SignTypedData(
	domain evm.TypedDataDomain,
	types map[string][]evm.TypedDataField,
	primaryType string,
	message map[string]interface{},
) ([]byte, error) {
	// Return a mock signature (65 bytes)
	sig := make([]byte, 65)
	// Set v to 27 (common value for Ethereum signatures)
	sig[64] = 27
	return sig, nil
}

// Mock EVM signer for facilitator
type mockFacilitatorEvmSigner struct {
	balances map[string]*big.Int
	nonces   map[string]bool
}

func newMockFacilitatorEvmSigner() *mockFacilitatorEvmSigner {
	return &mockFacilitatorEvmSigner{
		balances: make(map[string]*big.Int),
		nonces:   make(map[string]bool),
	}
}

func (m *mockFacilitatorEvmSigner) Address() string {
	return "0xfacilitator1234567890123456789012345678"
}

func (m *mockFacilitatorEvmSigner) GetBalance(address string, tokenAddress string) (*big.Int, error) {
	key := address + ":" + tokenAddress
	if balance, ok := m.balances[key]; ok {
		return balance, nil
	}
	// Default to sufficient balance
	return big.NewInt(10000000000), nil // 10,000 USDC
}

func (m *mockFacilitatorEvmSigner) GetChainID() (*big.Int, error) {
	return big.NewInt(8453), nil // Base mainnet
}

func (m *mockFacilitatorEvmSigner) ReadContract(
	contractAddress string,
	abi []byte,
	functionName string,
	args ...interface{},
) (interface{}, error) {
	// Mock authorization state check
	if functionName == "authorizationState" {
		// Return false (not used)
		return false, nil
	}
	return nil, nil
}

func (m *mockFacilitatorEvmSigner) WriteContract(
	contractAddress string,
	abi []byte,
	functionName string,
	args ...interface{},
) (string, error) {
	// Return mock transaction hash
	return "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef", nil
}

func (m *mockFacilitatorEvmSigner) WaitForTransactionReceipt(txHash string) (*evm.TransactionReceipt, error) {
	return &evm.TransactionReceipt{
		Status: evm.TxStatusSuccess,
	}, nil
}

func (m *mockFacilitatorEvmSigner) VerifyTypedData(
	address string,
	domain evm.TypedDataDomain,
	types map[string][]evm.TypedDataField,
	primaryType string,
	message map[string]interface{},
	signature []byte,
) (bool, error) {
	// For testing, verify that the address matches one of our mock clients
	return address == "0x1234567890123456789012345678901234567890" ||
		address == "0xabcdef1234567890123456789012345678901234", nil
}

// Local facilitator client for testing
type localEvmFacilitatorClient struct {
	facilitator x402.X402Facilitator
}

func (l *localEvmFacilitatorClient) Verify(
	ctx context.Context,
	payload x402.PaymentPayload,
	requirements x402.PaymentRequirements,
) (x402.VerifyResponse, error) {
	return l.facilitator.Verify(ctx, payload, requirements)
}

func (l *localEvmFacilitatorClient) Settle(
	ctx context.Context,
	payload x402.PaymentPayload,
	requirements x402.PaymentRequirements,
) (x402.SettleResponse, error) {
	return l.facilitator.Settle(ctx, payload, requirements)
}

func (l *localEvmFacilitatorClient) GetSupported(ctx context.Context) (x402.SupportedResponse, error) {
	return l.facilitator.GetSupported(), nil
}

// TestEVMIntegrationV2 tests the integration with EVM V2 (default)
func TestEVMIntegrationV2(t *testing.T) {
	t.Run("EVM V2 Flow - x402Client / x402ResourceService / x402Facilitator", func(t *testing.T) {
		ctx := context.Background()

		// Setup client with EVM v2 scheme
		clientSigner := &mockClientEvmSigner{}
		client := x402.Newx402Client()
		evmClient := evm.NewExactEvmClient(clientSigner)
		// Register for the Base network
		client.RegisterScheme("eip155:8453", evmClient)

		// Setup facilitator with EVM v2 scheme
		facilitatorSigner := newMockFacilitatorEvmSigner()
		facilitator := x402.Newx402Facilitator()
		evmFacilitator := evm.NewExactEvmFacilitator(facilitatorSigner)
		// Register for the Base network
		facilitator.RegisterScheme("eip155:8453", evmFacilitator)

		// Create facilitator client wrapper
		facilitatorClient := &localEvmFacilitatorClient{facilitator: *facilitator}

		// Setup resource service with EVM v2
		evmService := evm.NewExactEvmService()
		service := x402.Newx402ResourceService(
			x402.WithFacilitatorClient(facilitatorClient),
		)
		service.RegisterScheme("eip155:8453", evmService)

		// Initialize service to fetch supported kinds
		err := service.Initialize(ctx)
		if err != nil {
			t.Fatalf("Failed to initialize service: %v", err)
		}

		// Server - builds PaymentRequired response for 5 USDC
		accepts := []x402.PaymentRequirements{
			{
				Scheme:  evm.SchemeExact,
				Network: "eip155:8453",
				Asset:   "erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC on Base
				Amount:  "5000000",                                          // 5 USDC in smallest unit
				PayTo:   "0x9876543210987654321098765432109876543210",
				Extra: map[string]interface{}{
					"name":    "USD Coin",
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

		paymentPayload, err := client.CreatePaymentPayload(ctx, paymentRequiredResponse.X402Version, selected)
		if err != nil {
			t.Fatalf("Failed to create payment payload: %v", err)
		}

		// Verify payload is V2
		if paymentPayload.X402Version != 2 {
			t.Errorf("Expected payload X402Version 2, got %d", paymentPayload.X402Version)
		}

		// Verify payload structure
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

		if evmPayload.Authorization.Value != "5000000" {
			t.Errorf("Expected value 5000000, got %s", evmPayload.Authorization.Value)
		}

		// Server - maps payment payload to payment requirements
		accepted := service.FindMatchingRequirements(accepts, paymentPayload)
		if accepted == nil {
			t.Fatal("No matching payment requirements found")
		}

		// Server - verifies payment
		verifyResponse, err := service.VerifyPayment(ctx, paymentPayload, *accepted)
		if err != nil {
			t.Fatalf("Failed to verify payment: %v", err)
		}

		if !verifyResponse.IsValid {
			t.Fatalf("Payment verification failed: %s", verifyResponse.InvalidReason)
		}

		if verifyResponse.Payer != clientSigner.Address() {
			t.Errorf("Expected payer %s, got %s", clientSigner.Address(), verifyResponse.Payer)
		}

		// Server does work here...

		// Server - settles payment
		settleResponse, err := service.SettlePayment(ctx, paymentPayload, *accepted)
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

		if settleResponse.Network != "eip155:8453" {
			t.Errorf("Expected network eip155:8453, got %s", settleResponse.Network)
		}

		if settleResponse.Payer != clientSigner.Address() {
			t.Errorf("Expected payer %s, got %s", clientSigner.Address(), settleResponse.Payer)
		}
	})
}

// TestEVMIntegrationV1 tests the integration with EVM V1 (legacy)
func TestEVMIntegrationV1(t *testing.T) {
	t.Run("EVM V1 Flow (Legacy) - x402Client / x402ResourceService / x402Facilitator", func(t *testing.T) {
		ctx := context.Background()

		// Setup client with EVM v1 scheme
		clientSigner := &mockClientEvmSigner{
			address: "0xabcdef1234567890123456789012345678901234",
		}
		client := x402.Newx402Client()
		evmClientV1 := evmv1.NewExactEvmClientV1(clientSigner)
		// Register for the Base network using V1 registration
		client.RegisterSchemeV1("eip155:8453", evmClientV1)

		// Setup facilitator with EVM v1 scheme
		facilitatorSigner := newMockFacilitatorEvmSigner()
		facilitator := x402.Newx402Facilitator()
		evmFacilitatorV1 := evmv1.NewExactEvmFacilitatorV1(facilitatorSigner)
		// Register for the Base network using V1 registration
		facilitator.RegisterSchemeV1("eip155:8453", evmFacilitatorV1)

		// Create facilitator client wrapper
		facilitatorClient := &localEvmFacilitatorClient{facilitator: *facilitator}

		// Setup resource service with EVM v1
		evmServiceV1 := evmv1.NewExactEvmServiceV1()
		service := x402.Newx402ResourceService(
			x402.WithFacilitatorClient(facilitatorClient),
		)
		service.RegisterScheme("eip155:8453", evmServiceV1)

		// Initialize service to fetch supported kinds
		err := service.Initialize(ctx)
		if err != nil {
			t.Fatalf("Failed to initialize service: %v", err)
		}

		// Server - builds PaymentRequired response for 10 USDC (V1 uses version 1)
		accepts := []x402.PaymentRequirements{
			{
				Scheme:  evm.SchemeExact,
				Network: "eip155:8453",
				Asset:   "erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC on Base
				Amount:  "10000000",                                         // 10 USDC in smallest unit
				PayTo:   "0x5555666677778888999900001111222233334444",
				Extra: map[string]interface{}{
					"name":    "USD Coin",
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

		paymentPayload, err := client.CreatePaymentPayload(ctx, paymentRequiredResponse.X402Version, selected)
		if err != nil {
			t.Fatalf("Failed to create payment payload: %v", err)
		}

		// Verify payload is V1
		if paymentPayload.X402Version != 1 {
			t.Errorf("Expected payload X402Version 1, got %d", paymentPayload.X402Version)
		}

		// Verify payload structure
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

		if evmPayload.Authorization.Value != "10000000" {
			t.Errorf("Expected value 10000000, got %s", evmPayload.Authorization.Value)
		}

		// V1 specific: Check validAfter has buffer (should be in the past)
		// This is just a check that it was created, actual time validation would be in facilitator
		if evmPayload.Authorization.ValidAfter == "" {
			t.Error("Expected validAfter to be set")
		}

		if evmPayload.Authorization.ValidBefore == "" {
			t.Error("Expected validBefore to be set")
		}

		// Server - maps payment payload to payment requirements
		accepted := service.FindMatchingRequirements(accepts, paymentPayload)
		if accepted == nil {
			t.Fatal("No matching payment requirements found")
		}

		// Server - verifies payment
		verifyResponse, err := service.VerifyPayment(ctx, paymentPayload, *accepted)
		if err != nil {
			t.Fatalf("Failed to verify payment: %v", err)
		}

		if !verifyResponse.IsValid {
			t.Fatalf("Payment verification failed: %s", verifyResponse.InvalidReason)
		}

		if verifyResponse.Payer != clientSigner.Address() {
			t.Errorf("Expected payer %s, got %s", clientSigner.Address(), verifyResponse.Payer)
		}

		// Server does work here...

		// Server - settles payment
		settleResponse, err := service.SettlePayment(ctx, paymentPayload, *accepted)
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

		if settleResponse.Network != "eip155:8453" {
			t.Errorf("Expected network eip155:8453, got %s", settleResponse.Network)
		}

		if settleResponse.Payer != clientSigner.Address() {
			t.Errorf("Expected payer %s, got %s", clientSigner.Address(), settleResponse.Payer)
		}
	})
}

// TestEVMVersionMismatch tests that V1 and V2 don't mix
func TestEVMVersionMismatch(t *testing.T) {
	t.Run("V1 Client with V2 Requirements Should Fail", func(t *testing.T) {
		ctx := context.Background()

		// Setup V1 client
		clientSigner := &mockClientEvmSigner{}
		client := x402.Newx402Client()
		evmClientV1 := evmv1.NewExactEvmClientV1(clientSigner)
		client.RegisterSchemeV1("eip155:8453", evmClientV1)

		// V2 requirements
		requirements := x402.PaymentRequirements{
			Scheme:  evm.SchemeExact,
			Network: "eip155:8453",
			Asset:   "erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
			Amount:  "1000000",
			PayTo:   "0x9876543210987654321098765432109876543210",
		}

		// Try to create V2 payload with V1 client - should fail
		_, err := client.CreatePaymentPayload(ctx, 2, requirements)
		if err == nil {
			t.Error("Expected error when using V1 client with version 2")
		}
		// The error could be either "no schemes registered" or "v1 only supports version 1"
		// depending on how the client handles version mismatches
	})

	t.Run("V2 Client with V1 Requirements Should Fail", func(t *testing.T) {
		ctx := context.Background()

		// Setup V2 client
		clientSigner := &mockClientEvmSigner{}
		client := x402.Newx402Client()
		evmClient := evm.NewExactEvmClient(clientSigner)
		client.RegisterScheme("eip155:8453", evmClient)

		// V1 requirements
		requirements := x402.PaymentRequirements{
			Scheme:  evm.SchemeExact,
			Network: "eip155:8453",
			Asset:   "erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
			Amount:  "1000000",
			PayTo:   "0x9876543210987654321098765432109876543210",
		}

		// Try to create V1 payload with V2 client - should fail
		_, err := client.CreatePaymentPayload(ctx, 1, requirements)
		if err == nil {
			t.Error("Expected error when using V2 client with version 1")
		}
		// The error could be either "no schemes registered" or "v2 only supports version 2"
		// depending on how the client handles version mismatches
	})
}

// TestEVMDualVersionSupport tests that a client can register both V1 and V2 and handle either version.
// This is important for backward compatibility - a client application can support both protocol versions
// simultaneously and respond appropriately based on the server's requirements.
func TestEVMDualVersionSupport(t *testing.T) {
	t.Run("Dual-Registered Client Handles V1 Requirements", func(t *testing.T) {
		ctx := context.Background()

		// Setup client with BOTH V1 and V2 implementations
		clientSigner := &mockClientEvmSigner{}
		client := x402.Newx402Client()

		// Register V1 implementation
		evmClientV1 := evmv1.NewExactEvmClientV1(clientSigner)
		client.RegisterSchemeV1("eip155:8453", evmClientV1)

		// Register V2 implementation
		evmClientV2 := evm.NewExactEvmClient(clientSigner)
		client.RegisterScheme("eip155:8453", evmClientV2)

		// V1 requirements
		requirements := x402.PaymentRequirements{
			Scheme:  evm.SchemeExact,
			Network: "eip155:8453",
			Asset:   "erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
			Amount:  "2000000", // 2 USDC
			PayTo:   "0x1111222233334444555566667777888899990000",
			Extra: map[string]interface{}{
				"name":    "USD Coin",
				"version": "2",
			},
		}

		// Create V1 payload - should succeed
		paymentPayload, err := client.CreatePaymentPayload(ctx, 1, requirements)
		if err != nil {
			t.Fatalf("Failed to create V1 payment payload with dual-registered client: %v", err)
		}

		// Verify it's a V1 payload
		if paymentPayload.X402Version != 1 {
			t.Errorf("Expected X402Version 1, got %d", paymentPayload.X402Version)
		}

		// Parse and verify the EVM payload
		evmPayload, err := evm.PayloadFromMap(paymentPayload.Payload)
		if err != nil {
			t.Fatalf("Failed to parse EVM payload: %v", err)
		}

		if evmPayload.Authorization.Value != "2000000" {
			t.Errorf("Expected value 2000000, got %s", evmPayload.Authorization.Value)
		}

		if evmPayload.Authorization.To != requirements.PayTo {
			t.Errorf("Expected to address %s, got %s", requirements.PayTo, evmPayload.Authorization.To)
		}

		// V1 specific: Check that validAfter/validBefore are set
		if evmPayload.Authorization.ValidAfter == "" {
			t.Error("Expected validAfter to be set for V1")
		}
		if evmPayload.Authorization.ValidBefore == "" {
			t.Error("Expected validBefore to be set for V1")
		}

		// V1 doesn't set Accepted field
		if paymentPayload.Accepted.Scheme != "" {
			t.Error("V1 payload should not have Accepted field populated")
		}
	})

	t.Run("Dual-Registered Client Handles V2 Requirements", func(t *testing.T) {
		ctx := context.Background()

		// Setup client with BOTH V1 and V2 implementations
		clientSigner := &mockClientEvmSigner{}
		client := x402.Newx402Client()

		// Register V1 implementation
		evmClientV1 := evmv1.NewExactEvmClientV1(clientSigner)
		client.RegisterSchemeV1("eip155:8453", evmClientV1)

		// Register V2 implementation
		evmClientV2 := evm.NewExactEvmClient(clientSigner)
		client.RegisterScheme("eip155:8453", evmClientV2)

		// V2 requirements
		requirements := x402.PaymentRequirements{
			Scheme:  evm.SchemeExact,
			Network: "eip155:8453",
			Asset:   "erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
			Amount:  "3000000", // 3 USDC
			PayTo:   "0xaaaabbbbccccddddeeeeffff000011112222333",
			Extra: map[string]interface{}{
				"name":    "USD Coin",
				"version": "2",
			},
		}

		// Create V2 payload - should succeed
		paymentPayload, err := client.CreatePaymentPayload(ctx, 2, requirements)
		if err != nil {
			t.Fatalf("Failed to create V2 payment payload with dual-registered client: %v", err)
		}

		// Verify it's a V2 payload
		if paymentPayload.X402Version != 2 {
			t.Errorf("Expected X402Version 2, got %d", paymentPayload.X402Version)
		}

		// Parse and verify the EVM payload
		evmPayload, err := evm.PayloadFromMap(paymentPayload.Payload)
		if err != nil {
			t.Fatalf("Failed to parse EVM payload: %v", err)
		}

		if evmPayload.Authorization.Value != "3000000" {
			t.Errorf("Expected value 3000000, got %s", evmPayload.Authorization.Value)
		}

		if evmPayload.Authorization.To != requirements.PayTo {
			t.Errorf("Expected to address %s, got %s", requirements.PayTo, evmPayload.Authorization.To)
		}

		// V2 specific: Check that Accepted field is set
		if paymentPayload.Accepted.Scheme != requirements.Scheme {
			t.Errorf("Expected Accepted.Scheme %s, got %s", requirements.Scheme, paymentPayload.Accepted.Scheme)
		}
		if paymentPayload.Accepted.Network != requirements.Network {
			t.Errorf("Expected Accepted.Network %s, got %s", requirements.Network, paymentPayload.Accepted.Network)
		}
		if paymentPayload.Accepted.Amount != requirements.Amount {
			t.Errorf("Expected Accepted.Amount %s, got %s", requirements.Amount, paymentPayload.Accepted.Amount)
		}
		if paymentPayload.Accepted.PayTo != requirements.PayTo {
			t.Errorf("Expected Accepted.PayTo %s, got %s", requirements.PayTo, paymentPayload.Accepted.PayTo)
		}
	})
}

package unit_test

import (
	"context"
	"encoding/json"
	"math/big"
	"testing"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/mechanisms/evm"
	evmv1 "github.com/coinbase/x402/go/mechanisms/evm/v1"
	"github.com/coinbase/x402/go/types"
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

// TestEVMVersionMismatch tests that V1 and V2 don't mix
func TestEVMVersionMismatch(t *testing.T) {
	t.Run("V1 Client with V2 Requirements Should Fail", func(t *testing.T) {
		ctx := context.Background()

		// Setup V1 client
		clientSigner := &mockClientEvmSigner{}
		client := x402.Newx402Client()
		evmClientV1 := evmv1.NewExactEvmClientV1(clientSigner)
		client.RegisterSchemeV1("eip155:8453", evmClientV1)

		// V1 client should succeed when explicitly requesting v1
		// Note: V1 needs MaxAmountRequired, so create v1-compatible requirements
		v1Requirements := x402.PaymentRequirements{
			Scheme:            evm.SchemeExact,
			Network:           "eip155:8453",
			Asset:             "erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
			MaxAmountRequired: "1000000",
			PayTo:             "0x9876543210987654321098765432109876543210",
		}
		requirementsBytes, _ := json.Marshal(v1Requirements)
		payloadBytes, err := client.CreatePaymentPayload(ctx, 1, requirementsBytes, nil, nil)
		if err != nil {
			t.Fatalf("Failed to create payment: %v", err)
		}
		// Verify it created a V1 payload
		var payload types.PaymentPayloadV1
		json.Unmarshal(payloadBytes, &payload)
		if payload.X402Version != 1 {
			t.Errorf("Expected V1 payload from V1 client, got v%d", payload.X402Version)
		}

		// V1 client should fail when explicitly requesting v2
		_, err = client.CreatePaymentPayload(ctx, 2, requirementsBytes, nil, nil)
		if err == nil {
			t.Error("Expected error when V1 client is asked to create v2 payload")
		}
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

		// V2 client should succeed when explicitly requesting v2
		requirementsBytes, _ := json.Marshal(requirements)
		payloadBytes, err := client.CreatePaymentPayload(ctx, 2, requirementsBytes, nil, nil)
		if err != nil {
			t.Fatalf("Failed to create payment: %v", err)
		}
		// Verify it created a V2 payload - v2 returns wrapped payload with accepted
		var payload types.PaymentPayloadV2
		json.Unmarshal(payloadBytes, &payload)
		if payload.X402Version != 2 {
			t.Errorf("Expected V2 payload from V2 client, got v%d", payload.X402Version)
		}

		// V2 client should fail when explicitly requesting v1
		_, err = client.CreatePaymentPayload(ctx, 1, requirementsBytes, nil, nil)
		if err == nil {
			t.Error("Expected error when V2 client is asked to create v1 payload")
		}
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
		evmClient := evm.NewExactEvmClient(clientSigner)
		client.RegisterScheme("eip155:8453", evmClient)

		// V1 requirements (uses MaxAmountRequired)
		v1Requirements := x402.PaymentRequirements{
			Scheme:            evm.SchemeExact,
			Network:           "eip155:8453",
			Asset:             "erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
			MaxAmountRequired: "1000000",
			PayTo:             "0x9876543210987654321098765432109876543210",
			Extra: map[string]interface{}{
				"name":    "USD Coin",
				"version": "2",
			},
		}

		// Client should handle V1 request
		v1ReqBytes, _ := json.Marshal(v1Requirements)
		payloadV1Bytes, err := client.CreatePaymentPayload(ctx, 1, v1ReqBytes, nil, nil)
		if err != nil {
			t.Fatalf("Failed to create V1 payment: %v", err)
		}

		var payloadV1 types.PaymentPayloadV1
		json.Unmarshal(payloadV1Bytes, &payloadV1)
		if payloadV1.X402Version != 1 {
			t.Errorf("Expected V1 payload, got v%d", payloadV1.X402Version)
		}

		// Verify V1 structure (scheme at top level, not in Accepted)
		if payloadV1.Scheme == "" {
			t.Error("Expected V1 payload to have top-level Scheme")
		}

		// V2 requirements (uses Amount)
		v2Requirements := x402.PaymentRequirements{
			Scheme:  evm.SchemeExact,
			Network: "eip155:8453",
			Asset:   "erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
			Amount:  "1000000",
			PayTo:   "0x9876543210987654321098765432109876543210",
			Extra: map[string]interface{}{
				"name":    "USD Coin",
				"version": "2",
			},
		}

		// Client should handle V2 request
		v2ReqBytes, _ := json.Marshal(v2Requirements)
		payloadV2Bytes, err := client.CreatePaymentPayload(ctx, 2, v2ReqBytes, nil, nil)
		if err != nil {
			t.Fatalf("Failed to create V2 payment: %v", err)
		}

		var payloadV2 types.PaymentPayloadV2
		json.Unmarshal(payloadV2Bytes, &payloadV2)
		if payloadV2.X402Version != 2 {
			t.Errorf("Expected V2 payload, got v%d", payloadV2.X402Version)
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
		evmClient := evm.NewExactEvmClient(clientSigner)
		client.RegisterScheme("eip155:8453", evmClient)

		// V2 requirements
		requirements := x402.PaymentRequirements{
			Scheme:  evm.SchemeExact,
			Network: "eip155:8453",
			Asset:   "erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
			Amount:  "1000000",
			PayTo:   "0x9876543210987654321098765432109876543210",
		}

		// Client should handle V2 request using V2 implementation
		requirementsBytes, _ := json.Marshal(requirements)
		payloadV2Bytes, err := client.CreatePaymentPayload(ctx, 2, requirementsBytes, nil, nil)
		if err != nil {
			t.Fatalf("Failed to create V2 payment: %v", err)
		}

		var payloadV2 types.PaymentPayloadV2
		json.Unmarshal(payloadV2Bytes, &payloadV2)
		if payloadV2.X402Version != 2 {
			t.Errorf("Expected V2 payload, got v%d", payloadV2.X402Version)
		}

		// Verify V2 structure (has scheme/network in Accepted)
		if payloadV2.Accepted.Scheme == "" {
			t.Error("Expected V2 payload to have Accepted.Scheme")
		}
	})
}

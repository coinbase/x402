package v1

import (
	"context"
	"math/big"
	"testing"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/mechanisms/evm"
)

// Mock signer for testing
type mockClientSigner struct{}

func (m *mockClientSigner) Address() string {
	return "0x1234567890123456789012345678901234567890"
}

func (m *mockClientSigner) SignTypedData(
	domain evm.TypedDataDomain,
	types map[string][]evm.TypedDataField,
	primaryType string,
	message map[string]interface{},
) ([]byte, error) {
	// Return a mock signature
	return make([]byte, 65), nil
}

// Mock facilitator signer for testing
type mockFacilitatorSigner struct{}

func (m *mockFacilitatorSigner) Address() string {
	return "0xfacilitator"
}

func (m *mockFacilitatorSigner) GetBalance(address string, tokenAddress string) (*big.Int, error) {
	// Return sufficient balance
	return big.NewInt(1000000000), nil
}

func (m *mockFacilitatorSigner) ReadContract(
	contractAddress string,
	abi []byte,
	functionName string,
	args ...interface{},
) (interface{}, error) {
	// Mock nonce check - return false (not used)
	return false, nil
}

func (m *mockFacilitatorSigner) WriteContract(
	contractAddress string,
	abi []byte,
	functionName string,
	args ...interface{},
) (string, error) {
	return "0xtxhash", nil
}

func (m *mockFacilitatorSigner) WaitForTransactionReceipt(txHash string) (*evm.TransactionReceipt, error) {
	return &evm.TransactionReceipt{
		Status: evm.TxStatusSuccess,
	}, nil
}

func (m *mockFacilitatorSigner) VerifyTypedData(
	address string,
	domain evm.TypedDataDomain,
	types map[string][]evm.TypedDataField,
	primaryType string,
	message map[string]interface{},
	signature []byte,
) (bool, error) {
	return true, nil
}

func (m *mockFacilitatorSigner) GetChainID() (*big.Int, error) {
	return big.NewInt(8453), nil // Base mainnet
}

func TestV1ClientCreatePaymentPayload(t *testing.T) {
	client := NewExactEvmClientV1(&mockClientSigner{})

	requirements := x402.PaymentRequirements{
		Scheme:  "exact",
		Network: "base",
		Asset:   "USDC",
		Amount:  "1000000",
		PayTo:   "0x9876543210987654321098765432109876543210",
		Extra: map[string]interface{}{
			"name":    "USD Coin",
			"version": "2",
		},
	}

	payload, err := client.CreatePaymentPayload(context.Background(), 1, requirements)
	if err != nil {
		t.Fatalf("Failed to create payment payload: %v", err)
	}

	// V1 specific: should only accept version 1
	if payload.X402Version != 1 {
		t.Errorf("Expected X402Version 1, got %d", payload.X402Version)
	}

	// Try with version 2 - should fail
	_, err = client.CreatePaymentPayload(context.Background(), 2, requirements)
	if err == nil {
		t.Error("Expected error when using version 2 with V1 client")
	}
	if err.Error() != "v1 only supports x402 version 1, got 2" {
		t.Errorf("Unexpected error message: %v", err)
	}
}

func TestV1FacilitatorVerify(t *testing.T) {
	facilitator := NewExactEvmFacilitatorV1(&mockFacilitatorSigner{})

	requirements := x402.PaymentRequirements{
		Scheme:  "exact",
		Network: "base",
		Asset:   "USDC",
		Amount:  "1000000",
		PayTo:   "0x9876543210987654321098765432109876543210",
		Extra: map[string]interface{}{
			"name":    "USD Coin",
			"version": "2",
		},
	}

	// Create a v1 payload
	payload := x402.PaymentPayload{
		X402Version: 1,
		Scheme:      "exact",
		Network:     "base",
		Payload: map[string]interface{}{
			"signature": "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000", // 65 bytes hex encoded
			"authorization": map[string]interface{}{
				"from":        "0x1234567890123456789012345678901234567890",
				"to":          requirements.PayTo,
				"value":       requirements.Amount,
				"validAfter":  "0",
				"validBefore": "9999999999",
				"nonce":       "0x0000000000000000000000000000000000000000000000000000000000000000", // 32 bytes hex encoded
			},
		},
	}

	resp, err := facilitator.Verify(context.Background(), payload, requirements)
	if err != nil {
		t.Fatalf("Failed to verify payment: %v", err)
	}

	if !resp.IsValid {
		t.Errorf("Expected valid payment, got invalid: %s", resp.InvalidReason)
	}

	// Test with v2 payload - should fail
	payload.X402Version = 2
	resp, err = facilitator.Verify(context.Background(), payload, requirements)
	if err != nil {
		t.Fatalf("Failed to verify payment: %v", err)
	}

	if resp.IsValid {
		t.Error("Expected invalid payment for v2 with V1 facilitator")
	}
	if resp.InvalidReason != "v1 only supports x402 version 1" {
		t.Errorf("Unexpected invalid reason: %s", resp.InvalidReason)
	}
}

func TestV1ServiceParsePrice(t *testing.T) {
	service := NewExactEvmServiceV1()

	tests := []struct {
		name     string
		price    x402.Price
		network  x402.Network
		expected string
	}{
		{
			name:     "string amount",
			price:    "5.00",
			network:  "base",
			expected: "5000000",
		},
		{
			name:     "float amount",
			price:    5.0,
			network:  "base",
			expected: "5000000",
		},
		{
			name:     "int amount",
			price:    5,
			network:  "base",
			expected: "5000000",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assetAmount, err := service.ParsePrice(tt.price, tt.network)
			if err != nil {
				t.Fatalf("Failed to parse price: %v", err)
			}

			if assetAmount.Amount != tt.expected {
				t.Errorf("Expected amount %s, got %s", tt.expected, assetAmount.Amount)
			}
		})
	}
}

func TestV1ServiceEnhancePaymentRequirements(t *testing.T) {
	service := NewExactEvmServiceV1()

	requirements := x402.PaymentRequirements{
		Scheme:  "exact",
		Network: "base",
		Asset:   "USDC",
		Amount:  "1000000",
		PayTo:   "0x9876543210987654321098765432109876543210",
	}

	supportedKind := x402.SupportedKind{
		X402Version: 1,
		Scheme:      "exact",
		Network:     "base",
	}

	enhanced, err := service.EnhancePaymentRequirements(
		context.Background(),
		requirements,
		supportedKind,
		[]string{},
	)
	if err != nil {
		t.Fatalf("Failed to enhance requirements: %v", err)
	}

	// Check V1 specific enhancements
	if enhanced.Extra == nil {
		t.Fatal("Expected extra map to be populated")
	}

	// Check EIP-712 domain parameters
	if enhanced.Extra["name"] == nil {
		t.Error("Expected name in extra")
	}
	if enhanced.Extra["version"] == nil {
		t.Error("Expected version in extra")
	}

	// Test with v2 supportedKind - should fail
	supportedKind.X402Version = 2
	_, err = service.EnhancePaymentRequirements(
		context.Background(),
		requirements,
		supportedKind,
		[]string{},
	)
	if err == nil {
		t.Error("Expected error when using version 2 with V1 service")
	}
	if err.Error() != "v1 only supports x402 version 1" {
		t.Errorf("Unexpected error message: %v", err)
	}
}

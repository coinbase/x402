package evm

import (
	"context"
	"math/big"
	"strings"
	"testing"

	x402 "github.com/coinbase/x402/go"
)

// Mock implementations for testing

type mockClientSigner struct {
	address string
	signErr error
}

func (m *mockClientSigner) Address() string {
	return m.address
}

func (m *mockClientSigner) SignTypedData(
	domain TypedDataDomain,
	types map[string][]TypedDataField,
	primaryType string,
	message map[string]interface{},
) ([]byte, error) {
	if m.signErr != nil {
		return nil, m.signErr
	}
	// Return a mock signature (65 bytes)
	return make([]byte, 65), nil
}

type mockFacilitatorSigner struct {
	chainID      *big.Int
	balances     map[string]*big.Int
	noncesUsed   map[string]bool
	verifyResult bool
	txHash       string
	txSuccess    bool
}

func (m *mockFacilitatorSigner) ReadContract(
	address string,
	abi []byte,
	functionName string,
	args ...interface{},
) (interface{}, error) {
	if functionName == FunctionAuthorizationState {
		// Check if nonce is used
		nonce := args[1].([32]byte)
		nonceHex := BytesToHex(nonce[:])
		return m.noncesUsed[nonceHex], nil
	}
	return nil, nil
}

func (m *mockFacilitatorSigner) VerifyTypedData(
	address string,
	domain TypedDataDomain,
	types map[string][]TypedDataField,
	primaryType string,
	message map[string]interface{},
	signature []byte,
) (bool, error) {
	return m.verifyResult, nil
}

func (m *mockFacilitatorSigner) WriteContract(
	address string,
	abi []byte,
	functionName string,
	args ...interface{},
) (string, error) {
	return m.txHash, nil
}

func (m *mockFacilitatorSigner) WaitForTransactionReceipt(txHash string) (*TransactionReceipt, error) {
	status := uint64(TxStatusFailed)
	if m.txSuccess {
		status = TxStatusSuccess
	}
	return &TransactionReceipt{
		Status:      status,
		BlockNumber: 12345,
		TxHash:      txHash,
	}, nil
}

func (m *mockFacilitatorSigner) GetBalance(address string, tokenAddress string) (*big.Int, error) {
	key := address + ":" + tokenAddress
	if balance, ok := m.balances[key]; ok {
		return balance, nil
	}
	return big.NewInt(0), nil
}

func (m *mockFacilitatorSigner) GetChainID() (*big.Int, error) {
	if m.chainID != nil {
		return m.chainID, nil
	}
	return ChainIDBase, nil
}

// Tests

func TestGetEvmChainId(t *testing.T) {
	tests := []struct {
		name    string
		network string
		want    *big.Int
		wantErr bool
	}{
		{
			name:    "base network",
			network: "base",
			want:    ChainIDBase,
		},
		{
			name:    "base-mainnet network",
			network: "base-mainnet",
			want:    ChainIDBase,
		},
		{
			name:    "eip155:8453 network",
			network: "eip155:8453",
			want:    ChainIDBase,
		},
		{
			name:    "base-sepolia network",
			network: "base-sepolia",
			want:    ChainIDBaseSepolia,
		},
		{
			name:    "unsupported network",
			network: "unsupported",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := GetEvmChainId(tt.network)
			if (err != nil) != tt.wantErr {
				t.Errorf("GetEvmChainId() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && got.Cmp(tt.want) != 0 {
				t.Errorf("GetEvmChainId() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestParseAmount(t *testing.T) {
	tests := []struct {
		name     string
		amount   string
		decimals int
		want     *big.Int
		wantErr  bool
	}{
		{
			name:     "whole number",
			amount:   "100",
			decimals: 6,
			want:     big.NewInt(100000000), // 100 * 10^6
		},
		{
			name:     "decimal amount",
			amount:   "1.5",
			decimals: 6,
			want:     big.NewInt(1500000), // 1.5 * 10^6
		},
		{
			name:     "small decimal",
			amount:   "0.000001",
			decimals: 6,
			want:     big.NewInt(1),
		},
		{
			name:     "truncate extra decimals",
			amount:   "1.1234567",
			decimals: 6,
			want:     big.NewInt(1123456),
		},
		{
			name:     "invalid format",
			amount:   "1.2.3",
			decimals: 6,
			wantErr:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseAmount(tt.amount, tt.decimals)
			if (err != nil) != tt.wantErr {
				t.Errorf("ParseAmount() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && got.Cmp(tt.want) != 0 {
				t.Errorf("ParseAmount() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestFormatAmount(t *testing.T) {
	tests := []struct {
		name     string
		amount   *big.Int
		decimals int
		want     string
	}{
		{
			name:     "whole number",
			amount:   big.NewInt(1000000),
			decimals: 6,
			want:     "1",
		},
		{
			name:     "with decimals",
			amount:   big.NewInt(1500000),
			decimals: 6,
			want:     "1.5",
		},
		{
			name:     "small amount",
			amount:   big.NewInt(1),
			decimals: 6,
			want:     "0.000001",
		},
		{
			name:     "zero",
			amount:   big.NewInt(0),
			decimals: 6,
			want:     "0",
		},
		{
			name:     "nil amount",
			amount:   nil,
			decimals: 6,
			want:     "0",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := FormatAmount(tt.amount, tt.decimals)
			if got != tt.want {
				t.Errorf("FormatAmount() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestExactEvmClient_CreatePaymentPayload(t *testing.T) {
	ctx := context.Background()
	signer := &mockClientSigner{
		address: "0x1234567890123456789012345678901234567890",
	}
	client := NewExactEvmClient(signer)

	requirements := x402.PaymentRequirements{
		Scheme:  SchemeExact,
		Network: "base",
		Asset:   "USDC",
		PayTo:   "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
		Amount:  "1500000", // 1.5 USDC in smallest unit
		Extra: map[string]interface{}{
			"name":    "USD Coin",
			"version": "2",
		},
	}

	payload, err := client.CreatePaymentPayload(ctx, 2, requirements)
	if err != nil {
		t.Fatalf("CreatePaymentPayload() error = %v", err)
	}

	// Check basic fields
	if payload.X402Version != 2 {
		t.Errorf("Expected version 2, got %d", payload.X402Version)
	}

	// Check payload structure
	evmPayload, err := PayloadFromMap(payload.Payload)
	if err != nil {
		t.Fatalf("Failed to parse payload: %v", err)
	}

	if evmPayload.Authorization.From != signer.address {
		t.Errorf("Expected from %s, got %s", signer.address, evmPayload.Authorization.From)
	}
	if !strings.EqualFold(evmPayload.Authorization.To, requirements.PayTo) {
		t.Errorf("Expected to %s, got %s", requirements.PayTo, evmPayload.Authorization.To)
	}
	if evmPayload.Authorization.Value != "1500000" { // 1.5 * 10^6
		t.Errorf("Expected value 1500000, got %s", evmPayload.Authorization.Value)
	}
	if evmPayload.Signature == "" {
		t.Error("Expected signature to be present")
	}
}

func TestExactEvmFacilitator_Verify(t *testing.T) {
	ctx := context.Background()

	signer := &mockFacilitatorSigner{
		chainID:      ChainIDBase,
		verifyResult: true,
		balances: map[string]*big.Int{
			"0x1234567890123456789012345678901234567890:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913": big.NewInt(2000000),
		},
		noncesUsed: make(map[string]bool),
	}
	facilitator := NewExactEvmFacilitator(signer)

	// Create a valid payload
	evmPayload := &ExactEIP3009Payload{
		Signature: BytesToHex(make([]byte, 65)),
		Authorization: ExactEIP3009Authorization{
			From:        "0x1234567890123456789012345678901234567890",
			To:          "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
			Value:       "1500000",
			ValidAfter:  "1000000",
			ValidBefore: "2000000",
			Nonce:       BytesToHex(make([]byte, 32)),
		},
	}

	requirements := x402.PaymentRequirements{
		Scheme:  SchemeExact,
		Network: "base",
		Asset:   "USDC",
		PayTo:   "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
		Amount:  "1500000", // 1.5 USDC in smallest unit
		Extra: map[string]interface{}{
			"name":    "USD Coin",
			"version": "2",
		},
	}

	payload := x402.PaymentPayload{
		X402Version: 2,
		Accepted:    requirements,
		Payload:     evmPayload.ToMap(),
	}

	result, err := facilitator.Verify(ctx, payload, requirements)
	if err != nil {
		t.Fatalf("Verify() error = %v", err)
	}

	if !result.IsValid {
		t.Errorf("Expected valid result, got invalid: %s", result.InvalidReason)
	}
	if result.Payer != evmPayload.Authorization.From {
		t.Errorf("Expected payer %s, got %s", evmPayload.Authorization.From, result.Payer)
	}
}

func TestExactEvmFacilitator_Settle(t *testing.T) {
	ctx := context.Background()

	signer := &mockFacilitatorSigner{
		chainID:      ChainIDBase,
		verifyResult: true,
		txHash:       "0x1234567890123456789012345678901234567890123456789012345678901234",
		txSuccess:    true,
		balances: map[string]*big.Int{
			"0x1234567890123456789012345678901234567890:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913": big.NewInt(2000000),
		},
		noncesUsed: make(map[string]bool),
	}
	facilitator := NewExactEvmFacilitator(signer)

	// Create a valid payload
	evmPayload := &ExactEIP3009Payload{
		Signature: BytesToHex(make([]byte, 65)),
		Authorization: ExactEIP3009Authorization{
			From:        "0x1234567890123456789012345678901234567890",
			To:          "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
			Value:       "1500000",
			ValidAfter:  "1000000",
			ValidBefore: "2000000",
			Nonce:       BytesToHex(make([]byte, 32)),
		},
	}

	requirements := x402.PaymentRequirements{
		Scheme:  SchemeExact,
		Network: "base",
		Asset:   "USDC",
		PayTo:   "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
		Amount:  "1500000", // 1.5 USDC in smallest unit
		Extra: map[string]interface{}{
			"name":    "USD Coin",
			"version": "2",
		},
	}

	payload := x402.PaymentPayload{
		X402Version: 2,
		Accepted:    requirements,
		Payload:     evmPayload.ToMap(),
	}

	result, err := facilitator.Settle(ctx, payload, requirements)
	if err != nil {
		t.Fatalf("Settle() error = %v", err)
	}

	if !result.Success {
		t.Errorf("Expected successful settlement, got failure: %s", result.ErrorReason)
	}
	if result.Transaction != signer.txHash {
		t.Errorf("Expected tx hash %s, got %s", signer.txHash, result.Transaction)
	}
	if result.Payer != evmPayload.Authorization.From {
		t.Errorf("Expected payer %s, got %s", evmPayload.Authorization.From, result.Payer)
	}
}

func TestExactEvmService_ParsePrice(t *testing.T) {
	service := NewExactEvmService()

	tests := []struct {
		name    string
		price   string
		network string
		want    string // expected amount
		wantErr bool
	}{
		{
			name:    "dollar format",
			price:   "$1.50",
			network: "base",
			want:    "1500000",
		},
		{
			name:    "decimal format",
			price:   "1.50",
			network: "base",
			want:    "1500000",
		},
		{
			name:    "already in smallest unit",
			price:   "1500000",
			network: "base",
			want:    "1500000",
		},
		{
			name:    "with USD suffix",
			price:   "1.50 USD",
			network: "base",
			want:    "1500000",
		},
		{
			name:    "with USDC suffix",
			price:   "1.50 USDC",
			network: "base",
			want:    "1500000",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := service.ParsePrice(tt.price, x402.Network(tt.network))
			if (err != nil) != tt.wantErr {
				t.Errorf("ParsePrice() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && got.Amount != tt.want {
				t.Errorf("ParsePrice() amount = %v, want %v", got.Amount, tt.want)
			}
		})
	}
}

func TestExactEvmService_EnhancePaymentRequirements(t *testing.T) {
	ctx := context.Background()
	service := NewExactEvmService()

	requirements := x402.PaymentRequirements{
		Network: "base",
		PayTo:   "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
		Amount:  "1500000", // 1.5 USDC in smallest unit // Decimal format
	}

	supportedKind := x402.SupportedKind{
		X402Version: 2,
		Scheme:      SchemeExact,
		Network:     "base",
		Extra: map[string]interface{}{
			"customField": "customValue",
		},
	}

	enhanced, err := service.EnhancePaymentRequirements(ctx, requirements, supportedKind, []string{"customField"})
	if err != nil {
		t.Fatalf("EnhancePaymentRequirements() error = %v", err)
	}

	// Check amount was converted to smallest unit
	if enhanced.Amount != "1500000" {
		t.Errorf("Expected amount 1500000, got %s", enhanced.Amount)
	}

	// Check asset was set to default
	expectedAsset := "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" // USDC on Base
	if !strings.EqualFold(enhanced.Asset, expectedAsset) {
		t.Errorf("Expected asset %s, got %s", expectedAsset, enhanced.Asset)
	}

	// Check extra fields were added (name is "USD Coin" for Base network in constants.go)
	if enhanced.Extra["name"] != "USD Coin" {
		t.Errorf("Expected name 'USD Coin', got %v", enhanced.Extra["name"])
	}
	if enhanced.Extra["version"] != "2" {
		t.Errorf("Expected version '2', got %v", enhanced.Extra["version"])
	}
	if enhanced.Extra["customField"] != "customValue" {
		t.Errorf("Expected customField 'customValue', got %v", enhanced.Extra["customField"])
	}
}

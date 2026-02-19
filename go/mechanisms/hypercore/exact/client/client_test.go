package client

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/coinbase/x402/go/mechanisms/hypercore"
	"github.com/coinbase/x402/go/types"
)

// Mock signer for testing
type mockSigner struct {
	signCalled      bool
	lastActionSeen  hypercore.HypercoreSendAssetAction
	returnSignature hypercore.HypercoreSignature
	returnError     error
}

func (m *mockSigner) SignSendAsset(action hypercore.HypercoreSendAssetAction) (hypercore.HypercoreSignature, error) {
	m.signCalled = true
	m.lastActionSeen = action
	if m.returnError != nil {
		return hypercore.HypercoreSignature{}, m.returnError
	}
	return m.returnSignature, nil
}

func (m *mockSigner) GetAddress() string {
	return "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
}

func TestNewExactHypercoreScheme(t *testing.T) {
	signer := &mockSigner{
		returnSignature: hypercore.HypercoreSignature{
			R: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
			S: "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
			V: 27,
		},
	}

	client := NewExactHypercoreScheme(signer)

	if client == nil {
		t.Fatal("Expected client to be created, got nil")
	}

	if client.Scheme() != hypercore.SchemeExact {
		t.Errorf("Expected scheme='%s', got '%s'", hypercore.SchemeExact, client.Scheme())
	}

	if client.signer != signer {
		t.Error("Expected signer to be stored in client")
	}
}

func TestCreatePaymentPayload_Structure(t *testing.T) {
	signer := &mockSigner{
		returnSignature: hypercore.HypercoreSignature{
			R: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
			S: "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
			V: 27,
		},
	}

	client := NewExactHypercoreScheme(signer)
	ctx := context.Background()

	requirements := types.PaymentRequirements{
		Scheme:            hypercore.SchemeExact,
		Network:           hypercore.NetworkMainnet,
		PayTo:             "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
		Amount:            "10000",
		Asset:             "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
		MaxTimeoutSeconds: 3600,
	}

	result, err := client.CreatePaymentPayload(ctx, requirements)
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	if result.X402Version != 2 {
		t.Errorf("Expected x402Version=2, got %d", result.X402Version)
	}

	if result.Payload == nil {
		t.Fatal("Expected payload to be set")
	}

	payload := result.Payload

	if _, ok := payload["action"]; !ok {
		t.Error("Expected payload to have 'action' field")
	}

	if _, ok := payload["signature"]; !ok {
		t.Error("Expected payload to have 'signature' field")
	}

	if _, ok := payload["nonce"]; !ok {
		t.Error("Expected payload to have 'nonce' field")
	}
}

func TestCreatePaymentPayload_AmountFormatting(t *testing.T) {
	signer := &mockSigner{
		returnSignature: hypercore.HypercoreSignature{
			R: "0x00", S: "0x00", V: 27,
		},
	}

	client := NewExactHypercoreScheme(signer)
	ctx := context.Background()

	requirements := types.PaymentRequirements{
		Scheme:  hypercore.SchemeExact,
		Network: hypercore.NetworkMainnet,
		PayTo:   "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
		Amount:  "1000000", // 0.01000000 with 8 decimals
		Asset:   "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
	}

	result, err := client.CreatePaymentPayload(ctx, requirements)
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	payload := result.Payload
	action := payload["action"].(hypercore.HypercoreSendAssetAction)

	if action.Amount != "0.01000000" {
		t.Errorf("Expected amount='0.01000000', got '%s'", action.Amount)
	}
}

func TestCreatePaymentPayload_MainnetChain(t *testing.T) {
	signer := &mockSigner{
		returnSignature: hypercore.HypercoreSignature{
			R: "0x00", S: "0x00", V: 27,
		},
	}

	client := NewExactHypercoreScheme(signer)
	ctx := context.Background()

	requirements := types.PaymentRequirements{
		Scheme:  hypercore.SchemeExact,
		Network: hypercore.NetworkMainnet,
		PayTo:   "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
		Amount:  "10000",
		Asset:   "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
	}

	result, err := client.CreatePaymentPayload(ctx, requirements)
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	payload := result.Payload
	action := payload["action"].(hypercore.HypercoreSendAssetAction)

	if action.HyperliquidChain != "Mainnet" {
		t.Errorf("Expected hyperliquidChain='Mainnet', got '%s'", action.HyperliquidChain)
	}
}

func TestCreatePaymentPayload_TestnetChain(t *testing.T) {
	signer := &mockSigner{
		returnSignature: hypercore.HypercoreSignature{
			R: "0x00", S: "0x00", V: 27,
		},
	}

	client := NewExactHypercoreScheme(signer)
	ctx := context.Background()

	requirements := types.PaymentRequirements{
		Scheme:  hypercore.SchemeExact,
		Network: hypercore.NetworkTestnet,
		PayTo:   "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
		Amount:  "10000",
		Asset:   "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
		Extra: map[string]interface{}{
			"isMainnet": false,
		},
	}

	result, err := client.CreatePaymentPayload(ctx, requirements)
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	payload := result.Payload
	action := payload["action"].(hypercore.HypercoreSendAssetAction)

	if action.HyperliquidChain != "Testnet" {
		t.Errorf("Expected hyperliquidChain='Testnet', got '%s'", action.HyperliquidChain)
	}
}

func TestCreatePaymentPayload_AddressNormalization(t *testing.T) {
	signer := &mockSigner{
		returnSignature: hypercore.HypercoreSignature{
			R: "0x00", S: "0x00", V: 27,
		},
	}

	client := NewExactHypercoreScheme(signer)
	ctx := context.Background()

	requirements := types.PaymentRequirements{
		Scheme:  hypercore.SchemeExact,
		Network: hypercore.NetworkMainnet,
		PayTo:   "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01", // Mixed case
		Amount:  "10000",
		Asset:   "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
	}

	result, err := client.CreatePaymentPayload(ctx, requirements)
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	payload := result.Payload
	action := payload["action"].(hypercore.HypercoreSendAssetAction)

	expected := "0xabcdef0123456789abcdef0123456789abcdef01"
	if action.Destination != expected {
		t.Errorf("Expected destination='%s', got '%s'", expected, action.Destination)
	}
}

func TestCreatePaymentPayload_NonceIsTimestampBased(t *testing.T) {
	signer := &mockSigner{
		returnSignature: hypercore.HypercoreSignature{
			R: "0x00", S: "0x00", V: 27,
		},
	}

	client := NewExactHypercoreScheme(signer)
	ctx := context.Background()

	requirements := types.PaymentRequirements{
		Scheme:  hypercore.SchemeExact,
		Network: hypercore.NetworkMainnet,
		PayTo:   "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
		Amount:  "10000",
		Asset:   "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
	}

	before := time.Now().UnixMilli()
	result, err := client.CreatePaymentPayload(ctx, requirements)
	after := time.Now().UnixMilli()

	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	payload := result.Payload
	nonce := payload["nonce"].(int64)

	if nonce < before || nonce > after {
		t.Errorf("Expected nonce to be between %d and %d, got %d", before, after, nonce)
	}
}

func TestCreatePaymentPayload_SignerIsCalled(t *testing.T) {
	signer := &mockSigner{
		returnSignature: hypercore.HypercoreSignature{
			R: "0x00", S: "0x00", V: 27,
		},
	}

	client := NewExactHypercoreScheme(signer)
	ctx := context.Background()

	requirements := types.PaymentRequirements{
		Scheme:  hypercore.SchemeExact,
		Network: hypercore.NetworkMainnet,
		PayTo:   "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
		Amount:  "10000",
		Asset:   "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
	}

	_, err := client.CreatePaymentPayload(ctx, requirements)
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	if !signer.signCalled {
		t.Error("Expected signer.SignSendAsset to be called")
	}

	action := signer.lastActionSeen
	if action.Type != "sendAsset" {
		t.Errorf("Expected action.Type='sendAsset', got '%s'", action.Type)
	}

	if action.Destination != strings.ToLower(requirements.PayTo) {
		t.Errorf("Expected action.Destination='%s', got '%s'", strings.ToLower(requirements.PayTo), action.Destination)
	}

	if action.Token != requirements.Asset {
		t.Errorf("Expected action.Token='%s', got '%s'", requirements.Asset, action.Token)
	}
}

func TestCreatePaymentPayload_AllActionFields(t *testing.T) {
	signer := &mockSigner{
		returnSignature: hypercore.HypercoreSignature{
			R: "0x00", S: "0x00", V: 27,
		},
	}

	client := NewExactHypercoreScheme(signer)
	ctx := context.Background()

	requirements := types.PaymentRequirements{
		Scheme:  hypercore.SchemeExact,
		Network: hypercore.NetworkMainnet,
		PayTo:   "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
		Amount:  "100000",
		Asset:   "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
	}

	result, err := client.CreatePaymentPayload(ctx, requirements)
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	payload := result.Payload
	action := payload["action"].(hypercore.HypercoreSendAssetAction)

	if action.Type != "sendAsset" {
		t.Errorf("Expected action.Type='sendAsset', got '%s'", action.Type)
	}

	if action.SignatureChainID != "0x3e7" {
		t.Errorf("Expected action.SignatureChainID='0x3e7', got '%s'", action.SignatureChainID)
	}

	if action.SourceDex != "spot" {
		t.Errorf("Expected action.SourceDex='spot', got '%s'", action.SourceDex)
	}

	if action.DestinationDex != "spot" {
		t.Errorf("Expected action.DestinationDex='spot', got '%s'", action.DestinationDex)
	}

	if action.FromSubAccount != "" {
		t.Errorf("Expected action.FromSubAccount='', got '%s'", action.FromSubAccount)
	}

	if action.Nonce == 0 {
		t.Error("Expected action.Nonce to be set")
	}
}

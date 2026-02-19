package facilitator

import (
	"context"
	"testing"
	"time"

	"github.com/coinbase/x402/go/mechanisms/hypercore"
	"github.com/coinbase/x402/go/types"
)

func TestNewExactHypercoreScheme(t *testing.T) {
	facilitator := NewExactHypercoreScheme("https://api.hyperliquid.xyz")

	if facilitator == nil {
		t.Fatal("Expected facilitator to be created, got nil")
	}

	if facilitator.Scheme() != hypercore.SchemeExact {
		t.Errorf("Expected scheme='%s', got '%s'", hypercore.SchemeExact, facilitator.Scheme())
	}

	if facilitator.CaipFamily() != "hypercore:*" {
		t.Errorf("Expected caipFamily='hypercore:*', got '%s'", facilitator.CaipFamily())
	}

	if facilitator.apiURL != "https://api.hyperliquid.xyz" {
		t.Errorf("Expected apiURL='https://api.hyperliquid.xyz', got '%s'", facilitator.apiURL)
	}
}

func TestGetExtra(t *testing.T) {
	facilitator := NewExactHypercoreScheme("https://api.hyperliquid.xyz")

	result := facilitator.GetExtra("hypercore:mainnet")

	if result != nil {
		t.Errorf("Expected GetExtra to return nil, got %v", result)
	}
}

func TestGetSigners(t *testing.T) {
	facilitator := NewExactHypercoreScheme("https://api.hyperliquid.xyz")

	result := facilitator.GetSigners("hypercore:mainnet")

	if len(result) != 0 {
		t.Errorf("Expected GetSigners to return empty slice, got %v", result)
	}
}

func TestVerify_InvalidNetwork(t *testing.T) {
	facilitator := NewExactHypercoreScheme("https://api.hyperliquid.xyz")
	ctx := context.Background()

	payload := types.PaymentPayload{
		X402Version: 2,
		Payload: map[string]interface{}{
			"action": hypercore.HypercoreSendAssetAction{
				Type:             "sendAsset",
				HyperliquidChain: "Mainnet",
				SignatureChainID: "0x3e7",
				Destination:      "0x0987654321098765432109876543210987654321",
				SourceDex:        "spot",
				DestinationDex:   "spot",
				Token:            "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
				Amount:           "0.10000000",
				FromSubAccount:   "",
				Nonce:            time.Now().UnixMilli(),
			},
			"signature": hypercore.HypercoreSignature{
				R: "0x" + string(make([]byte, 64)),
				S: "0x" + string(make([]byte, 64)),
				V: 27,
			},
			"nonce": time.Now().UnixMilli(),
		},
	}

	requirements := types.PaymentRequirements{
		Scheme:            "exact",
		Network:           "eip155:1", // Invalid network for hypercore
		Asset:             "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
		Amount:            "100000",
		PayTo:             "0x0987654321098765432109876543210987654321",
		MaxTimeoutSeconds: 3600,
	}

	result, err := facilitator.Verify(ctx, payload, requirements)
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	if result.IsValid {
		t.Error("Expected IsValid=false for invalid network")
	}

	if result.InvalidReason != "invalid_network: eip155:1" {
		t.Errorf("Expected InvalidReason='invalid_network: eip155:1', got '%s'", result.InvalidReason)
	}
}

func TestVerify_InvalidActionType(t *testing.T) {
	facilitator := NewExactHypercoreScheme("https://api.hyperliquid.xyz")
	ctx := context.Background()

	payload := types.PaymentPayload{
		X402Version: 2,
		Payload: map[string]interface{}{
			"action": hypercore.HypercoreSendAssetAction{
				Type:             "wrongType", // Invalid action type
				HyperliquidChain: "Mainnet",
				SignatureChainID: "0x3e7",
				Destination:      "0x0987654321098765432109876543210987654321",
				SourceDex:        "spot",
				DestinationDex:   "spot",
				Token:            "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
				Amount:           "0.10000000",
				FromSubAccount:   "",
				Nonce:            time.Now().UnixMilli(),
			},
			"signature": hypercore.HypercoreSignature{R: "0x00", S: "0x00", V: 27},
			"nonce":     time.Now().UnixMilli(),
		},
	}

	requirements := types.PaymentRequirements{
		Scheme:  "exact",
		Network: hypercore.NetworkMainnet,
		Asset:   "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
		Amount:  "10000000",
		PayTo:   "0x0987654321098765432109876543210987654321",
	}

	result, err := facilitator.Verify(ctx, payload, requirements)
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	if result.IsValid {
		t.Error("Expected IsValid=false for invalid action type")
	}

	if result.InvalidReason != "invalid_action_type: wrongType" {
		t.Errorf("Expected InvalidReason='invalid_action_type: wrongType', got '%s'", result.InvalidReason)
	}
}

func TestVerify_DestinationMismatch(t *testing.T) {
	facilitator := NewExactHypercoreScheme("https://api.hyperliquid.xyz")
	ctx := context.Background()

	payload := types.PaymentPayload{
		X402Version: 2,
		Payload: map[string]interface{}{
			"action": hypercore.HypercoreSendAssetAction{
				Type:             "sendAsset",
				HyperliquidChain: "Mainnet",
				SignatureChainID: "0x3e7",
				Destination:      "0xWrongDestination1234567890123456789012345", // Wrong destination
				SourceDex:        "spot",
				DestinationDex:   "spot",
				Token:            "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
				Amount:           "0.10000000",
				FromSubAccount:   "",
				Nonce:            time.Now().UnixMilli(),
			},
			"signature": hypercore.HypercoreSignature{R: "0x00", S: "0x00", V: 27},
			"nonce":     time.Now().UnixMilli(),
		},
	}

	requirements := types.PaymentRequirements{
		Scheme:  "exact",
		Network: hypercore.NetworkMainnet,
		Asset:   "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
		Amount:  "10000000",
		PayTo:   "0x0987654321098765432109876543210987654321",
	}

	result, err := facilitator.Verify(ctx, payload, requirements)
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	if result.IsValid {
		t.Error("Expected IsValid=false for destination mismatch")
	}

	if result.InvalidReason != "destination_mismatch" {
		t.Errorf("Expected InvalidReason='destination_mismatch', got '%s'", result.InvalidReason)
	}
}

func TestVerify_InsufficientAmount(t *testing.T) {
	facilitator := NewExactHypercoreScheme("https://api.hyperliquid.xyz")
	ctx := context.Background()

	payload := types.PaymentPayload{
		X402Version: 2,
		Payload: map[string]interface{}{
			"action": hypercore.HypercoreSendAssetAction{
				Type:             "sendAsset",
				HyperliquidChain: "Mainnet",
				SignatureChainID: "0x3e7",
				Destination:      "0x0987654321098765432109876543210987654321",
				SourceDex:        "spot",
				DestinationDex:   "spot",
				Token:            "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
				Amount:           "0.05000000", // Too low: 0.05 USDH = 5000000 units < 10000000 required
				FromSubAccount:   "",
				Nonce:            time.Now().UnixMilli(),
			},
			"signature": hypercore.HypercoreSignature{R: "0x00", S: "0x00", V: 27},
			"nonce":     time.Now().UnixMilli(),
		},
	}

	requirements := types.PaymentRequirements{
		Scheme:  "exact",
		Network: hypercore.NetworkMainnet,
		Asset:   "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
		Amount:  "10000000", // Requires 0.1 USDH = 10000000 units
		PayTo:   "0x0987654321098765432109876543210987654321",
	}

	result, err := facilitator.Verify(ctx, payload, requirements)
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	if result.IsValid {
		t.Error("Expected IsValid=false for insufficient amount")
	}

	if result.InvalidReason != "insufficient_amount" {
		t.Errorf("Expected InvalidReason='insufficient_amount', got '%s'", result.InvalidReason)
	}
}

func TestVerify_TokenMismatch(t *testing.T) {
	facilitator := NewExactHypercoreScheme("https://api.hyperliquid.xyz")
	ctx := context.Background()

	payload := types.PaymentPayload{
		X402Version: 2,
		Payload: map[string]interface{}{
			"action": hypercore.HypercoreSendAssetAction{
				Type:             "sendAsset",
				HyperliquidChain: "Mainnet",
				SignatureChainID: "0x3e7",
				Destination:      "0x0987654321098765432109876543210987654321",
				SourceDex:        "spot",
				DestinationDex:   "spot",
				Token:            "WRONG:0x00000000000000000000000000000000", // Wrong token
				Amount:           "0.10000000",
				FromSubAccount:   "",
				Nonce:            time.Now().UnixMilli(),
			},
			"signature": hypercore.HypercoreSignature{R: "0x00", S: "0x00", V: 27},
			"nonce":     time.Now().UnixMilli(),
		},
	}

	requirements := types.PaymentRequirements{
		Scheme:  "exact",
		Network: hypercore.NetworkMainnet,
		Asset:   "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
		Amount:  "10000000",
		PayTo:   "0x0987654321098765432109876543210987654321",
	}

	result, err := facilitator.Verify(ctx, payload, requirements)
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	if result.IsValid {
		t.Error("Expected IsValid=false for token mismatch")
	}

	if result.InvalidReason != "token_mismatch" {
		t.Errorf("Expected InvalidReason='token_mismatch', got '%s'", result.InvalidReason)
	}
}

func TestVerify_NonceTooOld(t *testing.T) {
	facilitator := NewExactHypercoreScheme("https://api.hyperliquid.xyz")
	ctx := context.Background()

	// Nonce from 2 hours ago
	oldNonce := time.Now().Add(-2 * time.Hour).UnixMilli()

	payload := types.PaymentPayload{
		X402Version: 2,
		Payload: map[string]interface{}{
			"action": hypercore.HypercoreSendAssetAction{
				Type:             "sendAsset",
				HyperliquidChain: "Mainnet",
				SignatureChainID: "0x3e7",
				Destination:      "0x0987654321098765432109876543210987654321",
				SourceDex:        "spot",
				DestinationDex:   "spot",
				Token:            "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
				Amount:           "0.10000000",
				FromSubAccount:   "",
				Nonce:            oldNonce,
			},
			"signature": hypercore.HypercoreSignature{R: "0x00", S: "0x00", V: 27},
			"nonce":     oldNonce,
		},
	}

	requirements := types.PaymentRequirements{
		Scheme:  "exact",
		Network: hypercore.NetworkMainnet,
		Asset:   "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
		Amount:  "10000000",
		PayTo:   "0x0987654321098765432109876543210987654321",
	}

	result, err := facilitator.Verify(ctx, payload, requirements)
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	if result.IsValid {
		t.Error("Expected IsValid=false for old nonce")
	}

	if result.InvalidReason != "nonce_too_old" {
		t.Errorf("Expected InvalidReason='nonce_too_old', got '%s'", result.InvalidReason)
	}
}

func TestVerify_InvalidSignatureStructure(t *testing.T) {
	facilitator := NewExactHypercoreScheme("https://api.hyperliquid.xyz")
	ctx := context.Background()

	payload := types.PaymentPayload{
		X402Version: 2,
		Payload: map[string]interface{}{
			"action": hypercore.HypercoreSendAssetAction{
				Type:             "sendAsset",
				HyperliquidChain: "Mainnet",
				SignatureChainID: "0x3e7",
				Destination:      "0x0987654321098765432109876543210987654321",
				SourceDex:        "spot",
				DestinationDex:   "spot",
				Token:            "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
				Amount:           "0.10000000",
				FromSubAccount:   "",
				Nonce:            time.Now().UnixMilli(),
			},
			"signature": hypercore.HypercoreSignature{
				R: "0x00", // Has R
				S: "",     // Missing S
				V: 27,
			},
			"nonce": time.Now().UnixMilli(),
		},
	}

	requirements := types.PaymentRequirements{
		Scheme:  "exact",
		Network: hypercore.NetworkMainnet,
		Asset:   "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
		Amount:  "10000000",
		PayTo:   "0x0987654321098765432109876543210987654321",
	}

	result, err := facilitator.Verify(ctx, payload, requirements)
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	if result.IsValid {
		t.Error("Expected IsValid=false for invalid signature structure")
	}

	if result.InvalidReason != "invalid_signature_structure" {
		t.Errorf("Expected InvalidReason='invalid_signature_structure', got '%s'", result.InvalidReason)
	}
}

func TestVerify_ValidPayment(t *testing.T) {
	facilitator := NewExactHypercoreScheme("https://api.hyperliquid.xyz")
	ctx := context.Background()

	payload := types.PaymentPayload{
		X402Version: 2,
		Payload: map[string]interface{}{
			"action": hypercore.HypercoreSendAssetAction{
				Type:             "sendAsset",
				HyperliquidChain: "Mainnet",
				SignatureChainID: "0x3e7",
				Destination:      "0x0987654321098765432109876543210987654321",
				SourceDex:        "spot",
				DestinationDex:   "spot",
				Token:            "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
				Amount:           "0.10000000",
				FromSubAccount:   "",
				Nonce:            time.Now().UnixMilli(),
			},
			"signature": hypercore.HypercoreSignature{
				R: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
				S: "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
				V: 27,
			},
			"nonce": time.Now().UnixMilli(),
		},
	}

	requirements := types.PaymentRequirements{
		Scheme:  "exact",
		Network: hypercore.NetworkMainnet,
		Asset:   "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
		Amount:  "10000000",
		PayTo:   "0x0987654321098765432109876543210987654321",
	}

	result, err := facilitator.Verify(ctx, payload, requirements)
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	if !result.IsValid {
		t.Errorf("Expected IsValid=true for valid payment, got false with reason: %s", result.InvalidReason)
	}

	if result.InvalidReason != "" {
		t.Errorf("Expected InvalidReason to be empty for valid payment, got '%s'", result.InvalidReason)
	}
}

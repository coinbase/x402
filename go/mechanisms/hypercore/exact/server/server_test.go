package server

import (
	"context"
	"testing"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/mechanisms/hypercore"
	"github.com/coinbase/x402/go/types"
)

func TestNewExactHypercoreScheme(t *testing.T) {
	scheme := NewExactHypercoreScheme()

	if scheme == nil {
		t.Fatal("Expected scheme to be created, got nil")
	}

	if scheme.Scheme() != hypercore.SchemeExact {
		t.Errorf("Expected scheme='%s', got '%s'", hypercore.SchemeExact, scheme.Scheme())
	}
}

func TestParsePrice_DollarString(t *testing.T) {
	scheme := NewExactHypercoreScheme()

	result, err := scheme.ParsePrice("$0.01", "hypercore:mainnet")
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	if result.Amount != "1000000" {
		t.Errorf("Expected amount='1000000', got '%s'", result.Amount)
	}

	if result.Asset != hypercore.NetworkConfigs["hypercore:mainnet"].DefaultAsset.Token {
		t.Errorf("Expected asset='%s', got '%s'", hypercore.NetworkConfigs["hypercore:mainnet"].DefaultAsset.Token, result.Asset)
	}
}

func TestParsePrice_NumericString(t *testing.T) {
	scheme := NewExactHypercoreScheme()

	result, err := scheme.ParsePrice("0.05", "hypercore:mainnet")
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	if result.Amount != "5000000" {
		t.Errorf("Expected amount='5000000', got '%s'", result.Amount)
	}

	if result.Asset != hypercore.NetworkConfigs["hypercore:mainnet"].DefaultAsset.Token {
		t.Errorf("Expected asset='%s', got '%s'", hypercore.NetworkConfigs["hypercore:mainnet"].DefaultAsset.Token, result.Asset)
	}
}

func TestParsePrice_Float(t *testing.T) {
	scheme := NewExactHypercoreScheme()

	result, err := scheme.ParsePrice(0.1, "hypercore:mainnet")
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	if result.Amount != "10000000" {
		t.Errorf("Expected amount='10000000', got '%s'", result.Amount)
	}

	if result.Asset != hypercore.NetworkConfigs["hypercore:mainnet"].DefaultAsset.Token {
		t.Errorf("Expected asset='%s', got '%s'", hypercore.NetworkConfigs["hypercore:mainnet"].DefaultAsset.Token, result.Asset)
	}
}

func TestParsePrice_LargeAmount(t *testing.T) {
	scheme := NewExactHypercoreScheme()

	result, err := scheme.ParsePrice(1000.50, "hypercore:mainnet")
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	if result.Amount != "100050000000" {
		t.Errorf("Expected amount='100050000000', got '%s'", result.Amount)
	}

	if result.Asset != hypercore.NetworkConfigs["hypercore:mainnet"].DefaultAsset.Token {
		t.Errorf("Expected asset='%s', got '%s'", hypercore.NetworkConfigs["hypercore:mainnet"].DefaultAsset.Token, result.Asset)
	}
}

func TestParsePrice_AssetAmount(t *testing.T) {
	scheme := NewExactHypercoreScheme()

	assetAmount := x402.AssetAmount{
		Amount: "123456",
		Asset:  "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
	}

	result, err := scheme.ParsePrice(assetAmount, "hypercore:mainnet")
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	if result.Amount != "123456" {
		t.Errorf("Expected amount='123456', got '%s'", result.Amount)
	}

	if result.Asset != "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b" {
		t.Errorf("Expected asset to remain unchanged, got '%s'", result.Asset)
	}
}

func TestParsePrice_InvalidFormat(t *testing.T) {
	scheme := NewExactHypercoreScheme()

	_, err := scheme.ParsePrice("invalid", "hypercore:mainnet")
	if err == nil {
		t.Fatal("Expected error for invalid price format, got nil")
	}
}

func TestEnhancePaymentRequirements_Mainnet(t *testing.T) {
	scheme := NewExactHypercoreScheme()
	ctx := context.Background()

	requirements := types.PaymentRequirements{
		Scheme:            hypercore.SchemeExact,
		Network:           hypercore.NetworkMainnet,
		Asset:             hypercore.NetworkConfigs["hypercore:mainnet"].DefaultAsset.Token,
		Amount:            "100000",
		PayTo:             "0x0987654321098765432109876543210987654321",
		MaxTimeoutSeconds: 3600,
	}

	supportedKind := types.SupportedKind{
		X402Version: 2,
		Scheme:      hypercore.SchemeExact,
		Network:     hypercore.NetworkMainnet,
	}

	result, err := scheme.EnhancePaymentRequirements(ctx, requirements, supportedKind, []string{})
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	if result.Extra == nil {
		t.Fatal("Expected extra to be set")
	}

	chainID, ok := result.Extra["signatureChainId"].(int)
	if !ok || chainID != hypercore.SignatureChainID {
		t.Errorf("Expected signatureChainId=%d, got %v", hypercore.SignatureChainID, result.Extra["signatureChainId"])
	}

	isMainnet, ok := result.Extra["isMainnet"].(bool)
	if !ok || !isMainnet {
		t.Errorf("Expected isMainnet=true, got %v", result.Extra["isMainnet"])
	}
}

func TestEnhancePaymentRequirements_Testnet(t *testing.T) {
	scheme := NewExactHypercoreScheme()
	ctx := context.Background()

	requirements := types.PaymentRequirements{
		Scheme:            hypercore.SchemeExact,
		Network:           hypercore.NetworkTestnet,
		Asset:             hypercore.NetworkConfigs["hypercore:mainnet"].DefaultAsset.Token,
		Amount:            "100000",
		PayTo:             "0x0987654321098765432109876543210987654321",
		MaxTimeoutSeconds: 3600,
	}

	supportedKind := types.SupportedKind{
		X402Version: 2,
		Scheme:      hypercore.SchemeExact,
		Network:     hypercore.NetworkTestnet,
	}

	result, err := scheme.EnhancePaymentRequirements(ctx, requirements, supportedKind, []string{})
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	if result.Extra == nil {
		t.Fatal("Expected extra to be set")
	}

	isMainnet, ok := result.Extra["isMainnet"].(bool)
	if !ok || isMainnet {
		t.Errorf("Expected isMainnet=false for testnet, got %v", result.Extra["isMainnet"])
	}
}

func TestEnhancePaymentRequirements_PreservesExistingExtra(t *testing.T) {
	scheme := NewExactHypercoreScheme()
	ctx := context.Background()

	requirements := types.PaymentRequirements{
		Scheme:            hypercore.SchemeExact,
		Network:           hypercore.NetworkMainnet,
		Asset:             hypercore.NetworkConfigs["hypercore:mainnet"].DefaultAsset.Token,
		Amount:            "100000",
		PayTo:             "0x0987654321098765432109876543210987654321",
		MaxTimeoutSeconds: 3600,
		Extra: map[string]interface{}{
			"customField": "customValue",
		},
	}

	supportedKind := types.SupportedKind{
		X402Version: 2,
		Scheme:      hypercore.SchemeExact,
		Network:     hypercore.NetworkMainnet,
	}

	result, err := scheme.EnhancePaymentRequirements(ctx, requirements, supportedKind, []string{})
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	if result.Extra == nil {
		t.Fatal("Expected extra to be set")
	}

	customField, ok := result.Extra["customField"].(string)
	if !ok || customField != "customValue" {
		t.Errorf("Expected customField='customValue' to be preserved, got %v", result.Extra["customField"])
	}

	if result.Extra["signatureChainId"] == nil {
		t.Error("Expected signatureChainId to be added")
	}

	if result.Extra["isMainnet"] == nil {
		t.Error("Expected isMainnet to be added")
	}
}

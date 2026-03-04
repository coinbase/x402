package server

import (
	"fmt"
	"testing"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/mechanisms/hypercore"
)

// TestRegisterMoneyParser_SingleCustomParser tests a single custom money parser
func TestRegisterMoneyParser_SingleCustomParser(t *testing.T) {
	server := NewExactHypercoreScheme()

	// Register custom parser: large amounts use custom token with 18 decimals
	server.RegisterMoneyParser(func(amount float64, network string) (*x402.AssetAmount, error) {
		if amount > 100 {
			return &x402.AssetAmount{
				Amount: fmt.Sprintf("%.0f", amount*1e18), // 18 decimals
				Asset:  "CUSTOM:0xcustomlarge00000000000000000000",
				Extra: map[string]interface{}{
					"name": "Custom Large Token",
					"tier": "large",
				},
			}, nil
		}
		return nil, nil // Use default for small amounts
	})

	// Test large amount - should use custom parser
	result1, err := server.ParsePrice(150.0, "hypercore:mainnet")
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	expectedAmount1 := fmt.Sprintf("%.0f", 150*1e18)
	if result1.Amount != expectedAmount1 {
		t.Errorf("Expected amount %s, got %s", expectedAmount1, result1.Amount)
	}

	if result1.Asset != "CUSTOM:0xcustomlarge00000000000000000000" {
		t.Errorf("Expected custom asset, got %s", result1.Asset)
	}

	if result1.Extra["name"] != "Custom Large Token" {
		t.Errorf("Expected name='Custom Large Token', got %v", result1.Extra["name"])
	}

	// Test small amount - should fall back to default (USDH)
	result2, err := server.ParsePrice(50.0, "hypercore:mainnet")
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	expectedAmount2 := "5000000000" // 50 * 1e8 (USDH has 8 decimals)
	if result2.Amount != expectedAmount2 {
		t.Errorf("Expected amount %s, got %s", expectedAmount2, result2.Amount)
	}

	// Default USDH token
	if result2.Asset != hypercore.NetworkConfigs["hypercore:mainnet"].DefaultAsset.Token {
		t.Errorf("Expected USDH asset, got %s", result2.Asset)
	}
}

// TestRegisterMoneyParser_MultipleInChain tests multiple money parsers in chain
func TestRegisterMoneyParser_MultipleInChain(t *testing.T) {
	server := NewExactHypercoreScheme()

	// Parser 1: Premium tier (> 1000)
	server.RegisterMoneyParser(func(amount float64, network string) (*x402.AssetAmount, error) {
		if amount > 1000 {
			return &x402.AssetAmount{
				Amount: fmt.Sprintf("%.0f", amount*1e18),
				Asset:  "PREMIUM:0xpremiumtoken000000000000000",
				Extra:  map[string]interface{}{"tier": "premium"},
			}, nil
		}
		return nil, nil
	})

	// Parser 2: Large tier (> 100)
	server.RegisterMoneyParser(func(amount float64, network string) (*x402.AssetAmount, error) {
		if amount > 100 {
			return &x402.AssetAmount{
				Amount: fmt.Sprintf("%.0f", amount*1e18),
				Asset:  "LARGE:0xlargetoken0000000000000000",
				Extra:  map[string]interface{}{"tier": "large"},
			}, nil
		}
		return nil, nil
	})

	// Parser 3: Medium tier (> 10)
	server.RegisterMoneyParser(func(amount float64, network string) (*x402.AssetAmount, error) {
		if amount > 10 {
			return &x402.AssetAmount{
				Amount: fmt.Sprintf("%.0f", amount*1e6),
				Asset:  "MEDIUM:0xmediumtoken000000000000000",
				Extra:  map[string]interface{}{"tier": "medium"},
			}, nil
		}
		return nil, nil
	})

	// Test premium tier (first parser matches)
	result1, err := server.ParsePrice(2000.0, "hypercore:mainnet")
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}
	if result1.Extra["tier"] != "premium" {
		t.Errorf("Expected tier='premium', got %v", result1.Extra["tier"])
	}

	// Test large tier (second parser matches)
	result2, err := server.ParsePrice(200.0, "hypercore:mainnet")
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}
	if result2.Extra["tier"] != "large" {
		t.Errorf("Expected tier='large', got %v", result2.Extra["tier"])
	}

	// Test medium tier (third parser matches)
	result3, err := server.ParsePrice(20.0, "hypercore:mainnet")
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}
	if result3.Extra["tier"] != "medium" {
		t.Errorf("Expected tier='medium', got %v", result3.Extra["tier"])
	}

	// Test default (small amount, no parser matches)
	result4, err := server.ParsePrice(5.0, "hypercore:mainnet")
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}
	// Should use default USDH
	if result4.Asset != hypercore.NetworkConfigs["hypercore:mainnet"].DefaultAsset.Token {
		t.Errorf("Expected USDH, got %s", result4.Asset)
	}
}

// TestRegisterMoneyParser_NetworkSpecific tests network-specific parsers
func TestRegisterMoneyParser_NetworkSpecific(t *testing.T) {
	server := NewExactHypercoreScheme()

	// Network-specific parser - only handles testnet
	server.RegisterMoneyParser(func(amount float64, network string) (*x402.AssetAmount, error) {
		if network == "hypercore:testnet" {
			return &x402.AssetAmount{
				Amount: fmt.Sprintf("%.0f", amount*1e6),
				Asset:  "TESTTOKEN:0xtestnetcustomtoken00000",
				Extra:  map[string]interface{}{"network": "testnet"},
			}, nil
		}
		return nil, nil // Skip for other networks
	})

	// Test testnet - should use custom parser
	result1, err := server.ParsePrice(10.0, "hypercore:testnet")
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}
	if result1.Asset != "TESTTOKEN:0xtestnetcustomtoken00000" {
		t.Errorf("Expected custom testnet token, got %s", result1.Asset)
	}

	// Test mainnet - should use default
	result2, err := server.ParsePrice(10.0, "hypercore:mainnet")
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}
	if result2.Asset != hypercore.NetworkConfigs["hypercore:mainnet"].DefaultAsset.Token {
		t.Errorf("Expected default USDH, got %s", result2.Asset)
	}
}

// TestRegisterMoneyParser_StringPrices tests parsing with string prices
func TestRegisterMoneyParser_StringPrices(t *testing.T) {
	server := NewExactHypercoreScheme()

	server.RegisterMoneyParser(func(amount float64, network string) (*x402.AssetAmount, error) {
		if amount > 50 {
			return &x402.AssetAmount{
				Amount: fmt.Sprintf("%.0f", amount*1e18),
				Asset:  "BIGTOKEN:0xbigtoken00000000000000000",
			}, nil
		}
		return nil, nil
	})

	tests := []struct {
		name          string
		price         string
		expectedAsset string
	}{
		{"Dollar format", "$100", "BIGTOKEN:0xbigtoken00000000000000000"},                             // > 50
		{"Plain decimal", "25.50", hypercore.NetworkConfigs["hypercore:mainnet"].DefaultAsset.Token},  // <= 50
		{"Large amount", "75 USD", "BIGTOKEN:0xbigtoken00000000000000000"},                            // > 50
		{"Small amount", "10 USDH", hypercore.NetworkConfigs["hypercore:mainnet"].DefaultAsset.Token}, // <= 50
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := server.ParsePrice(tt.price, "hypercore:mainnet")
			if err != nil {
				t.Fatalf("Expected no error, got %v", err)
			}
			if result.Asset != tt.expectedAsset {
				t.Errorf("Expected asset %s, got %s", tt.expectedAsset, result.Asset)
			}
		})
	}
}

// TestRegisterMoneyParser_ErrorHandling tests parser error handling
func TestRegisterMoneyParser_ErrorHandling(t *testing.T) {
	server := NewExactHypercoreScheme()

	// Parser that returns an error for specific amount
	server.RegisterMoneyParser(func(amount float64, network string) (*x402.AssetAmount, error) {
		if amount == 99 {
			return nil, fmt.Errorf("amount 99 is not allowed")
		}
		return nil, nil
	})

	// Parser that handles successfully
	server.RegisterMoneyParser(func(amount float64, network string) (*x402.AssetAmount, error) {
		if amount > 50 {
			return &x402.AssetAmount{
				Amount: "100000000",
				Asset:  "CUSTOM:0xcustomtoken000000000000000",
			}, nil
		}
		return nil, nil
	})

	// Error in first parser should be skipped, second parser should handle
	result, err := server.ParsePrice(99.0, "hypercore:mainnet")
	if err != nil {
		t.Fatalf("Expected no error (should skip erroring parser), got %v", err)
	}
	if result.Asset != "CUSTOM:0xcustomtoken000000000000000" {
		t.Errorf("Expected second parser to handle, got asset %s", result.Asset)
	}
}

// TestRegisterMoneyParser_Chainability tests that RegisterMoneyParser returns the service for chaining
func TestRegisterMoneyParser_Chainability(t *testing.T) {
	server := NewExactHypercoreScheme()

	result := server.
		RegisterMoneyParser(func(amount float64, network string) (*x402.AssetAmount, error) {
			return nil, nil
		}).
		RegisterMoneyParser(func(amount float64, network string) (*x402.AssetAmount, error) {
			return nil, nil
		})

	if result != server {
		t.Error("Expected RegisterMoneyParser to return server for chaining")
	}
}

// TestRegisterMoneyParser_NoCustomParsers tests default behavior with no custom parsers
func TestRegisterMoneyParser_NoCustomParsers(t *testing.T) {
	server := NewExactHypercoreScheme()

	// No custom parsers registered, should use default
	result, err := server.ParsePrice(10.0, "hypercore:mainnet")
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	// Should use default USDH
	if result.Asset != hypercore.NetworkConfigs["hypercore:mainnet"].DefaultAsset.Token {
		t.Errorf("Expected default USDH, got %s", result.Asset)
	}

	expectedAmount := "1000000000" // 10 * 1e8
	if result.Amount != expectedAmount {
		t.Errorf("Expected amount %s, got %s", expectedAmount, result.Amount)
	}
}

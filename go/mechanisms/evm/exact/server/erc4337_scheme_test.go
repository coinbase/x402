package server

import (
	"context"
	"testing"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/types"
)

func TestExactEvmSchemeERC4337_EnhancePaymentRequirements(t *testing.T) {
	t.Run("preserves userOperation capability", func(t *testing.T) {
		scheme := NewExactEvmSchemeERC4337()

		requirements := types.PaymentRequirements{
			Scheme:  "exact",
			Network: "eip155:84532",
			Amount:  "1000000",
			Asset:   "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
			PayTo:   "0xRecipient",
			Extra: map[string]interface{}{
				"name":    "USDC",
				"version": "2",
				"userOperation": map[string]interface{}{
					"supported":  true,
					"bundlerUrl": "https://bundler.example.com",
					"entrypoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
				},
			},
		}

		supportedKind := types.SupportedKind{
			X402Version: 2,
			Scheme:      "exact",
			Network:     "eip155:84532",
		}

		enhanced, err := scheme.EnhancePaymentRequirements(context.Background(), requirements, supportedKind, []string{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		// Verify userOperation is preserved
		userOp, ok := enhanced.Extra["userOperation"].(map[string]interface{})
		if !ok {
			t.Fatal("userOperation not preserved in enhanced requirements")
		}
		if supported, ok := userOp["supported"].(bool); !ok || !supported {
			t.Error("userOperation.supported should be true")
		}
		if bundlerUrl, ok := userOp["bundlerUrl"].(string); !ok || bundlerUrl != "https://bundler.example.com" {
			t.Errorf("bundlerUrl = %v, want %q", userOp["bundlerUrl"], "https://bundler.example.com")
		}
	})

	t.Run("no userOperation passthrough", func(t *testing.T) {
		scheme := NewExactEvmSchemeERC4337()

		requirements := types.PaymentRequirements{
			Scheme:  "exact",
			Network: "eip155:84532",
			Amount:  "1000000",
			Asset:   "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
			PayTo:   "0xRecipient",
			Extra: map[string]interface{}{
				"name":    "USDC",
				"version": "2",
			},
		}

		supportedKind := types.SupportedKind{
			X402Version: 2,
			Scheme:      "exact",
			Network:     "eip155:84532",
		}

		enhanced, err := scheme.EnhancePaymentRequirements(context.Background(), requirements, supportedKind, []string{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		// Verify no userOperation was added
		if _, ok := enhanced.Extra["userOperation"]; ok {
			t.Error("userOperation should not be present when not in original requirements")
		}
	})

	t.Run("ERC-4337 registry network", func(t *testing.T) {
		scheme := NewExactEvmSchemeERC4337()

		requirements := types.PaymentRequirements{
			Scheme:  "exact",
			Network: "eip155:42161", // Arbitrum - may not be in standard configs
			Amount:  "1000000",
			PayTo:   "0xRecipient",
		}

		supportedKind := types.SupportedKind{
			X402Version: 2,
			Scheme:      "exact",
			Network:     "eip155:42161",
		}

		enhanced, err := scheme.EnhancePaymentRequirements(context.Background(), requirements, supportedKind, []string{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		// Should have an asset from the ERC-4337 registry
		if enhanced.Asset == "" {
			t.Error("expected asset to be filled from ERC-4337 registry")
		}
	})
}

func TestExactEvmSchemeERC4337_GetSupportedNetworks(t *testing.T) {
	scheme := NewExactEvmSchemeERC4337()
	networks := scheme.GetSupportedNetworks()

	if len(networks) == 0 {
		t.Fatal("expected at least some supported networks")
	}

	// Verify ERC-4337 specific chains are included
	hasArbitrum := false
	hasOptimism := false
	for _, n := range networks {
		if n == "eip155:42161" {
			hasArbitrum = true
		}
		if n == "eip155:10" {
			hasOptimism = true
		}
	}

	if !hasArbitrum {
		t.Error("expected Arbitrum (eip155:42161) in supported networks")
	}
	if !hasOptimism {
		t.Error("expected Optimism (eip155:10) in supported networks")
	}
}

func TestExactEvmSchemeERC4337_Scheme(t *testing.T) {
	scheme := NewExactEvmSchemeERC4337()
	if scheme.Scheme() != "exact" {
		t.Errorf("Scheme() = %q, want %q", scheme.Scheme(), "exact")
	}
}

func TestExactEvmSchemeERC4337_ParsePrice_ParentSuccess(t *testing.T) {
	scheme := NewExactEvmSchemeERC4337()

	// Use a network that the parent (standard configs) supports, e.g., Base Sepolia
	var price x402.Price = map[string]interface{}{
		"amount": "1000000",
		"asset":  "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
	}

	result, err := scheme.ParsePrice(price, x402.Network("eip155:84532"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Amount != "1000000" {
		t.Errorf("Amount = %q, want %q", result.Amount, "1000000")
	}
	if result.Asset != "0x036CbD53842c5426634e7929541eC2318f3dCF7e" {
		t.Errorf("Asset = %q, want USDC address", result.Asset)
	}
}

func TestExactEvmSchemeERC4337_ParsePrice_FallbackToERC4337Registry(t *testing.T) {
	scheme := NewExactEvmSchemeERC4337()

	// Use a price value that the parent can parse as Money (decimal)
	// but on a network only in the ERC-4337 registry (e.g., Arbitrum 42161)
	// The parent should fail for this network if it doesn't have a network config
	var price x402.Price = 1.50

	result, err := scheme.ParsePrice(price, x402.Network("eip155:42161"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Should have populated asset from ERC-4337 registry
	if result.Asset == "" {
		t.Error("expected asset to be filled from ERC-4337 registry")
	}
}

func TestExactEvmSchemeERC4337_ParsePrice_BothFail(t *testing.T) {
	scheme := NewExactEvmSchemeERC4337()

	// Use a completely unknown network that is not in either parent or ERC-4337 registry
	var price x402.Price = 1.50

	_, err := scheme.ParsePrice(price, x402.Network("eip155:999999999"))
	if err == nil {
		t.Fatal("expected error for unsupported network in both parent and ERC-4337 registry")
	}
}

func TestExactEvmSchemeERC4337_enhanceFromERC4337Registry_ChainNotInRegistry(t *testing.T) {
	scheme := NewExactEvmSchemeERC4337()

	requirements := types.PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:999999999", // Not in ERC-4337 registry
		Amount:  "1000000",
		PayTo:   "0xRecipient",
	}

	supportedKind := types.SupportedKind{
		X402Version: 2,
		Scheme:      "exact",
		Network:     "eip155:999999999",
	}

	_, err := scheme.EnhancePaymentRequirements(context.Background(), requirements, supportedKind, []string{})
	if err == nil {
		t.Fatal("expected error for chain not in registry")
	}
}

func TestExactEvmSchemeERC4337_enhanceFromERC4337Registry_ChainLookupReturnsNil(t *testing.T) {
	// ResolveERC4337ChainId succeeds (valid CAIP-2 format) but GetERC4337Chain returns nil
	// because the chain ID is not in the ERC4337SupportedChains map.
	scheme := NewExactEvmSchemeERC4337()

	requirements := types.PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:12345", // Valid CAIP-2 but not in ERC-4337 registry
		Amount:  "500000",
		PayTo:   "0xRecipient",
		Extra:   map[string]interface{}{"name": "USDC", "version": "2"},
	}

	supportedKind := types.SupportedKind{
		X402Version: 2,
		Scheme:      "exact",
		Network:     "eip155:12345",
	}

	_, err := scheme.EnhancePaymentRequirements(context.Background(), requirements, supportedKind, []string{})
	if err == nil {
		t.Fatal("expected error when GetERC4337Chain returns nil")
	}
	// Verify the error message mentions the chain is not in the registry
	expected := "chain 12345 not in ERC-4337 registry"
	if err.Error() != expected {
		t.Errorf("error = %q, want %q", err.Error(), expected)
	}
}

func TestExactEvmSchemeERC4337_enhanceFromERC4337Registry_InvalidCAIP2(t *testing.T) {
	// Network is an invalid CAIP-2 with a non-numeric chain ID
	scheme := NewExactEvmSchemeERC4337()

	requirements := types.PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:notanumber",
		Amount:  "500000",
		PayTo:   "0xRecipient",
	}

	supportedKind := types.SupportedKind{
		X402Version: 2,
		Scheme:      "exact",
		Network:     "eip155:notanumber",
	}

	_, err := scheme.EnhancePaymentRequirements(context.Background(), requirements, supportedKind, []string{})
	if err == nil {
		t.Fatal("expected error for invalid CAIP-2 chain ID")
	}
}

func TestExactEvmSchemeERC4337_enhanceFromERC4337Registry_ExtensionKeysCopied(t *testing.T) {
	// Verify that extension keys from supportedKind.Extra are copied into the enhanced requirements
	scheme := NewExactEvmSchemeERC4337()

	requirements := types.PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:42161", // Arbitrum - in ERC-4337 registry
		Amount:  "1000000",
		PayTo:   "0xRecipient",
	}

	supportedKind := types.SupportedKind{
		X402Version: 2,
		Scheme:      "exact",
		Network:     "eip155:42161",
		Extra: map[string]interface{}{
			"customKey": "customValue",
		},
	}

	enhanced, err := scheme.EnhancePaymentRequirements(context.Background(), requirements, supportedKind, []string{"customKey"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if enhanced.Extra == nil {
		t.Fatal("expected Extra to be non-nil")
	}
	if enhanced.Extra["customKey"] != "customValue" {
		t.Errorf("Extra[customKey] = %v, want %q", enhanced.Extra["customKey"], "customValue")
	}
}

func TestExactEvmSchemeERC4337_enhanceFromERC4337Registry_AssetPreserved(t *testing.T) {
	scheme := NewExactEvmSchemeERC4337()

	customAsset := "0xCustomAssetAddress000000000000000000000000"
	requirements := types.PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:42161", // Arbitrum - in ERC-4337 registry
		Amount:  "1000000",
		Asset:   customAsset,
		PayTo:   "0xRecipient",
	}

	supportedKind := types.SupportedKind{
		X402Version: 2,
		Scheme:      "exact",
		Network:     "eip155:42161",
	}

	enhanced, err := scheme.EnhancePaymentRequirements(context.Background(), requirements, supportedKind, []string{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Asset should be preserved (not overwritten by registry default)
	if enhanced.Asset != customAsset {
		t.Errorf("Asset = %q, want %q (should preserve original)", enhanced.Asset, customAsset)
	}
}

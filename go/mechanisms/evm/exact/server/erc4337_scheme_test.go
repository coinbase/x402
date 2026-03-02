package server

import (
	"context"
	"testing"

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

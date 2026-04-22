package x402

import (
	"testing"
)

// TestNetworkParse tests Network.Parse() method for CAIP-2 format validation
func TestNetworkParse(t *testing.T) {
	t.Run("valid CAIP-2 returns namespace and reference", func(t *testing.T) {
		ns, ref, err := Network("eip155:8453").Parse()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if ns != "eip155" {
			t.Errorf("expected namespace %q, got %q", "eip155", ns)
		}
		if ref != "8453" {
			t.Errorf("expected reference %q, got %q", "8453", ref)
		}
	})

	t.Run("solana network parses correctly", func(t *testing.T) {
		ns, ref, err := Network("solana:mainnet").Parse()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if ns != "solana" {
			t.Errorf("expected namespace %q, got %q", "solana", ns)
		}
		if ref != "mainnet" {
			t.Errorf("expected reference %q, got %q", "mainnet", ref)
		}
	})

	t.Run("wildcard network parses correctly", func(t *testing.T) {
		ns, ref, err := Network("eip155:*").Parse()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if ns != "eip155" {
			t.Errorf("expected namespace %q, got %q", "eip155", ns)
		}
		if ref != "*" {
			t.Errorf("expected reference %q, got %q", "*", ref)
		}
	})

	t.Run("empty string returns error", func(t *testing.T) {
		_, _, err := Network("").Parse()
		if err == nil {
			t.Error("expected error for empty network string, got nil")
		}
	})

	t.Run("missing colon returns error", func(t *testing.T) {
		_, _, err := Network("eip155").Parse()
		if err == nil {
			t.Error("expected error for network without colon, got nil")
		}
	})

	t.Run("multiple colons returns error", func(t *testing.T) {
		_, _, err := Network("eip155:8453:extra").Parse()
		if err == nil {
			t.Error("expected error for network with multiple colons, got nil")
		}
	})

	t.Run("ethereum mainnet parses correctly", func(t *testing.T) {
		ns, ref, err := Network("eip155:1").Parse()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if ns != "eip155" || ref != "1" {
			t.Errorf("expected (eip155, 1), got (%s, %s)", ns, ref)
		}
	})
}

// TestParseNetwork tests the ParseNetwork convenience function
func TestParseNetwork(t *testing.T) {
	tests := []struct {
		input    string
		expected Network
	}{
		{"eip155:8453", Network("eip155:8453")},
		{"eip155:*", Network("eip155:*")},
		{"solana:mainnet", Network("solana:mainnet")},
		{"", Network("")},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := ParseNetwork(tt.input)
			if result != tt.expected {
				t.Errorf("ParseNetwork(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

// TestIsWildcardNetwork tests wildcard detection for network patterns
func TestIsWildcardNetwork(t *testing.T) {
	tests := []struct {
		network  Network
		expected bool
	}{
		{"eip155:*", true},
		{"solana:*", true},
		{"eip155:8453", false},
		{"eip155:1", false},
		{"solana:mainnet", false},
		{"", false},
		// Edge cases
		{"*", false},     // No colon prefix — does not end with ":*"
		{"eip155:", false}, // Colon but no *
	}

	for _, tt := range tests {
		t.Run(string(tt.network), func(t *testing.T) {
			result := IsWildcardNetwork(tt.network)
			if result != tt.expected {
				t.Errorf("IsWildcardNetwork(%q) = %v, want %v", tt.network, result, tt.expected)
			}
		})
	}
}

// TestMatchesNetwork tests one-directional pattern matching (pattern → network)
func TestMatchesNetwork(t *testing.T) {
	tests := []struct {
		name     string
		pattern  Network
		network  Network
		expected bool
	}{
		{"exact match", "eip155:8453", "eip155:8453", true},
		{"wildcard matches specific", "eip155:*", "eip155:8453", true},
		{"wildcard matches mainnet", "eip155:*", "eip155:1", true},
		{"wildcard matches sepolia", "eip155:*", "eip155:84532", true},
		{"specific does not match different chain", "eip155:8453", "eip155:1", false},
		{"specific does not match wildcard", "eip155:8453", "eip155:*", false},
		{"different namespaces do not match", "eip155:*", "solana:mainnet", false},
		{"solana wildcard matches solana mainnet", "solana:*", "solana:mainnet", true},
		{"solana wildcard does not match eip155", "solana:*", "eip155:8453", false},
		{"empty pattern does not match", "", "eip155:8453", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := MatchesNetwork(tt.pattern, tt.network)
			if result != tt.expected {
				t.Errorf("MatchesNetwork(%q, %q) = %v, want %v",
					tt.pattern, tt.network, result, tt.expected)
			}
		})
	}
}

// TestDefaultPaymentSelector tests selector returns first requirement and panics on empty slice
func TestDefaultPaymentSelector(t *testing.T) {
	t.Run("returns first element from single-item slice", func(t *testing.T) {
		req := PaymentRequirements{
			Scheme:  "exact",
			Network: "eip155:8453",
			Amount:  "1000000",
			PayTo:   "0xrecipient",
			Asset:   "0xasset",
		}
		views := []PaymentRequirementsView{req}
		result := DefaultPaymentSelector(views)
		if result == nil {
			t.Fatal("expected non-nil result")
		}
		// Should be the same as the input
		if result.GetScheme() != req.Scheme {
			t.Errorf("expected scheme %q, got %q", req.Scheme, result.GetScheme())
		}
	})

	t.Run("returns first element from multi-item slice", func(t *testing.T) {
		first := PaymentRequirements{
			Scheme:  "exact",
			Network: "eip155:8453",
			Amount:  "1000000",
			PayTo:   "0xrecipient",
			Asset:   "0xasset",
		}
		second := PaymentRequirements{
			Scheme:  "upto",
			Network: "eip155:1",
			Amount:  "2000000",
			PayTo:   "0xother",
			Asset:   "0xotherasset",
		}
		views := []PaymentRequirementsView{first, second}
		result := DefaultPaymentSelector(views)
		if result.GetScheme() != "exact" {
			t.Errorf("expected first element scheme %q, got %q", "exact", result.GetScheme())
		}
	})

	t.Run("panics on empty slice", func(t *testing.T) {
		defer func() {
			if r := recover(); r == nil {
				t.Error("expected panic for empty requirements slice, got nil")
			}
		}()
		DefaultPaymentSelector([]PaymentRequirementsView{})
	})
}

// TestDeepEqual tests JSON-normalized deep equality for payment requirements
func TestDeepEqual(t *testing.T) {
	t.Run("identical structs are equal", func(t *testing.T) {
		a := PaymentRequirements{
			Scheme:  "exact",
			Network: "eip155:8453",
			Amount:  "1000000",
			PayTo:   "0xrecipient",
			Asset:   "0xasset",
		}
		b := a // copy
		if !DeepEqual(a, b) {
			t.Error("expected identical structs to be equal")
		}
	})

	t.Run("structs with different schemes are not equal", func(t *testing.T) {
		a := PaymentRequirements{Scheme: "exact", Network: "eip155:8453"}
		b := PaymentRequirements{Scheme: "upto", Network: "eip155:8453"}
		if DeepEqual(a, b) {
			t.Error("expected structs with different schemes to be unequal")
		}
	})

	t.Run("structs with different networks are not equal", func(t *testing.T) {
		a := PaymentRequirements{Scheme: "exact", Network: "eip155:8453"}
		b := PaymentRequirements{Scheme: "exact", Network: "eip155:1"}
		if DeepEqual(a, b) {
			t.Error("expected structs with different networks to be unequal")
		}
	})

	t.Run("equivalent maps are equal", func(t *testing.T) {
		a := map[string]interface{}{"key": "value", "num": float64(42)}
		b := map[string]interface{}{"key": "value", "num": float64(42)}
		if !DeepEqual(a, b) {
			t.Error("expected equivalent maps to be equal")
		}
	})

	t.Run("maps with different values are not equal", func(t *testing.T) {
		a := map[string]interface{}{"key": "value1"}
		b := map[string]interface{}{"key": "value2"}
		if DeepEqual(a, b) {
			t.Error("expected maps with different values to be unequal")
		}
	})

	t.Run("nil values are equal to each other", func(t *testing.T) {
		if !DeepEqual(nil, nil) {
			t.Error("expected nil == nil")
		}
	})

	t.Run("empty struct equals empty struct", func(t *testing.T) {
		a := PaymentRequirements{}
		b := PaymentRequirements{}
		if !DeepEqual(a, b) {
			t.Error("expected empty structs to be equal")
		}
	})

	t.Run("struct with extra field is not equal to without", func(t *testing.T) {
		a := PaymentRequirements{Scheme: "exact", Network: "eip155:8453", Amount: "1000000"}
		b := PaymentRequirements{Scheme: "exact", Network: "eip155:8453"}
		if DeepEqual(a, b) {
			t.Error("expected structs with different fields to be unequal")
		}
	})

	t.Run("JSON-marshaled and original struct are equal", func(t *testing.T) {
		a := PaymentRequirements{
			Scheme:  "exact",
			Network: "eip155:8453",
			Amount:  "1000000",
			PayTo:   "0xrecipient",
			Asset:   "0xasset",
		}
		// Represent via map including zero-valued fields (simulates JSON round-trip)
		// MaxTimeoutSeconds defaults to 0 and is not omitempty in V2
		b := map[string]interface{}{
			"scheme":            "exact",
			"network":           "eip155:8453",
			"amount":            "1000000",
			"payTo":             "0xrecipient",
			"asset":             "0xasset",
			"maxTimeoutSeconds": float64(0),
		}
		if !DeepEqual(a, b) {
			t.Error("expected struct and equivalent map to be equal after JSON normalization")
		}
	})
}

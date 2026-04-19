package svm_test

import (
	"testing"

	svm "github.com/coinbase/x402/go/mechanisms/svm"
)

// ---------------------------------------------------------------------------
// ExactSvmPayload.ToMap
// ---------------------------------------------------------------------------

func TestExactSvmPayload_ToMap(t *testing.T) {
	t.Run("returns map with transaction field", func(t *testing.T) {
		p := &svm.ExactSvmPayload{Transaction: "aGVsbG8="}
		m := p.ToMap()

		tx, ok := m["transaction"]
		if !ok {
			t.Fatal("expected 'transaction' key in map")
		}
		if tx != "aGVsbG8=" {
			t.Errorf("expected 'aGVsbG8=', got %q", tx)
		}
	})

	t.Run("empty transaction round-trips", func(t *testing.T) {
		p := &svm.ExactSvmPayload{Transaction: ""}
		m := p.ToMap()

		if tx, ok := m["transaction"]; !ok || tx != "" {
			t.Errorf("expected empty string for transaction, got %v", m["transaction"])
		}
	})

	t.Run("map has exactly one key", func(t *testing.T) {
		p := &svm.ExactSvmPayload{Transaction: "dGVzdA=="}
		m := p.ToMap()

		if len(m) != 1 {
			t.Errorf("expected map with 1 key, got %d keys", len(m))
		}
	})
}

// ---------------------------------------------------------------------------
// PayloadFromMap
// ---------------------------------------------------------------------------

func TestPayloadFromMap(t *testing.T) {
	t.Run("parses valid map", func(t *testing.T) {
		m := map[string]interface{}{
			"transaction": "aGVsbG8=",
		}
		p, err := svm.PayloadFromMap(m)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p.Transaction != "aGVsbG8=" {
			t.Errorf("expected 'aGVsbG8=', got %q", p.Transaction)
		}
	})

	t.Run("rejects missing transaction field", func(t *testing.T) {
		m := map[string]interface{}{}
		_, err := svm.PayloadFromMap(m)
		if err == nil {
			t.Fatal("expected error for missing transaction, got nil")
		}
	})

	t.Run("rejects empty transaction value", func(t *testing.T) {
		m := map[string]interface{}{
			"transaction": "",
		}
		_, err := svm.PayloadFromMap(m)
		if err == nil {
			t.Fatal("expected error for empty transaction string, got nil")
		}
	})

	t.Run("ToMap → PayloadFromMap round-trip", func(t *testing.T) {
		original := &svm.ExactSvmPayload{Transaction: "dGVzdA=="}
		m := original.ToMap()

		parsed, err := svm.PayloadFromMap(m)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if parsed.Transaction != original.Transaction {
			t.Errorf("round-trip mismatch: got %q, want %q", parsed.Transaction, original.Transaction)
		}
	})

	t.Run("ignores extra fields", func(t *testing.T) {
		m := map[string]interface{}{
			"transaction": "dGVzdA==",
			"extra":       "field",
		}
		p, err := svm.PayloadFromMap(m)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p.Transaction != "dGVzdA==" {
			t.Errorf("expected 'dGVzdA==', got %q", p.Transaction)
		}
	})

	t.Run("long base64 transaction string", func(t *testing.T) {
		// Realistic base64-length transaction (Solana txs are 200-1200 bytes)
		longTx := "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
			"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=="
		m := map[string]interface{}{"transaction": longTx}
		p, err := svm.PayloadFromMap(m)
		if err != nil {
			t.Fatalf("unexpected error for long tx: %v", err)
		}
		if p.Transaction != longTx {
			t.Error("long transaction string not preserved")
		}
	})
}

// ---------------------------------------------------------------------------
// IsValidNetwork
// ---------------------------------------------------------------------------

func TestIsValidNetwork(t *testing.T) {
	validCases := []struct {
		name    string
		network string
	}{
		{"mainnet CAIP-2", svm.SolanaMainnetCAIP2},
		{"devnet CAIP-2", svm.SolanaDevnetCAIP2},
		{"testnet CAIP-2", svm.SolanaTestnetCAIP2},
		{"mainnet V1 name", svm.SolanaMainnetV1},
		{"devnet V1 name", svm.SolanaDevnetV1},
		{"testnet V1 name", svm.SolanaTestnetV1},
	}

	for _, tc := range validCases {
		t.Run(tc.name, func(t *testing.T) {
			if !svm.IsValidNetwork(tc.network) {
				t.Errorf("IsValidNetwork(%q) = false, want true", tc.network)
			}
		})
	}

	invalidCases := []struct {
		name    string
		network string
	}{
		{"empty string", ""},
		{"EVM mainnet", "eip155:1"},
		{"EVM base", "eip155:8453"},
		{"random string", "not-a-network"},
		{"partial CAIP-2", "solana:"},
		{"unsupported solana CAIP-2", "solana:unknowngenesis1111111111111"},
	}

	for _, tc := range invalidCases {
		t.Run(tc.name, func(t *testing.T) {
			if svm.IsValidNetwork(tc.network) {
				t.Errorf("IsValidNetwork(%q) = true, want false", tc.network)
			}
		})
	}
}

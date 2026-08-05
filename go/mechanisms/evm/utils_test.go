package evm

import (
	"errors"
	"strings"
	"testing"

	x402 "github.com/x402-foundation/x402/go/v2"
)

type programmerError struct{}

func (programmerError) Error() string { return "programmer error" }

func (programmerError) RuntimeError() {}

func TestIsValidTxHash(t *testing.T) {
	cases := []struct {
		name string
		hash string
		want bool
	}{
		{"valid hash", "0x" + strings.Repeat("ab", 32), true},
		{"missing 0x prefix", strings.Repeat("ab", 32), false},
		{"too short", "0x" + strings.Repeat("ab", 31), false},
		{"too long", "0x" + strings.Repeat("ab", 33), false},
		{"non-hex characters", "0x" + strings.Repeat("zz", 32), false},
		{"empty string", "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := IsValidTxHash(tc.hash); got != tc.want {
				t.Errorf("IsValidTxHash(%q) = %v, want %v", tc.hash, got, tc.want)
			}
		})
	}
}

func TestIsLikelyTransportError(t *testing.T) {
	if !IsLikelyTransportError(errors.New("rpc timeout")) {
		t.Error("expected RPC error to be transport-like")
	}
	if IsLikelyTransportError(programmerError{}) {
		t.Error("expected runtime error to be terminal")
	}
}

func TestTruncateErrorMessage(t *testing.T) {
	short := "connection refused"
	if got := TruncateErrorMessage(short); got != short {
		t.Errorf("TruncateErrorMessage(%q) = %q, want unchanged", short, got)
	}

	long := strings.Repeat("x", MaxErrorMessageLength+100)
	got := TruncateErrorMessage(long)
	if len(got) != MaxErrorMessageLength {
		t.Errorf("TruncateErrorMessage returned length %d, want %d", len(got), MaxErrorMessageLength)
	}
	if got != long[:MaxErrorMessageLength] {
		t.Error("TruncateErrorMessage did not preserve the leading bytes")
	}
}

func TestInvalidBroadcastHashError(t *testing.T) {
	err := InvalidBroadcastHashError("invalid_transaction_failed", "0xpayer", x402.Network("eip155:1"), "not-a-hash")

	var se *x402.SettleError
	if !errors.As(err, &se) {
		t.Fatalf("expected *x402.SettleError, got %T", err)
	}
	if se.ErrorReason != "invalid_transaction_failed" {
		t.Errorf("ErrorReason = %q, want %q", se.ErrorReason, "invalid_transaction_failed")
	}
	if se.Payer != "0xpayer" {
		t.Errorf("Payer = %q, want %q", se.Payer, "0xpayer")
	}
	if se.Network != x402.Network("eip155:1") {
		t.Errorf("Network = %q, want %q", se.Network, "eip155:1")
	}
	if se.Transaction != "" {
		t.Errorf("Transaction = %q, want empty (settlement_pending needs a hash to reconcile, this doesn't have one)", se.Transaction)
	}
	if !strings.Contains(se.ErrorMessage, "not-a-hash") {
		t.Errorf("ErrorMessage %q does not mention the invalid hash", se.ErrorMessage)
	}
}

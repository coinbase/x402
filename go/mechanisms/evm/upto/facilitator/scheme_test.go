package facilitator

import (
	"context"
	"errors"
	"math/big"
	"testing"

	x402 "github.com/x402-foundation/x402/go"
	"github.com/x402-foundation/x402/go/mechanisms/evm"
	"github.com/x402-foundation/x402/go/types"
)

// mockUptoFacilitatorSigner is a minimal stub satisfying evm.FacilitatorEvmSigner.
type mockUptoFacilitatorSigner struct {
	addresses []string
}

func (m *mockUptoFacilitatorSigner) GetAddresses() []string { return m.addresses }

func (m *mockUptoFacilitatorSigner) ReadContract(_ context.Context, _ string, _ []byte, _ string, _ ...interface{}) (interface{}, error) {
	return nil, nil
}

func (m *mockUptoFacilitatorSigner) VerifyTypedData(_ context.Context, _ string, _ evm.TypedDataDomain, _ map[string][]evm.TypedDataField, _ string, _ map[string]interface{}, _ []byte) (bool, error) {
	return false, nil
}

func (m *mockUptoFacilitatorSigner) WriteContract(_ context.Context, _ string, _ []byte, _ string, _ ...interface{}) (string, error) {
	return "", nil
}

func (m *mockUptoFacilitatorSigner) SendTransaction(_ context.Context, _ string, _ []byte) (string, error) {
	return "", nil
}

func (m *mockUptoFacilitatorSigner) WaitForTransactionReceipt(_ context.Context, _ string) (*evm.TransactionReceipt, error) {
	return nil, nil
}

func (m *mockUptoFacilitatorSigner) GetBalance(_ context.Context, _ string, _ string) (*big.Int, error) {
	return big.NewInt(0), nil
}

func (m *mockUptoFacilitatorSigner) GetChainID(_ context.Context) (*big.Int, error) {
	return big.NewInt(8453), nil
}

func (m *mockUptoFacilitatorSigner) GetCode(_ context.Context, _ string) ([]byte, error) {
	return nil, nil
}

// ---------------------------------------------------------------------------
// NewUptoEvmScheme
// ---------------------------------------------------------------------------

func TestNewUptoEvmScheme_NilConfig(t *testing.T) {
	signer := &mockUptoFacilitatorSigner{addresses: []string{"0xABCD"}}
	s := NewUptoEvmScheme(signer, nil)
	if s == nil {
		t.Fatal("expected non-nil scheme")
	}
	if s.config.SimulateInSettle {
		t.Error("SimulateInSettle should default to false")
	}
}

func TestNewUptoEvmScheme_NonNilConfig(t *testing.T) {
	signer := &mockUptoFacilitatorSigner{}
	cfg := &UptoEvmSchemeConfig{SimulateInSettle: true}
	s := NewUptoEvmScheme(signer, cfg)
	if !s.config.SimulateInSettle {
		t.Error("SimulateInSettle should be true")
	}
}

func TestNewUptoEvmScheme_ConfigIsCopied(t *testing.T) {
	signer := &mockUptoFacilitatorSigner{}
	cfg := &UptoEvmSchemeConfig{SimulateInSettle: true}
	s := NewUptoEvmScheme(signer, cfg)
	cfg.SimulateInSettle = false
	if !s.config.SimulateInSettle {
		t.Error("scheme config should be a copy, not a pointer")
	}
}

// ---------------------------------------------------------------------------
// Scheme / CaipFamily / GetExtra / GetSigners
// ---------------------------------------------------------------------------

func TestUptoEvmScheme_GetExtra_NoAddresses_ReturnsNil(t *testing.T) {
	s := NewUptoEvmScheme(&mockUptoFacilitatorSigner{addresses: nil}, nil)
	extra := s.GetExtra(x402.Network("eip155:8453"))
	if extra != nil {
		t.Errorf("expected nil when signer has no addresses, got %v", extra)
	}
}

func TestUptoEvmScheme_GetExtra_EmptyAddresses_ReturnsNil(t *testing.T) {
	s := NewUptoEvmScheme(&mockUptoFacilitatorSigner{addresses: []string{}}, nil)
	extra := s.GetExtra(x402.Network("eip155:8453"))
	if extra != nil {
		t.Errorf("expected nil for empty address list, got %v", extra)
	}
}

func TestUptoEvmScheme_GetExtra_WithAddresses_ReturnsFacilitatorAddress(t *testing.T) {
	addr := "0x1111111111111111111111111111111111111111"
	s := NewUptoEvmScheme(&mockUptoFacilitatorSigner{addresses: []string{addr}}, nil)
	extra := s.GetExtra(x402.Network("eip155:8453"))
	if extra == nil {
		t.Fatal("expected non-nil extra when addresses are available")
	}
	got, ok := extra["facilitatorAddress"].(string)
	if !ok {
		t.Fatalf("expected facilitatorAddress string, got %T", extra["facilitatorAddress"])
	}
	if got != addr {
		t.Errorf("expected %q, got %q", addr, got)
	}
}

func TestUptoEvmScheme_GetExtra_MultipleAddresses_ReturnsOneOfThem(t *testing.T) {
	addrs := []string{
		"0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
		"0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
		"0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
	}
	s := NewUptoEvmScheme(&mockUptoFacilitatorSigner{addresses: addrs}, nil)

	seen := map[string]bool{}
	for i := 0; i < 100; i++ {
		extra := s.GetExtra(x402.Network("eip155:8453"))
		if extra == nil {
			t.Fatal("unexpected nil extra")
		}
		addr, ok := extra["facilitatorAddress"].(string)
		if !ok {
			t.Fatal("facilitatorAddress not a string")
		}
		found := false
		for _, a := range addrs {
			if a == addr {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("returned address %q not in signer addresses", addr)
		}
		seen[addr] = true
	}
	// With 100 iterations over 3 addresses (rand.Intn), expect at least 2 distinct values.
	if len(seen) < 2 {
		t.Errorf("expected random selection across addresses, got only %d distinct value(s)", len(seen))
	}
}

func TestUptoEvmScheme_GetSigners_ReturnsAddresses(t *testing.T) {
	addrs := []string{"0x111", "0x222"}
	s := NewUptoEvmScheme(&mockUptoFacilitatorSigner{addresses: addrs}, nil)
	got := s.GetSigners(x402.Network("eip155:8453"))
	if len(got) != 2 || got[0] != addrs[0] || got[1] != addrs[1] {
		t.Errorf("expected %v, got %v", addrs, got)
	}
}

func TestUptoEvmScheme_GetSigners_Empty(t *testing.T) {
	s := NewUptoEvmScheme(&mockUptoFacilitatorSigner{addresses: nil}, nil)
	got := s.GetSigners(x402.Network("eip155:1"))
	if len(got) != 0 {
		t.Errorf("expected empty slice, got %v", got)
	}
}

// ---------------------------------------------------------------------------
// Verify routing — non-upto payload rejected immediately
// ---------------------------------------------------------------------------

func TestUptoEvmScheme_Verify_EmptyPayload_Rejected(t *testing.T) {
	s := NewUptoEvmScheme(&mockUptoFacilitatorSigner{}, nil)
	payload := types.PaymentPayload{
		X402Version: 2,
		Payload:     map[string]interface{}{},
	}
	_, err := s.Verify(context.Background(), payload, types.PaymentRequirements{}, nil)
	if err == nil {
		t.Fatal("expected error for empty payload")
	}
	var verr *x402.VerifyError
	if !errors.As(err, &verr) {
		t.Fatalf("expected VerifyError, got %T: %v", err, err)
	}
	if verr.InvalidReason != ErrUptoInvalidPayload {
		t.Errorf("expected %q, got %q", ErrUptoInvalidPayload, verr.InvalidReason)
	}
}

func TestUptoEvmScheme_Verify_ExactPermit2Payload_Rejected(t *testing.T) {
	// An exact Permit2 payload has "permit2Authorization" but no "witness.facilitator"
	// → IsUptoPermit2Payload returns false → rejected.
	s := NewUptoEvmScheme(&mockUptoFacilitatorSigner{}, nil)
	payload := types.PaymentPayload{
		X402Version: 2,
		Payload: map[string]interface{}{
			"signature": "0xabc",
			"permit2Authorization": map[string]interface{}{
				"from":    "0x111",
				"spender": "0x222",
				// No "witness" with "facilitator" key
			},
		},
	}
	_, err := s.Verify(context.Background(), payload, types.PaymentRequirements{}, nil)
	if err == nil {
		t.Fatal("expected error for non-upto payload")
	}
	var verr *x402.VerifyError
	if !errors.As(err, &verr) {
		t.Fatalf("expected VerifyError, got %T: %v", err, err)
	}
	if verr.InvalidReason != ErrUptoInvalidPayload {
		t.Errorf("expected %q, got %q", ErrUptoInvalidPayload, verr.InvalidReason)
	}
}

func TestUptoEvmScheme_Verify_NilPayloadMap_Rejected(t *testing.T) {
	s := NewUptoEvmScheme(&mockUptoFacilitatorSigner{}, nil)
	payload := types.PaymentPayload{
		X402Version: 2,
		Payload:     nil,
	}
	_, err := s.Verify(context.Background(), payload, types.PaymentRequirements{}, nil)
	if err == nil {
		t.Fatal("expected error for nil payload map")
	}
	var verr *x402.VerifyError
	if !errors.As(err, &verr) {
		t.Fatalf("expected VerifyError, got %T: %v", err, err)
	}
	if verr.InvalidReason != ErrUptoInvalidPayload {
		t.Errorf("expected %q, got %q", ErrUptoInvalidPayload, verr.InvalidReason)
	}
}

// ---------------------------------------------------------------------------
// Settle routing — non-upto payload rejected immediately
// ---------------------------------------------------------------------------

func TestUptoEvmScheme_Settle_EmptyPayload_Rejected(t *testing.T) {
	s := NewUptoEvmScheme(&mockUptoFacilitatorSigner{}, nil)
	payload := types.PaymentPayload{
		X402Version: 2,
		Accepted:    types.PaymentRequirements{Network: "eip155:8453"},
		Payload:     map[string]interface{}{},
	}
	_, err := s.Settle(context.Background(), payload, types.PaymentRequirements{}, nil)
	if err == nil {
		t.Fatal("expected error for empty payload")
	}
	var serr *x402.SettleError
	if !errors.As(err, &serr) {
		t.Fatalf("expected SettleError, got %T: %v", err, err)
	}
	if serr.ErrorReason != ErrUptoInvalidPayload {
		t.Errorf("expected %q, got %q", ErrUptoInvalidPayload, serr.ErrorReason)
	}
}

func TestUptoEvmScheme_Settle_NilPayloadMap_Rejected(t *testing.T) {
	s := NewUptoEvmScheme(&mockUptoFacilitatorSigner{}, nil)
	payload := types.PaymentPayload{
		X402Version: 2,
		Accepted:    types.PaymentRequirements{Network: "eip155:1"},
		Payload:     nil,
	}
	_, err := s.Settle(context.Background(), payload, types.PaymentRequirements{}, nil)
	if err == nil {
		t.Fatal("expected error for nil payload map")
	}
	var serr *x402.SettleError
	if !errors.As(err, &serr) {
		t.Fatalf("expected SettleError, got %T: %v", err, err)
	}
	if serr.ErrorReason != ErrUptoInvalidPayload {
		t.Errorf("expected %q, got %q", ErrUptoInvalidPayload, serr.ErrorReason)
	}
}

func TestUptoEvmScheme_Settle_ExactPermit2Payload_Rejected(t *testing.T) {
	s := NewUptoEvmScheme(&mockUptoFacilitatorSigner{}, nil)
	payload := types.PaymentPayload{
		X402Version: 2,
		Accepted:    types.PaymentRequirements{Network: "eip155:8453"},
		Payload: map[string]interface{}{
			"signature": "0xabc",
			"permit2Authorization": map[string]interface{}{
				"from":    "0x111",
				"spender": "0x222",
				// witness present but no facilitator field
				"witness": map[string]interface{}{
					"to": "0x333",
				},
			},
		},
	}
	_, err := s.Settle(context.Background(), payload, types.PaymentRequirements{}, nil)
	if err == nil {
		t.Fatal("expected error for non-upto payload")
	}
	var serr *x402.SettleError
	if !errors.As(err, &serr) {
		t.Fatalf("expected SettleError, got %T: %v", err, err)
	}
	if serr.ErrorReason != ErrUptoInvalidPayload {
		t.Errorf("expected %q, got %q", ErrUptoInvalidPayload, serr.ErrorReason)
	}
}

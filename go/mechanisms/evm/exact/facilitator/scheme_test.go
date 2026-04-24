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

// mockExactFacilitatorSigner is a minimal stub satisfying evm.FacilitatorEvmSigner.
type mockExactFacilitatorSigner struct {
	addresses []string
}

func (m *mockExactFacilitatorSigner) GetAddresses() []string { return m.addresses }

func (m *mockExactFacilitatorSigner) ReadContract(_ context.Context, _ string, _ []byte, _ string, _ ...interface{}) (interface{}, error) {
	return nil, nil
}

func (m *mockExactFacilitatorSigner) VerifyTypedData(_ context.Context, _ string, _ evm.TypedDataDomain, _ map[string][]evm.TypedDataField, _ string, _ map[string]interface{}, _ []byte) (bool, error) {
	return false, nil
}

func (m *mockExactFacilitatorSigner) WriteContract(_ context.Context, _ string, _ []byte, _ string, _ ...interface{}) (string, error) {
	return "", nil
}

func (m *mockExactFacilitatorSigner) SendTransaction(_ context.Context, _ string, _ []byte) (string, error) {
	return "", nil
}

func (m *mockExactFacilitatorSigner) WaitForTransactionReceipt(_ context.Context, _ string) (*evm.TransactionReceipt, error) {
	return nil, nil
}

func (m *mockExactFacilitatorSigner) GetBalance(_ context.Context, _ string, _ string) (*big.Int, error) {
	return big.NewInt(0), nil
}

func (m *mockExactFacilitatorSigner) GetChainID(_ context.Context) (*big.Int, error) {
	return big.NewInt(8453), nil
}

func (m *mockExactFacilitatorSigner) GetCode(_ context.Context, _ string) ([]byte, error) {
	return nil, nil
}

// ---------------------------------------------------------------------------
// NewExactEvmScheme
// ---------------------------------------------------------------------------

func TestNewExactEvmScheme_NilConfig(t *testing.T) {
	signer := &mockExactFacilitatorSigner{addresses: []string{"0xABCD"}}
	s := NewExactEvmScheme(signer, nil)
	if s == nil {
		t.Fatal("expected non-nil scheme")
	}
	// nil config → zero-value ExactEvmSchemeConfig
	if s.config.DeployERC4337WithEIP6492 {
		t.Error("DeployERC4337WithEIP6492 should default to false")
	}
	if s.config.SimulateInSettle {
		t.Error("SimulateInSettle should default to false")
	}
}

func TestNewExactEvmScheme_NonNilConfig(t *testing.T) {
	signer := &mockExactFacilitatorSigner{}
	cfg := &ExactEvmSchemeConfig{
		DeployERC4337WithEIP6492: true,
		SimulateInSettle:         true,
	}
	s := NewExactEvmScheme(signer, cfg)
	if !s.config.DeployERC4337WithEIP6492 {
		t.Error("DeployERC4337WithEIP6492 should be true")
	}
	if !s.config.SimulateInSettle {
		t.Error("SimulateInSettle should be true")
	}
}

func TestNewExactEvmScheme_ConfigIsCopied(t *testing.T) {
	signer := &mockExactFacilitatorSigner{}
	cfg := &ExactEvmSchemeConfig{SimulateInSettle: true}
	s := NewExactEvmScheme(signer, cfg)
	// Mutating original struct must not affect scheme config.
	cfg.SimulateInSettle = false
	if !s.config.SimulateInSettle {
		t.Error("scheme config should be a copy, not a pointer")
	}
}

// ---------------------------------------------------------------------------
// Scheme / CaipFamily / GetExtra / GetSigners
// ---------------------------------------------------------------------------

func TestExactEvmScheme_Scheme(t *testing.T) {
	s := NewExactEvmScheme(&mockExactFacilitatorSigner{}, nil)
	if got := s.Scheme(); got != evm.SchemeExact {
		t.Errorf("expected %q, got %q", evm.SchemeExact, got)
	}
}

func TestExactEvmScheme_CaipFamily(t *testing.T) {
	s := NewExactEvmScheme(&mockExactFacilitatorSigner{}, nil)
	if got := s.CaipFamily(); got != "eip155:*" {
		t.Errorf("expected %q, got %q", "eip155:*", got)
	}
}

func TestExactEvmScheme_GetExtra_ReturnsNil(t *testing.T) {
	s := NewExactEvmScheme(&mockExactFacilitatorSigner{}, nil)
	extra := s.GetExtra(x402.Network("eip155:8453"))
	if extra != nil {
		t.Errorf("expected nil extra, got %v", extra)
	}
}

func TestExactEvmScheme_GetSigners_ReturnsSignerAddresses(t *testing.T) {
	addrs := []string{"0xAAA", "0xBBB"}
	s := NewExactEvmScheme(&mockExactFacilitatorSigner{addresses: addrs}, nil)
	got := s.GetSigners(x402.Network("eip155:8453"))
	if len(got) != 2 || got[0] != addrs[0] || got[1] != addrs[1] {
		t.Errorf("expected %v, got %v", addrs, got)
	}
}

func TestExactEvmScheme_GetSigners_EmptyWhenNoAddresses(t *testing.T) {
	s := NewExactEvmScheme(&mockExactFacilitatorSigner{addresses: nil}, nil)
	got := s.GetSigners(x402.Network("eip155:1"))
	if len(got) != 0 {
		t.Errorf("expected empty slice, got %v", got)
	}
}

// ---------------------------------------------------------------------------
// Verify routing
// ---------------------------------------------------------------------------

func TestExactEvmScheme_Verify_MalformedPermit2Payload(t *testing.T) {
	// payload.Payload has "permit2Authorization" key → IsPermit2Payload returns true,
	// but the value is not a map → Permit2PayloadFromMap returns an error.
	s := NewExactEvmScheme(&mockExactFacilitatorSigner{}, nil)
	payload := types.PaymentPayload{
		X402Version: 2,
		Payload: map[string]interface{}{
			"permit2Authorization": "not-a-map",
		},
	}
	req := types.PaymentRequirements{
		Scheme:  evm.SchemeExact,
		Network: "eip155:8453",
	}
	_, err := s.Verify(context.Background(), payload, req, nil)
	if err == nil {
		t.Fatal("expected error for malformed Permit2 payload")
	}
	// Error should carry ErrInvalidPayload code.
	var verr *x402.VerifyError
	if !errors.As(err, &verr) {
		t.Fatalf("expected VerifyError, got %T: %v", err, err)
	}
	if verr.InvalidReason != ErrInvalidPayload {
		t.Errorf("expected error code %q, got %q", ErrInvalidPayload, verr.InvalidReason)
	}
}

func TestExactEvmScheme_Verify_NonPermit2RoutesToEIP3009_FailsOnBadNetwork(t *testing.T) {
	// payload.Payload has no "permit2Authorization" → not Permit2 → routes to verifyEIP3009.
	// verifyEIP3009 will fail because the network "eip155:99999" has no RPC config.
	s := NewExactEvmScheme(&mockExactFacilitatorSigner{}, nil)
	payload := types.PaymentPayload{
		X402Version: 2,
		Payload: map[string]interface{}{
			"authorization": map[string]interface{}{},
		},
	}
	req := types.PaymentRequirements{
		Scheme:  evm.SchemeExact,
		Network: "eip155:99999",
	}
	_, err := s.Verify(context.Background(), payload, req, nil)
	if err == nil {
		t.Fatal("expected error when network has no config")
	}
}

// ---------------------------------------------------------------------------
// Settle routing
// ---------------------------------------------------------------------------

func TestExactEvmScheme_Settle_MalformedPermit2Payload(t *testing.T) {
	s := NewExactEvmScheme(&mockExactFacilitatorSigner{}, nil)
	payload := types.PaymentPayload{
		X402Version: 2,
		Accepted: types.PaymentRequirements{
			Scheme:  evm.SchemeExact,
			Network: "eip155:8453",
		},
		Payload: map[string]interface{}{
			"permit2Authorization": 42, // wrong type
		},
	}
	req := types.PaymentRequirements{
		Scheme:  evm.SchemeExact,
		Network: "eip155:8453",
	}
	_, err := s.Settle(context.Background(), payload, req, nil)
	if err == nil {
		t.Fatal("expected error for malformed Permit2 payload")
	}
	var serr *x402.SettleError
	if !errors.As(err, &serr) {
		t.Fatalf("expected SettleError, got %T: %v", err, err)
	}
	if serr.ErrorReason != ErrInvalidPayload {
		t.Errorf("expected error code %q, got %q", ErrInvalidPayload, serr.ErrorReason)
	}
}

func TestExactEvmScheme_Settle_NonPermit2RoutesToEIP3009_FailsOnBadNetwork(t *testing.T) {
	s := NewExactEvmScheme(&mockExactFacilitatorSigner{}, nil)
	payload := types.PaymentPayload{
		X402Version: 2,
		Accepted: types.PaymentRequirements{
			Scheme:  evm.SchemeExact,
			Network: "eip155:99999",
		},
		Payload: map[string]interface{}{
			"authorization": map[string]interface{}{},
		},
	}
	req := types.PaymentRequirements{
		Scheme:  evm.SchemeExact,
		Network: "eip155:99999",
	}
	_, err := s.Settle(context.Background(), payload, req, nil)
	if err == nil {
		t.Fatal("expected error when network has no RPC config")
	}
}

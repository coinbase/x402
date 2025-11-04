package x402

import (
	"context"
	"errors"
	"testing"
)

// Mock facilitator for testing
type mockSchemeNetworkFacilitator struct {
	scheme string
	verify func(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (VerifyResponse, error)
	settle func(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (SettleResponse, error)
}

func (m *mockSchemeNetworkFacilitator) Scheme() string {
	return m.scheme
}

func (m *mockSchemeNetworkFacilitator) Verify(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (VerifyResponse, error) {
	if m.verify != nil {
		return m.verify(ctx, payload, requirements)
	}
	return VerifyResponse{
		IsValid: true,
		Payer:   "0xmockpayer",
	}, nil
}

func (m *mockSchemeNetworkFacilitator) Settle(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (SettleResponse, error) {
	if m.settle != nil {
		return m.settle(ctx, payload, requirements)
	}
	return SettleResponse{
		Success:     true,
		Transaction: "0xmocktx",
		Payer:       "0xmockpayer",
		Network:     payload.Accepted.Network,
	}, nil
}

func TestNewx402Facilitator(t *testing.T) {
	facilitator := Newx402Facilitator()
	if facilitator == nil {
		t.Fatal("Expected facilitator to be created")
	}
	if facilitator.schemes == nil {
		t.Fatal("Expected schemes map to be initialized")
	}
	if facilitator.extensions == nil {
		t.Fatal("Expected extensions slice to be initialized")
	}
}

func TestFacilitatorRegisterScheme(t *testing.T) {
	facilitator := Newx402Facilitator()
	mockFacilitator := &mockSchemeNetworkFacilitator{scheme: "exact"}

	// Test v2 registration
	facilitator.RegisterScheme("eip155:1", mockFacilitator)

	if len(facilitator.schemes) != 1 {
		t.Fatalf("Expected 1 version, got %d", len(facilitator.schemes))
	}
	if len(facilitator.schemes[2]) != 1 {
		t.Fatal("Expected 1 network for v2")
	}
	if facilitator.schemes[2]["eip155:1"]["exact"] != mockFacilitator {
		t.Fatal("Expected mock facilitator to be registered")
	}

	// Test v1 registration
	facilitator.RegisterSchemeV1("eip155:1", mockFacilitator)
	if len(facilitator.schemes) != 2 {
		t.Fatalf("Expected 2 versions, got %d", len(facilitator.schemes))
	}
	if facilitator.schemes[1]["eip155:1"]["exact"] != mockFacilitator {
		t.Fatal("Expected mock facilitator to be registered for v1")
	}
}

func TestFacilitatorRegisterExtension(t *testing.T) {
	facilitator := Newx402Facilitator()

	facilitator.RegisterExtension("bazaar")
	if len(facilitator.extensions) != 1 {
		t.Fatal("Expected 1 extension")
	}
	if facilitator.extensions[0] != "bazaar" {
		t.Fatal("Expected 'bazaar' extension")
	}

	// Test duplicate registration (should not add twice)
	facilitator.RegisterExtension("bazaar")
	if len(facilitator.extensions) != 1 {
		t.Fatal("Expected extension to not be duplicated")
	}

	facilitator.RegisterExtension("sign_in_with_x")
	if len(facilitator.extensions) != 2 {
		t.Fatal("Expected 2 extensions")
	}
}

func TestFacilitatorVerify(t *testing.T) {
	ctx := context.Background()
	facilitator := Newx402Facilitator()

	mockFacilitator := &mockSchemeNetworkFacilitator{
		scheme: "exact",
		verify: func(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (VerifyResponse, error) {
			if payload.Accepted.Scheme != requirements.Scheme {
				return VerifyResponse{
					IsValid:       false,
					InvalidReason: "scheme mismatch",
				}, nil
			}
			return VerifyResponse{
				IsValid: true,
				Payer:   "0xverifiedpayer",
			}, nil
		},
	}

	facilitator.RegisterScheme("eip155:1", mockFacilitator)

	requirements := PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:1",
		Asset:   "USDC",
		Amount:  "1000000",
		PayTo:   "0xrecipient",
	}

	payload := PaymentPayload{
		X402Version: 2,
		Accepted:    requirements,
		Payload: map[string]interface{}{
			"signature": "test",
		},
	}

	response, err := facilitator.Verify(ctx, payload, requirements)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if !response.IsValid {
		t.Fatal("Expected valid verification")
	}
	if response.Payer != "0xverifiedpayer" {
		t.Fatalf("Expected payer '0xverifiedpayer', got %s", response.Payer)
	}
}

func TestFacilitatorVerifyValidation(t *testing.T) {
	ctx := context.Background()
	facilitator := Newx402Facilitator()
	mockFacilitator := &mockSchemeNetworkFacilitator{scheme: "exact"}
	facilitator.RegisterScheme("eip155:1", mockFacilitator)

	requirements := PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:1",
		Asset:   "USDC",
		Amount:  "1000000",
		PayTo:   "0xrecipient",
	}

	// Test invalid payload (missing scheme in accepted)
	invalidRequirements := PaymentRequirements{
		Network: "eip155:1",
		Asset:   "USDC",
		Amount:  "1000000",
		PayTo:   "0xrecipient",
	}

	invalidPayload := PaymentPayload{
		X402Version: 2,
		Accepted:    invalidRequirements,
		Payload:     map[string]interface{}{},
	}

	response, err := facilitator.Verify(ctx, invalidPayload, requirements)
	if err == nil {
		t.Fatal("Expected error for invalid payload")
	}
	if response.IsValid {
		t.Fatal("Expected invalid response")
	}

	// Test invalid requirements
	invalidReqs := PaymentRequirements{
		Network: "eip155:1",
		Asset:   "USDC",
		Amount:  "1000000",
		PayTo:   "0xrecipient",
	}

	validPayload := PaymentPayload{
		X402Version: 2,
		Accepted:    requirements,
		Payload:     map[string]interface{}{},
	}

	response, err = facilitator.Verify(ctx, validPayload, invalidReqs)
	if err == nil {
		t.Fatal("Expected error for invalid requirements")
	}
	if response.IsValid {
		t.Fatal("Expected invalid response")
	}
}

func TestFacilitatorVerifySchemeMismatch(t *testing.T) {
	ctx := context.Background()
	facilitator := Newx402Facilitator()
	mockFacilitator := &mockSchemeNetworkFacilitator{scheme: "exact"}
	facilitator.RegisterScheme("eip155:1", mockFacilitator)

	requirements := PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:1",
		Asset:   "USDC",
		Amount:  "1000000",
		PayTo:   "0xrecipient",
	}

	mismatchedRequirements := PaymentRequirements{
		Scheme:  "transfer", // Different scheme
		Network: "eip155:1",
		Asset:   "USDC",
		Amount:  "1000000",
		PayTo:   "0xrecipient",
	}

	payload := PaymentPayload{
		X402Version: 2,
		Accepted:    mismatchedRequirements,
		Payload:     map[string]interface{}{},
	}

	response, err := facilitator.Verify(ctx, payload, requirements)
	if err == nil {
		t.Fatal("Expected error for scheme mismatch")
	}

	var paymentErr *PaymentError
	if !errors.As(err, &paymentErr) || paymentErr.Code != ErrCodeSchemeMismatch {
		t.Fatal("Expected SchemeMismatch error")
	}
	if response.IsValid {
		t.Fatal("Expected invalid response")
	}
}

func TestFacilitatorVerifyNetworkMismatch(t *testing.T) {
	ctx := context.Background()
	facilitator := Newx402Facilitator()
	mockFacilitator := &mockSchemeNetworkFacilitator{scheme: "exact"}
	facilitator.RegisterScheme("eip155:1", mockFacilitator)

	requirements := PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:1",
		Asset:   "USDC",
		Amount:  "1000000",
		PayTo:   "0xrecipient",
	}

	mismatchedNetworkRequirements := PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:8453", // Different network
		Asset:   "USDC",
		Amount:  "1000000",
		PayTo:   "0xrecipient",
	}

	payload := PaymentPayload{
		X402Version: 2,
		Accepted:    mismatchedNetworkRequirements,
		Payload:     map[string]interface{}{},
	}

	response, err := facilitator.Verify(ctx, payload, requirements)
	if err == nil {
		t.Fatal("Expected error for network mismatch")
	}

	var paymentErr *PaymentError
	if !errors.As(err, &paymentErr) || paymentErr.Code != ErrCodeNetworkMismatch {
		t.Fatal("Expected NetworkMismatch error")
	}
	if response.IsValid {
		t.Fatal("Expected invalid response")
	}
}

func TestFacilitatorSettle(t *testing.T) {
	ctx := context.Background()
	facilitator := Newx402Facilitator()

	mockFacilitator := &mockSchemeNetworkFacilitator{
		scheme: "exact",
		settle: func(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (SettleResponse, error) {
			return SettleResponse{
				Success:     true,
				Transaction: "0xsettledtx",
				Payer:       "0xpayer",
				Network:     payload.Accepted.Network,
			}, nil
		},
	}

	facilitator.RegisterScheme("eip155:1", mockFacilitator)

	requirements := PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:1",
		Asset:   "USDC",
		Amount:  "1000000",
		PayTo:   "0xrecipient",
	}

	payload := PaymentPayload{
		X402Version: 2,
		Accepted:    requirements,
		Payload: map[string]interface{}{
			"signature": "test",
		},
	}

	response, err := facilitator.Settle(ctx, payload, requirements)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if !response.Success {
		t.Fatal("Expected successful settlement")
	}
	if response.Transaction != "0xsettledtx" {
		t.Fatalf("Expected transaction '0xsettledtx', got %s", response.Transaction)
	}
}

func TestFacilitatorSettleVerifiesFirst(t *testing.T) {
	ctx := context.Background()
	facilitator := Newx402Facilitator()

	verifyCallCount := 0
	mockFacilitator := &mockSchemeNetworkFacilitator{
		scheme: "exact",
		verify: func(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (VerifyResponse, error) {
			verifyCallCount++
			return VerifyResponse{
				IsValid:       false,
				InvalidReason: "invalid signature",
			}, nil
		},
	}

	facilitator.RegisterScheme("eip155:1", mockFacilitator)

	requirements := PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:1",
		Asset:   "USDC",
		Amount:  "1000000",
		PayTo:   "0xrecipient",
	}

	payload := PaymentPayload{
		X402Version: 2,
		Accepted:    requirements,
		Payload:     map[string]interface{}{},
	}

	response, err := facilitator.Settle(ctx, payload, requirements)
	if err == nil {
		t.Fatal("Expected error for invalid payment")
	}
	if response.Success {
		t.Fatal("Expected failed settlement")
	}
	if verifyCallCount != 1 {
		t.Fatal("Expected verify to be called before settle")
	}
}

func TestFacilitatorGetSupported(t *testing.T) {
	facilitator := Newx402Facilitator()

	mockFacilitator1 := &mockSchemeNetworkFacilitator{scheme: "exact"}
	mockFacilitator2 := &mockSchemeNetworkFacilitator{scheme: "transfer"}

	facilitator.RegisterScheme("eip155:1", mockFacilitator1)
	facilitator.RegisterScheme("eip155:8453", mockFacilitator2)
	facilitator.RegisterSchemeV1("eip155:1", mockFacilitator1)
	facilitator.RegisterExtension("bazaar")

	supported := facilitator.GetSupported()

	if len(supported.Kinds) != 3 {
		t.Fatalf("Expected 3 supported kinds, got %d", len(supported.Kinds))
	}
	if len(supported.Extensions) != 1 {
		t.Fatalf("Expected 1 extension, got %d", len(supported.Extensions))
	}
	if supported.Extensions[0] != "bazaar" {
		t.Fatal("Expected 'bazaar' extension")
	}

	// Verify each kind
	foundV2Exact := false
	foundV2Transfer := false
	foundV1Exact := false

	for _, kind := range supported.Kinds {
		if kind.X402Version == 2 && kind.Scheme == "exact" && kind.Network == "eip155:1" {
			foundV2Exact = true
		}
		if kind.X402Version == 2 && kind.Scheme == "transfer" && kind.Network == "eip155:8453" {
			foundV2Transfer = true
		}
		if kind.X402Version == 1 && kind.Scheme == "exact" && kind.Network == "eip155:1" {
			foundV1Exact = true
		}
	}

	if !foundV2Exact || !foundV2Transfer || !foundV1Exact {
		t.Fatal("Expected all registered schemes to be in supported kinds")
	}
}

func TestFacilitatorCanHandle(t *testing.T) {
	facilitator := Newx402Facilitator()
	mockFacilitator := &mockSchemeNetworkFacilitator{scheme: "exact"}
	facilitator.RegisterScheme("eip155:1", mockFacilitator)

	if !facilitator.CanHandle(2, "eip155:1", "exact") {
		t.Fatal("Expected facilitator to handle registered scheme")
	}

	if facilitator.CanHandle(2, "eip155:1", "transfer") {
		t.Fatal("Expected facilitator to not handle unregistered scheme")
	}

	if facilitator.CanHandle(1, "eip155:1", "exact") {
		t.Fatal("Expected facilitator to not handle unregistered version")
	}
}

func TestLocalFacilitatorClient(t *testing.T) {
	ctx := context.Background()
	facilitator := Newx402Facilitator()
	mockFacilitator := &mockSchemeNetworkFacilitator{scheme: "exact"}
	facilitator.RegisterScheme("eip155:1", mockFacilitator)

	client := NewLocalFacilitatorClient(facilitator)
	if client.identifier != "local" {
		t.Fatal("Expected 'local' identifier")
	}

	// Test Verify
	requirements := PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:1",
		Asset:   "USDC",
		Amount:  "1000000",
		PayTo:   "0xrecipient",
	}

	payload := PaymentPayload{
		X402Version: 2,
		Accepted:    requirements,
		Payload:     map[string]interface{}{},
	}

	verifyResp, err := client.Verify(ctx, payload, requirements)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if !verifyResp.IsValid {
		t.Fatal("Expected valid verification")
	}

	// Test Settle
	settleResp, err := client.Settle(ctx, payload, requirements)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if !settleResp.Success {
		t.Fatal("Expected successful settlement")
	}

	// Test GetSupported
	supportedResp, err := client.GetSupported(ctx)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if len(supportedResp.Kinds) != 1 {
		t.Fatal("Expected 1 supported kind")
	}
}

func TestFacilitatorNetworkPatternMatching(t *testing.T) {
	ctx := context.Background()
	facilitator := Newx402Facilitator()
	mockFacilitator := &mockSchemeNetworkFacilitator{scheme: "exact"}

	// Register with wildcard
	facilitator.RegisterScheme("eip155:*", mockFacilitator)

	requirements := PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:8453",
		Asset:   "USDC",
		Amount:  "1000000",
		PayTo:   "0xrecipient",
	}

	payload := PaymentPayload{
		X402Version: 2,
		Accepted:    requirements,
		Payload:     map[string]interface{}{},
	}

	// Should match the wildcard pattern
	response, err := facilitator.Verify(ctx, payload, requirements)
	if err != nil {
		t.Fatalf("Expected pattern match to work: %v", err)
	}
	if !response.IsValid {
		t.Fatal("Expected valid verification with pattern match")
	}
}

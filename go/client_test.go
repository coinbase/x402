package x402

import (
	"context"
	"errors"
	"testing"
)

// Mock client for testing
type mockSchemeNetworkClient struct {
	scheme        string
	createPayload func(ctx context.Context, version int, requirements PaymentRequirements) (PartialPaymentPayload, error)
	version       int
}

func (m *mockSchemeNetworkClient) Scheme() string {
	return m.scheme
}

func (m *mockSchemeNetworkClient) CreatePaymentPayload(ctx context.Context, version int, requirements PaymentRequirements) (PartialPaymentPayload, error) {
	if m.createPayload != nil {
		return m.createPayload(ctx, version, requirements)
	}
	return PartialPaymentPayload{
		X402Version: version,
		Payload: map[string]interface{}{
			"signature": "mock_signature",
			"from":      "0xmock",
		},
	}, nil
}

func TestNewx402Client(t *testing.T) {
	client := Newx402Client()
	if client == nil {
		t.Fatal("Expected client to be created")
	}
	if client.schemes == nil {
		t.Fatal("Expected schemes map to be initialized")
	}
	if client.requirementsSelector == nil {
		t.Fatal("Expected default selector to be set")
	}
}

func TestClientRegisterScheme(t *testing.T) {
	client := Newx402Client()
	mockClient := &mockSchemeNetworkClient{scheme: "exact"}

	// Test v2 registration
	client.RegisterScheme("eip155:1", mockClient)

	if len(client.schemes) != 1 {
		t.Fatalf("Expected 1 version, got %d", len(client.schemes))
	}
	if len(client.schemes[2]) != 1 {
		t.Fatal("Expected 1 network for v2")
	}
	if client.schemes[2]["eip155:1"]["exact"] != mockClient {
		t.Fatal("Expected mock client to be registered")
	}

	// Test v1 registration
	client.RegisterSchemeV1("eip155:1", mockClient)
	if len(client.schemes) != 2 {
		t.Fatalf("Expected 2 versions, got %d", len(client.schemes))
	}
	if client.schemes[1]["eip155:1"]["exact"] != mockClient {
		t.Fatal("Expected mock client to be registered for v1")
	}
}

func TestClientWithScheme(t *testing.T) {
	mockClient := &mockSchemeNetworkClient{scheme: "exact"}

	client := Newx402Client(
		WithScheme(2, "eip155:1", mockClient),
	)

	if client.schemes[2]["eip155:1"]["exact"] != mockClient {
		t.Fatal("Expected mock client to be registered via option")
	}
}

func TestClientSelectPaymentRequirements(t *testing.T) {
	client := Newx402Client()
	mockClient := &mockSchemeNetworkClient{scheme: "exact"}
	client.RegisterScheme("eip155:1", mockClient)

	requirements := []PaymentRequirements{
		{
			Scheme:  "exact",
			Network: "eip155:1",
			Asset:   "USDC",
			Amount:  "1000000",
			PayTo:   "0xrecipient",
		},
		{
			Scheme:  "unsupported",
			Network: "eip155:1",
			Asset:   "USDC",
			Amount:  "2000000",
			PayTo:   "0xrecipient",
		},
	}

	// Should select the first supported requirement
	selected, err := client.SelectPaymentRequirements(2, requirements)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if selected.Scheme != "exact" {
		t.Fatalf("Expected 'exact' scheme, got %s", selected.Scheme)
	}
	if selected.Amount != "1000000" {
		t.Fatalf("Expected amount '1000000', got %s", selected.Amount)
	}

	// Test with no supported requirements
	unsupportedReqs := []PaymentRequirements{
		{
			Scheme:  "unsupported",
			Network: "eip155:1",
			Asset:   "USDC",
			Amount:  "1000000",
			PayTo:   "0xrecipient",
		},
	}

	_, err = client.SelectPaymentRequirements(2, unsupportedReqs)
	if err == nil {
		t.Fatal("Expected error for unsupported requirements")
	}

	var paymentErr *PaymentError
	if !errors.As(err, &paymentErr) || paymentErr.Code != ErrCodeUnsupportedScheme {
		t.Fatal("Expected UnsupportedScheme error")
	}
}

func TestClientSelectPaymentRequirementsWithCustomSelector(t *testing.T) {
	// Custom selector that chooses the highest amount
	customSelector := func(version int, requirements []PaymentRequirements) PaymentRequirements {
		if len(requirements) == 0 {
			panic("no requirements")
		}
		highest := requirements[0]
		for _, req := range requirements[1:] {
			if req.Amount > highest.Amount {
				highest = req
			}
		}
		return highest
	}

	client := Newx402Client(WithPaymentSelector(customSelector))
	mockClient := &mockSchemeNetworkClient{scheme: "exact"}
	client.RegisterScheme("eip155:1", mockClient)

	requirements := []PaymentRequirements{
		{
			Scheme:  "exact",
			Network: "eip155:1",
			Asset:   "USDC",
			Amount:  "1000000",
			PayTo:   "0xrecipient",
		},
		{
			Scheme:  "exact",
			Network: "eip155:1",
			Asset:   "USDC",
			Amount:  "2000000",
			PayTo:   "0xrecipient",
		},
	}

	selected, err := client.SelectPaymentRequirements(2, requirements)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if selected.Amount != "2000000" {
		t.Fatalf("Expected amount '2000000', got %s", selected.Amount)
	}
}

func TestClientCreatePaymentPayload(t *testing.T) {
	ctx := context.Background()
	client := Newx402Client()

	mockClient := &mockSchemeNetworkClient{
		scheme:  "exact",
		version: 2,
		createPayload: func(ctx context.Context, version int, requirements PaymentRequirements) (PartialPaymentPayload, error) {
			return PartialPaymentPayload{
				X402Version: version,
				Payload: map[string]interface{}{
					"signature": "test_sig",
					"from":      "0xsender",
				},
			}, nil
		},
	}

	client.RegisterScheme("eip155:1", mockClient)

	requirements := PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:1",
		Asset:   "USDC",
		Amount:  "1000000",
		PayTo:   "0xrecipient",
	}

	resource := &ResourceInfo{
		URL:         "https://example.com/api",
		Description: "Test API",
		MimeType:    "application/json",
	}

	extensions := map[string]interface{}{
		"test": "value",
	}

	payload, err := client.CreatePaymentPayload(ctx, 2, requirements, resource, extensions)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if payload.X402Version != 2 {
		t.Fatalf("Expected version 2, got %d", payload.X402Version)
	}
	if payload.Accepted.Scheme != "exact" {
		t.Fatalf("Expected accepted scheme 'exact', got %s", payload.Accepted.Scheme)
	}
	if payload.Accepted.Network != "eip155:1" {
		t.Fatalf("Expected accepted network 'eip155:1', got %s", payload.Accepted.Network)
	}
	if payload.Payload == nil {
		t.Fatal("Expected payload to be set")
	}
	if payload.Resource == nil {
		t.Fatal("Expected resource to be set")
	}
	if payload.Extensions == nil {
		t.Fatal("Expected extensions to be set")
	}
}

func TestClientCreatePaymentPayloadValidation(t *testing.T) {
	ctx := context.Background()
	client := Newx402Client()

	// Test with invalid requirements (missing scheme)
	invalidReqs := PaymentRequirements{
		Network: "eip155:1",
		Asset:   "USDC",
		Amount:  "1000000",
		PayTo:   "0xrecipient",
	}

	_, err := client.CreatePaymentPayload(ctx, 2, invalidReqs, nil, nil)
	if err == nil {
		t.Fatal("Expected error for invalid requirements")
	}
}

func TestClientCreatePaymentPayloadNoScheme(t *testing.T) {
	ctx := context.Background()
	client := Newx402Client()

	// Register a different scheme so we get past the version check
	mockClient := &mockSchemeNetworkClient{scheme: "different", version: 2}
	client.RegisterScheme("eip155:1", mockClient)

	requirements := PaymentRequirements{
		Scheme:  "unregistered",
		Network: "eip155:1",
		Asset:   "USDC",
		Amount:  "1000000",
		PayTo:   "0xrecipient",
	}

	_, err := client.CreatePaymentPayload(ctx, 2, requirements, nil, nil)
	if err == nil {
		t.Fatal("Expected error for unregistered scheme")
	}

	var paymentErr *PaymentError
	if !errors.As(err, &paymentErr) {
		t.Fatalf("Expected PaymentError, got: %v (%T)", err, err)
	}
	if paymentErr.Code != ErrCodeUnsupportedScheme {
		t.Fatalf("Expected UnsupportedScheme error code, got: %s", paymentErr.Code)
	}
}

func TestClientGetRegisteredSchemes(t *testing.T) {
	client := Newx402Client()
	mockClient1 := &mockSchemeNetworkClient{scheme: "exact"}
	mockClient2 := &mockSchemeNetworkClient{scheme: "transfer"}

	client.RegisterScheme("eip155:1", mockClient1)
	client.RegisterScheme("eip155:8453", mockClient2)
	client.RegisterSchemeV1("eip155:1", mockClient1)

	schemes := client.GetRegisteredSchemes()
	if len(schemes) != 2 {
		t.Fatalf("Expected 2 versions, got %d", len(schemes))
	}
	if len(schemes[2]) != 2 {
		t.Fatalf("Expected 2 schemes for v2, got %d", len(schemes[2]))
	}
	if len(schemes[1]) != 1 {
		t.Fatalf("Expected 1 scheme for v1, got %d", len(schemes[1]))
	}
}

func TestClientCanPay(t *testing.T) {
	client := Newx402Client()
	mockClient := &mockSchemeNetworkClient{scheme: "exact"}
	client.RegisterScheme("eip155:1", mockClient)

	requirements := []PaymentRequirements{
		{
			Scheme:  "exact",
			Network: "eip155:1",
			Asset:   "USDC",
			Amount:  "1000000",
			PayTo:   "0xrecipient",
		},
	}

	if !client.CanPay(2, requirements) {
		t.Fatal("Expected client to be able to pay")
	}

	unsupportedReqs := []PaymentRequirements{
		{
			Scheme:  "unsupported",
			Network: "eip155:1",
			Asset:   "USDC",
			Amount:  "1000000",
			PayTo:   "0xrecipient",
		},
	}

	if client.CanPay(2, unsupportedReqs) {
		t.Fatal("Expected client to not be able to pay unsupported requirements")
	}
}

func TestClientCreatePaymentForRequired(t *testing.T) {
	ctx := context.Background()
	client := Newx402Client()
	mockClient := &mockSchemeNetworkClient{scheme: "exact"}
	client.RegisterScheme("eip155:1", mockClient)

	required := PaymentRequired{
		X402Version: 2,
		Error:       "Payment required",
		Resource: &ResourceInfo{
			URL:         "https://example.com/api",
			Description: "Test API",
			MimeType:    "application/json",
		},
		Accepts: []PaymentRequirements{
			{
				Scheme:  "exact",
				Network: "eip155:1",
				Asset:   "USDC",
				Amount:  "1000000",
				PayTo:   "0xrecipient",
			},
		},
		Extensions: map[string]interface{}{
			"test": "value",
		},
	}

	payload, err := client.CreatePaymentForRequired(ctx, required)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if payload.X402Version != 2 {
		t.Fatalf("Expected version 2, got %d", payload.X402Version)
	}
	if payload.Accepted.Scheme != "exact" {
		t.Fatalf("Expected accepted scheme 'exact', got %s", payload.Accepted.Scheme)
	}
	if payload.Resource == nil {
		t.Fatal("Expected resource to be set from PaymentRequired")
	}
	if payload.Extensions == nil {
		t.Fatal("Expected extensions to be set from PaymentRequired")
	}
}

func TestClientNetworkPatternMatching(t *testing.T) {
	client := Newx402Client()
	mockClient := &mockSchemeNetworkClient{scheme: "exact", version: 2}

	// Register with wildcard
	client.RegisterScheme("eip155:*", mockClient)

	requirements := PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:8453", // Specific network
		Asset:   "USDC",
		Amount:  "1000000",
		PayTo:   "0xrecipient",
	}

	// Should match the wildcard pattern
	ctx := context.Background()
	payload, err := client.CreatePaymentPayload(ctx, 2, requirements, nil, nil)
	if err != nil {
		t.Fatalf("Expected pattern match to work: %v", err)
	}
	if payload.Accepted.Scheme != "exact" {
		t.Fatal("Expected payload to be created with pattern match")
	}
}

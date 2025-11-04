package x402

import (
	"context"
	"errors"
	"testing"
	"time"
)

// Mock service for testing
type mockSchemeNetworkService struct {
	scheme      string
	parsePrice  func(price Price, network Network) (AssetAmount, error)
	enhanceReqs func(ctx context.Context, base PaymentRequirements, supported SupportedKind, extensions []string) (PaymentRequirements, error)
}

func (m *mockSchemeNetworkService) Scheme() string {
	return m.scheme
}

func (m *mockSchemeNetworkService) ParsePrice(price Price, network Network) (AssetAmount, error) {
	if m.parsePrice != nil {
		return m.parsePrice(price, network)
	}
	return AssetAmount{
		Asset:  "USDC",
		Amount: "1000000",
		Extra:  map[string]interface{}{},
	}, nil
}

func (m *mockSchemeNetworkService) EnhancePaymentRequirements(ctx context.Context, base PaymentRequirements, supported SupportedKind, extensions []string) (PaymentRequirements, error) {
	if m.enhanceReqs != nil {
		return m.enhanceReqs(ctx, base, supported, extensions)
	}
	enhanced := base
	enhanced.Extra = map[string]interface{}{
		"enhanced": true,
	}
	return enhanced, nil
}

// Mock facilitator client for testing
type mockFacilitatorClient struct {
	identifier string
	verify     func(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (VerifyResponse, error)
	settle     func(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (SettleResponse, error)
	supported  func(ctx context.Context) (SupportedResponse, error)
}

func (m *mockFacilitatorClient) Verify(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (VerifyResponse, error) {
	if m.verify != nil {
		return m.verify(ctx, payload, requirements)
	}
	return VerifyResponse{IsValid: true, Payer: "0xpayer"}, nil
}

func (m *mockFacilitatorClient) Settle(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (SettleResponse, error) {
	if m.settle != nil {
		return m.settle(ctx, payload, requirements)
	}
	return SettleResponse{Success: true, Transaction: "0xtx"}, nil
}

func (m *mockFacilitatorClient) GetSupported(ctx context.Context) (SupportedResponse, error) {
	if m.supported != nil {
		return m.supported(ctx)
	}
	return SupportedResponse{
		Kinds: []SupportedKind{
			{
				X402Version: 2,
				Scheme:      "exact",
				Network:     "eip155:1",
				Extra:       map[string]interface{}{},
			},
		},
		Extensions: []string{},
	}, nil
}

func (m *mockFacilitatorClient) Identifier() string {
	if m.identifier != "" {
		return m.identifier
	}
	return "mock"
}

func TestNewx402ResourceService(t *testing.T) {
	service := Newx402ResourceService()
	if service == nil {
		t.Fatal("Expected service to be created")
	}
	if service.schemes == nil {
		t.Fatal("Expected schemes map to be initialized")
	}
	if service.facilitatorClients == nil {
		t.Fatal("Expected facilitator clients to be initialized")
	}
	if service.supportedCache == nil {
		t.Fatal("Expected cache to be initialized")
	}
}

func TestServiceWithOptions(t *testing.T) {
	mockClient := &mockFacilitatorClient{}
	mockService := &mockSchemeNetworkService{scheme: "exact"}

	service := Newx402ResourceService(
		WithFacilitatorClient(mockClient),
		WithSchemeService("eip155:1", mockService),
		WithCacheTTL(10*time.Minute),
	)

	if len(service.facilitatorClients) != 1 {
		t.Fatal("Expected 1 facilitator client")
	}
	if service.schemes["eip155:1"]["exact"] != mockService {
		t.Fatal("Expected scheme service to be registered")
	}
	if service.supportedCache.ttl != 10*time.Minute {
		t.Fatal("Expected cache TTL to be set")
	}
}

func TestServiceInitialize(t *testing.T) {
	ctx := context.Background()
	mockClient := &mockFacilitatorClient{
		supported: func(ctx context.Context) (SupportedResponse, error) {
			return SupportedResponse{
				Kinds: []SupportedKind{
					{
						X402Version: 2,
						Scheme:      "exact",
						Network:     "eip155:1",
					},
					{
						X402Version: 2,
						Scheme:      "transfer",
						Network:     "eip155:8453",
					},
				},
				Extensions: []string{"bazaar"},
			}, nil
		},
	}

	service := Newx402ResourceService(WithFacilitatorClient(mockClient))
	err := service.Initialize(ctx)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	// Check that facilitatorClientsMap was built
	if len(service.facilitatorClientsMap) != 1 {
		t.Fatal("Expected 1 version in map")
	}
	if len(service.facilitatorClientsMap[2]) != 2 {
		t.Fatal("Expected 2 networks for v2")
	}
	if service.facilitatorClientsMap[2]["eip155:1"]["exact"] != mockClient {
		t.Fatal("Expected client to be mapped for exact scheme")
	}
	if service.facilitatorClientsMap[2]["eip155:8453"]["transfer"] != mockClient {
		t.Fatal("Expected client to be mapped for transfer scheme")
	}
}

func TestServiceInitializeWithMultipleFacilitators(t *testing.T) {
	ctx := context.Background()

	// First facilitator supports exact on mainnet
	mockClient1 := &mockFacilitatorClient{
		identifier: "facilitator1",
		supported: func(ctx context.Context) (SupportedResponse, error) {
			return SupportedResponse{
				Kinds: []SupportedKind{
					{
						X402Version: 2,
						Scheme:      "exact",
						Network:     "eip155:1",
					},
				},
			}, nil
		},
	}

	// Second facilitator supports exact on Base (should not override mainnet)
	mockClient2 := &mockFacilitatorClient{
		identifier: "facilitator2",
		supported: func(ctx context.Context) (SupportedResponse, error) {
			return SupportedResponse{
				Kinds: []SupportedKind{
					{
						X402Version: 2,
						Scheme:      "exact",
						Network:     "eip155:1", // Same as first
					},
					{
						X402Version: 2,
						Scheme:      "exact",
						Network:     "eip155:8453", // New network
					},
				},
			}, nil
		},
	}

	service := Newx402ResourceService(
		WithFacilitatorClient(mockClient1),
		WithFacilitatorClient(mockClient2),
	)

	err := service.Initialize(ctx)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	// First facilitator should have precedence for eip155:1
	if service.facilitatorClientsMap[2]["eip155:1"]["exact"] != mockClient1 {
		t.Fatal("Expected first facilitator to have precedence")
	}

	// Second facilitator should handle eip155:8453
	if service.facilitatorClientsMap[2]["eip155:8453"]["exact"] != mockClient2 {
		t.Fatal("Expected second facilitator for new network")
	}
}

func TestServiceBuildPaymentRequirements(t *testing.T) {
	ctx := context.Background()

	mockService := &mockSchemeNetworkService{
		scheme: "exact",
		parsePrice: func(price Price, network Network) (AssetAmount, error) {
			return AssetAmount{
				Asset:  "USDC",
				Amount: "5000000",
				Extra:  map[string]interface{}{"decimals": 6},
			}, nil
		},
	}

	mockClient := &mockFacilitatorClient{}

	service := Newx402ResourceService(
		WithFacilitatorClient(mockClient),
		WithSchemeService("eip155:1", mockService),
	)

	// Initialize to populate supported kinds
	service.Initialize(ctx)

	config := ResourceConfig{
		Scheme:            "exact",
		PayTo:             "0xrecipient",
		Price:             "$5.00",
		Network:           "eip155:1",
		MaxTimeoutSeconds: 600,
	}

	requirements, err := service.BuildPaymentRequirements(ctx, config)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if len(requirements) != 1 {
		t.Fatal("Expected 1 requirement")
	}

	req := requirements[0]
	if req.Scheme != "exact" {
		t.Fatalf("Expected scheme 'exact', got %s", req.Scheme)
	}
	if req.Amount != "5000000" {
		t.Fatalf("Expected amount '5000000', got %s", req.Amount)
	}
	if req.Asset != "USDC" {
		t.Fatalf("Expected asset 'USDC', got %s", req.Asset)
	}
	if req.MaxTimeoutSeconds != 600 {
		t.Fatalf("Expected timeout 600, got %d", req.MaxTimeoutSeconds)
	}
	if req.Extra["enhanced"] != true {
		t.Fatal("Expected requirements to be enhanced")
	}
}

func TestServiceBuildPaymentRequirementsNoScheme(t *testing.T) {
	ctx := context.Background()
	service := Newx402ResourceService()

	config := ResourceConfig{
		Scheme:  "unregistered",
		PayTo:   "0xrecipient",
		Price:   "$5.00",
		Network: "eip155:1",
	}

	_, err := service.BuildPaymentRequirements(ctx, config)
	if err == nil {
		t.Fatal("Expected error for unregistered scheme")
	}

	var paymentErr *PaymentError
	if !errors.As(err, &paymentErr) || paymentErr.Code != ErrCodeUnsupportedScheme {
		t.Fatal("Expected UnsupportedScheme error")
	}
}

func TestServiceCreatePaymentRequiredResponse(t *testing.T) {
	service := Newx402ResourceService()

	requirements := []PaymentRequirements{
		{
			Scheme:  "exact",
			Network: "eip155:1",
			Asset:   "USDC",
			Amount:  "1000000",
			PayTo:   "0xrecipient",
		},
	}

	info := ResourceInfo{
		URL:         "https://api.example.com/resource",
		Description: "Premium API access",
		MimeType:    "application/json",
	}

	response := service.CreatePaymentRequiredResponse(
		requirements,
		info,
		"Custom error message",
		map[string]interface{}{"custom": "extension"},
	)

	if response.X402Version != 2 {
		t.Fatalf("Expected version 2, got %d", response.X402Version)
	}
	if response.Error != "Custom error message" {
		t.Fatalf("Expected custom error, got %s", response.Error)
	}
	if response.Resource.URL != info.URL {
		t.Fatal("Expected resource info to be set")
	}
	if len(response.Accepts) != 1 {
		t.Fatal("Expected 1 requirement")
	}
	if response.Extensions["custom"] != "extension" {
		t.Fatal("Expected custom extension")
	}
}

func TestServiceVerifyPayment(t *testing.T) {
	ctx := context.Background()

	mockClient := &mockFacilitatorClient{
		verify: func(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (VerifyResponse, error) {
			return VerifyResponse{
				IsValid: true,
				Payer:   "0xverifiedpayer",
			}, nil
		},
	}

	service := Newx402ResourceService(WithFacilitatorClient(mockClient))
	service.Initialize(ctx)

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

	response, err := service.VerifyPayment(ctx, payload, requirements)
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

func TestServiceSettlePayment(t *testing.T) {
	ctx := context.Background()

	mockClient := &mockFacilitatorClient{
		settle: func(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (SettleResponse, error) {
			return SettleResponse{
				Success:     true,
				Transaction: "0xsettledtx",
				Payer:       "0xpayer",
			}, nil
		},
	}

	service := Newx402ResourceService(WithFacilitatorClient(mockClient))
	service.Initialize(ctx)

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

	response, err := service.SettlePayment(ctx, payload, requirements)
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

func TestServiceFindMatchingRequirements(t *testing.T) {
	service := Newx402ResourceService()

	available := []PaymentRequirements{
		{
			Scheme:  "exact",
			Network: "eip155:1",
			Asset:   "USDC",
			Amount:  "1000000",
			PayTo:   "0xrecipient1",
		},
		{
			Scheme:  "transfer",
			Network: "eip155:8453",
			Asset:   "USDC",
			Amount:  "2000000",
			PayTo:   "0xrecipient2",
		},
	}

	// Test v2 matching (by accepted)
	payloadV2 := PaymentPayload{
		X402Version: 2,
		Accepted: PaymentRequirements{
			Scheme:  "transfer",
			Network: "eip155:8453",
			Asset:   "USDC",
			Amount:  "2000000",
			PayTo:   "0xrecipient2",
		},
	}

	matched := service.FindMatchingRequirements(available, payloadV2)
	if matched == nil {
		t.Fatal("Expected match for v2")
	}
	if matched.Scheme != "transfer" {
		t.Fatal("Expected transfer scheme to match")
	}

	// Test v1 matching (by scheme/network)
	payloadV1 := PaymentPayload{
		X402Version: 1,
		Accepted: PaymentRequirements{
			Scheme:  "exact",
			Network: "eip155:1",
		},
	}

	matched = service.FindMatchingRequirements(available, payloadV1)
	if matched == nil {
		t.Fatal("Expected match for v1")
	}
	if matched.PayTo != "0xrecipient1" {
		t.Fatal("Expected first requirement to match")
	}

	// Test no match
	payloadNoMatch := PaymentPayload{
		X402Version: 2,
		Accepted: PaymentRequirements{
			Scheme:  "nonexistent",
			Network: "eip155:1",
			Asset:   "USDC",
			Amount:  "3000000",
			PayTo:   "0xrecipient3",
		},
	}

	matched = service.FindMatchingRequirements(available, payloadNoMatch)
	if matched != nil {
		t.Fatal("Expected no match")
	}
}

func TestServiceProcessPaymentRequest(t *testing.T) {
	ctx := context.Background()

	mockService := &mockSchemeNetworkService{scheme: "exact"}
	mockClient := &mockFacilitatorClient{}

	service := Newx402ResourceService(
		WithFacilitatorClient(mockClient),
		WithSchemeService("eip155:1", mockService),
	)
	service.Initialize(ctx)

	config := ResourceConfig{
		Scheme:  "exact",
		PayTo:   "0xrecipient",
		Price:   "$1.00",
		Network: "eip155:1",
	}

	info := ResourceInfo{
		URL:         "https://api.example.com/resource",
		Description: "API resource",
	}

	// Test without payment (should require payment)
	result, err := service.ProcessPaymentRequest(ctx, nil, config, info, nil)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if result.Success {
		t.Fatal("Expected payment to be required")
	}
	if result.RequiresPayment == nil {
		t.Fatal("Expected payment required response")
	}

	// Test with valid payment
	// First, build requirements to see what they actually are
	builtReqs, _ := service.BuildPaymentRequirements(ctx, config)

	payload := &PaymentPayload{
		X402Version: 2,
		Payload:     map[string]interface{}{},
		Accepted:    builtReqs[0], // Use the actual built requirements
	}

	result, err = service.ProcessPaymentRequest(ctx, payload, config, info, nil)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if !result.Success {
		if result.Error != "" {
			t.Fatalf("Expected payment to be verified, got error: %s", result.Error)
		}
		if result.RequiresPayment != nil {
			t.Fatalf("Expected payment to be verified, got payment required: %v", result.RequiresPayment.Error)
		}
		t.Fatal("Expected payment to be verified")
	}
	if result.VerificationResult == nil {
		t.Fatal("Expected verification result")
	}
	if !result.VerificationResult.IsValid {
		t.Fatal("Expected valid verification")
	}
}

func TestSupportedCache(t *testing.T) {
	cache := &SupportedCache{
		data:   make(map[string]SupportedResponse),
		expiry: make(map[string]time.Time),
		ttl:    100 * time.Millisecond,
	}

	response := SupportedResponse{
		Kinds: []SupportedKind{
			{X402Version: 2, Scheme: "exact", Network: "eip155:1"},
		},
	}

	// Set and verify
	cache.Set("test", response)
	if len(cache.data) != 1 {
		t.Fatal("Expected item in cache")
	}

	// Wait for expiry
	time.Sleep(150 * time.Millisecond)

	// Clear cache
	cache.Clear()
	if len(cache.data) != 0 {
		t.Fatal("Expected cache to be cleared")
	}
	if len(cache.expiry) != 0 {
		t.Fatal("Expected expiry map to be cleared")
	}
}

package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	x402 "github.com/coinbase/x402-go/v2"
)

func TestNewHTTPFacilitatorClient(t *testing.T) {
	// Test with default config
	client := NewHTTPFacilitatorClient(nil)
	if client == nil {
		t.Fatal("Expected client to be created")
	}
	if client.url != DefaultFacilitatorURL {
		t.Errorf("Expected default URL %s, got %s", DefaultFacilitatorURL, client.url)
	}
	if client.identifier != DefaultFacilitatorURL {
		t.Errorf("Expected default identifier %s, got %s", DefaultFacilitatorURL, client.identifier)
	}

	// Test with custom config
	config := &FacilitatorConfig{
		URL:        "https://custom.facilitator.com",
		Identifier: "custom",
	}

	client = NewHTTPFacilitatorClient(config)
	if client.url != config.URL {
		t.Errorf("Expected URL %s, got %s", config.URL, client.url)
	}
	if client.identifier != "custom" {
		t.Errorf("Expected identifier 'custom', got %s", client.identifier)
	}
}

func TestHTTPFacilitatorClientVerify(t *testing.T) {
	ctx := context.Background()

	// Create test server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/verify" {
			t.Errorf("Expected path /verify, got %s", r.URL.Path)
		}
		if r.Method != "POST" {
			t.Errorf("Expected POST, got %s", r.Method)
		}

		// Check request body
		var requestBody map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
			t.Fatalf("Failed to decode request: %v", err)
		}

		if requestBody["x402Version"].(float64) != 2 {
			t.Error("Expected version 2 in request")
		}

		// Return success response
		response := x402.VerifyResponse{
			IsValid: true,
			Payer:   "0xverifiedpayer",
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	client := NewHTTPFacilitatorClient(&FacilitatorConfig{
		URL: server.URL,
	})

	payload := x402.PaymentPayload{
		X402Version: 2,
		Scheme:      "exact",
		Network:     "eip155:1",
		Payload:     map[string]interface{}{"sig": "test"},
	}

	requirements := x402.PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:1",
		Asset:   "USDC",
		Amount:  "1000000",
		PayTo:   "0xrecipient",
	}

	response, err := client.Verify(ctx, payload, requirements)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if !response.IsValid {
		t.Error("Expected valid response")
	}
	if response.Payer != "0xverifiedpayer" {
		t.Errorf("Expected payer 0xverifiedpayer, got %s", response.Payer)
	}
}

func TestHTTPFacilitatorClientSettle(t *testing.T) {
	ctx := context.Background()

	// Create test server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/settle" {
			t.Errorf("Expected path /settle, got %s", r.URL.Path)
		}

		// Return success response
		response := x402.SettleResponse{
			Success:     true,
			Transaction: "0xsettledtx",
			Payer:       "0xpayer",
			Network:     "eip155:1",
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	client := NewHTTPFacilitatorClient(&FacilitatorConfig{
		URL: server.URL,
	})

	payload := x402.PaymentPayload{
		X402Version: 2,
		Scheme:      "exact",
		Network:     "eip155:1",
		Payload:     map[string]interface{}{},
	}

	requirements := x402.PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:1",
		Asset:   "USDC",
		Amount:  "1000000",
		PayTo:   "0xrecipient",
	}

	response, err := client.Settle(ctx, payload, requirements)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if !response.Success {
		t.Error("Expected successful settlement")
	}
	if response.Transaction != "0xsettledtx" {
		t.Errorf("Expected transaction 0xsettledtx, got %s", response.Transaction)
	}
}

func TestHTTPFacilitatorClientGetSupported(t *testing.T) {
	ctx := context.Background()

	// Create test server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/supported" {
			t.Errorf("Expected path /supported, got %s", r.URL.Path)
		}
		if r.Method != "GET" {
			t.Errorf("Expected GET, got %s", r.Method)
		}

		// Return supported response
		response := x402.SupportedResponse{
			Kinds: []x402.SupportedKind{
				{
					X402Version: 2,
					Scheme:      "exact",
					Network:     "eip155:1",
				},
				{
					X402Version: 2,
					Scheme:      "exact",
					Network:     "eip155:8453",
				},
			},
			Extensions: []string{"bazaar"},
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	client := NewHTTPFacilitatorClient(&FacilitatorConfig{
		URL: server.URL,
	})

	response, err := client.GetSupported(ctx)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if len(response.Kinds) != 2 {
		t.Errorf("Expected 2 kinds, got %d", len(response.Kinds))
	}
	if len(response.Extensions) != 1 {
		t.Errorf("Expected 1 extension, got %d", len(response.Extensions))
	}
	if response.Extensions[0] != "bazaar" {
		t.Errorf("Expected 'bazaar' extension, got %s", response.Extensions[0])
	}
}

func TestHTTPFacilitatorClientWithAuth(t *testing.T) {
	ctx := context.Background()

	// Create test server that checks auth headers
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if auth != "Bearer test-key" {
			t.Errorf("Expected 'Bearer test-key', got %s", auth)
		}

		// Return minimal response
		if r.URL.Path == "/verify" {
			json.NewEncoder(w).Encode(x402.VerifyResponse{IsValid: true})
		} else if r.URL.Path == "/settle" {
			json.NewEncoder(w).Encode(x402.SettleResponse{Success: true})
		} else if r.URL.Path == "/supported" {
			json.NewEncoder(w).Encode(x402.SupportedResponse{})
		}
	}))
	defer server.Close()

	client := NewHTTPFacilitatorClient(&FacilitatorConfig{
		URL:          server.URL,
		AuthProvider: NewStaticAuthProvider("test-key"),
	})

	// Test all endpoints with auth
	payload := x402.PaymentPayload{
		X402Version: 2,
		Scheme:      "exact",
		Network:     "eip155:1",
		Payload:     map[string]interface{}{},
	}

	requirements := x402.PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:1",
		Asset:   "USDC",
		Amount:  "1000000",
		PayTo:   "0xrecipient",
	}

	// Verify
	_, err := client.Verify(ctx, payload, requirements)
	if err != nil {
		t.Fatalf("Verify failed: %v", err)
	}

	// Settle
	_, err = client.Settle(ctx, payload, requirements)
	if err != nil {
		t.Fatalf("Settle failed: %v", err)
	}

	// GetSupported
	_, err = client.GetSupported(ctx)
	if err != nil {
		t.Fatalf("GetSupported failed: %v", err)
	}
}

func TestHTTPFacilitatorClientErrorHandling(t *testing.T) {
	ctx := context.Background()

	// Create test server that returns errors
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte("Bad request"))
	}))
	defer server.Close()

	client := NewHTTPFacilitatorClient(&FacilitatorConfig{
		URL: server.URL,
	})

	payload := x402.PaymentPayload{
		X402Version: 2,
		Scheme:      "exact",
		Network:     "eip155:1",
		Payload:     map[string]interface{}{},
	}

	requirements := x402.PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:1",
		Asset:   "USDC",
		Amount:  "1000000",
		PayTo:   "0xrecipient",
	}

	// Test Verify error
	_, err := client.Verify(ctx, payload, requirements)
	if err == nil {
		t.Error("Expected error for verify")
	}

	// Test Settle error
	_, err = client.Settle(ctx, payload, requirements)
	if err == nil {
		t.Error("Expected error for settle")
	}

	// Test GetSupported error
	_, err = client.GetSupported(ctx)
	if err == nil {
		t.Error("Expected error for getSupported")
	}
}

func TestStaticAuthProvider(t *testing.T) {
	provider := NewStaticAuthProvider("api-key-123")

	ctx := context.Background()
	headers, err := provider.GetAuthHeaders(ctx)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	expectedAuth := "Bearer api-key-123"
	if headers.Verify["Authorization"] != expectedAuth {
		t.Errorf("Expected verify auth %s, got %s", expectedAuth, headers.Verify["Authorization"])
	}
	if headers.Settle["Authorization"] != expectedAuth {
		t.Errorf("Expected settle auth %s, got %s", expectedAuth, headers.Settle["Authorization"])
	}
	if headers.Supported["Authorization"] != expectedAuth {
		t.Errorf("Expected supported auth %s, got %s", expectedAuth, headers.Supported["Authorization"])
	}
}

func TestFuncAuthProvider(t *testing.T) {
	provider := NewFuncAuthProvider(func(ctx context.Context) (AuthHeaders, error) {
		return AuthHeaders{
			Verify:    map[string]string{"X-API-Key": "verify-key"},
			Settle:    map[string]string{"X-API-Key": "settle-key"},
			Supported: map[string]string{"X-API-Key": "supported-key"},
		}, nil
	})

	ctx := context.Background()
	headers, err := provider.GetAuthHeaders(ctx)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if headers.Verify["X-API-Key"] != "verify-key" {
		t.Errorf("Expected verify key 'verify-key', got %s", headers.Verify["X-API-Key"])
	}
	if headers.Settle["X-API-Key"] != "settle-key" {
		t.Errorf("Expected settle key 'settle-key', got %s", headers.Settle["X-API-Key"])
	}
	if headers.Supported["X-API-Key"] != "supported-key" {
		t.Errorf("Expected supported key 'supported-key', got %s", headers.Supported["X-API-Key"])
	}
}

func TestMultiFacilitatorClient(t *testing.T) {
	ctx := context.Background()

	// Create mock facilitator clients
	client1 := &mockMultiFacilitatorClient{
		id: "client1",
		verifyFunc: func(ctx context.Context, p x402.PaymentPayload, r x402.PaymentRequirements) (x402.VerifyResponse, error) {
			if p.Scheme == "exact" {
				return x402.VerifyResponse{IsValid: true, Payer: "client1"}, nil
			}
			return x402.VerifyResponse{}, &x402.PaymentError{Message: "unsupported"}
		},
		supportedFunc: func(ctx context.Context) (x402.SupportedResponse, error) {
			return x402.SupportedResponse{
				Kinds: []x402.SupportedKind{
					{X402Version: 2, Scheme: "exact", Network: "eip155:1"},
				},
				Extensions: []string{"ext1"},
			}, nil
		},
	}

	client2 := &mockMultiFacilitatorClient{
		id: "client2",
		verifyFunc: func(ctx context.Context, p x402.PaymentPayload, r x402.PaymentRequirements) (x402.VerifyResponse, error) {
			if p.Scheme == "transfer" {
				return x402.VerifyResponse{IsValid: true, Payer: "client2"}, nil
			}
			return x402.VerifyResponse{}, &x402.PaymentError{Message: "unsupported"}
		},
		supportedFunc: func(ctx context.Context) (x402.SupportedResponse, error) {
			return x402.SupportedResponse{
				Kinds: []x402.SupportedKind{
					{X402Version: 2, Scheme: "transfer", Network: "eip155:8453"},
				},
				Extensions: []string{"ext2"},
			}, nil
		},
	}

	multiClient := NewMultiFacilitatorClient(client1, client2)

	// Test Verify - should use client1 for "exact"
	payload1 := x402.PaymentPayload{
		X402Version: 2,
		Scheme:      "exact",
		Network:     "eip155:1",
		Payload:     map[string]interface{}{},
	}

	requirements1 := x402.PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:1",
		Asset:   "USDC",
		Amount:  "1000000",
		PayTo:   "0xrecipient",
	}

	response, err := multiClient.Verify(ctx, payload1, requirements1)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if response.Payer != "client1" {
		t.Errorf("Expected payer 'client1', got %s", response.Payer)
	}

	// Test Verify - should use client2 for "transfer"
	payload2 := x402.PaymentPayload{
		X402Version: 2,
		Scheme:      "transfer",
		Network:     "eip155:8453",
		Payload:     map[string]interface{}{},
	}

	requirements2 := x402.PaymentRequirements{
		Scheme:  "transfer",
		Network: "eip155:8453",
		Asset:   "USDC",
		Amount:  "1000000",
		PayTo:   "0xrecipient",
	}

	response, err = multiClient.Verify(ctx, payload2, requirements2)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if response.Payer != "client2" {
		t.Errorf("Expected payer 'client2', got %s", response.Payer)
	}

	// Test GetSupported - should combine from both
	supported, err := multiClient.GetSupported(ctx)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if len(supported.Kinds) != 2 {
		t.Errorf("Expected 2 kinds, got %d", len(supported.Kinds))
	}
	if len(supported.Extensions) != 2 {
		t.Errorf("Expected 2 extensions, got %d", len(supported.Extensions))
	}
}

// Mock facilitator client for multi-client testing
type mockMultiFacilitatorClient struct {
	id            string
	verifyFunc    func(context.Context, x402.PaymentPayload, x402.PaymentRequirements) (x402.VerifyResponse, error)
	settleFunc    func(context.Context, x402.PaymentPayload, x402.PaymentRequirements) (x402.SettleResponse, error)
	supportedFunc func(context.Context) (x402.SupportedResponse, error)
}

func (m *mockMultiFacilitatorClient) Verify(ctx context.Context, p x402.PaymentPayload, r x402.PaymentRequirements) (x402.VerifyResponse, error) {
	if m.verifyFunc != nil {
		return m.verifyFunc(ctx, p, r)
	}
	return x402.VerifyResponse{}, nil
}

func (m *mockMultiFacilitatorClient) Settle(ctx context.Context, p x402.PaymentPayload, r x402.PaymentRequirements) (x402.SettleResponse, error) {
	if m.settleFunc != nil {
		return m.settleFunc(ctx, p, r)
	}
	return x402.SettleResponse{}, nil
}

func (m *mockMultiFacilitatorClient) GetSupported(ctx context.Context) (x402.SupportedResponse, error) {
	if m.supportedFunc != nil {
		return m.supportedFunc(ctx)
	}
	return x402.SupportedResponse{}, nil
}

func (m *mockMultiFacilitatorClient) Identifier() string {
	return m.id
}

package http

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	x402 "github.com/coinbase/x402-go/v2"
)

func TestNewx402HTTPClient(t *testing.T) {
	client := Newx402HTTPClient()
	if client == nil {
		t.Fatal("Expected client to be created")
	}
	if client.X402Client == nil {
		t.Fatal("Expected embedded x402Client")
	}
}

func TestEncodePaymentSignatureHeader(t *testing.T) {
	client := Newx402HTTPClient()

	tests := []struct {
		name     string
		payload  x402.PaymentPayload
		expected string
	}{
		{
			name: "v2 payload",
			payload: x402.PaymentPayload{
				X402Version: 2,
				Scheme:      "exact",
				Network:     "eip155:1",
				Payload:     map[string]interface{}{"sig": "test"},
			},
			expected: "PAYMENT-SIGNATURE",
		},
		{
			name: "v1 payload",
			payload: x402.PaymentPayload{
				X402Version: 1,
				Scheme:      "exact",
				Network:     "eip155:1",
				Payload:     map[string]interface{}{"sig": "test"},
			},
			expected: "X-PAYMENT",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			headers := client.EncodePaymentSignatureHeader(tt.payload)
			if _, exists := headers[tt.expected]; !exists {
				t.Errorf("Expected header %s not found", tt.expected)
			}

			// Verify it's base64 encoded JSON
			encoded := headers[tt.expected]
			decoded, err := base64.StdEncoding.DecodeString(encoded)
			if err != nil {
				t.Fatalf("Failed to decode base64: %v", err)
			}

			var decodedPayload x402.PaymentPayload
			if err := json.Unmarshal(decoded, &decodedPayload); err != nil {
				t.Fatalf("Failed to unmarshal JSON: %v", err)
			}

			if decodedPayload.X402Version != tt.payload.X402Version {
				t.Errorf("Version mismatch: got %d, want %d", decodedPayload.X402Version, tt.payload.X402Version)
			}
		})
	}
}

func TestGetPaymentRequiredResponse(t *testing.T) {
	client := Newx402HTTPClient()

	// Test v2 header format
	requirements := x402.PaymentRequired{
		X402Version: 2,
		Error:       "Payment required",
		Accepts: []x402.PaymentRequirements{
			{
				Scheme:  "exact",
				Network: "eip155:1",
				Asset:   "USDC",
				Amount:  "1000000",
				PayTo:   "0xrecipient",
			},
		},
	}

	reqJSON, _ := json.Marshal(requirements)
	encoded := base64.StdEncoding.EncodeToString(reqJSON)

	headers := map[string]string{
		"PAYMENT-REQUIRED": encoded,
	}

	result, err := client.GetPaymentRequiredResponse(headers, nil)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if result.X402Version != 2 {
		t.Errorf("Expected version 2, got %d", result.X402Version)
	}
	if len(result.Accepts) != 1 {
		t.Errorf("Expected 1 requirement, got %d", len(result.Accepts))
	}

	// Test v1 body format
	v1Requirements := x402.PaymentRequired{
		X402Version: 1,
		Error:       "Payment required",
		Accepts: []x402.PaymentRequirements{
			{
				Scheme:  "exact",
				Network: "eip155:1",
				Asset:   "USDC",
				Amount:  "1000000",
				PayTo:   "0xrecipient",
			},
		},
	}

	v1Body, _ := json.Marshal(v1Requirements)

	result, err = client.GetPaymentRequiredResponse(map[string]string{}, v1Body)
	if err != nil {
		t.Fatalf("Unexpected error for v1: %v", err)
	}

	if result.X402Version != 1 {
		t.Errorf("Expected version 1, got %d", result.X402Version)
	}

	// Test no payment required found
	_, err = client.GetPaymentRequiredResponse(map[string]string{}, nil)
	if err == nil {
		t.Error("Expected error when no payment required found")
	}
}

func TestGetPaymentSettleResponse(t *testing.T) {
	client := Newx402HTTPClient()

	settleResponse := x402.SettleResponse{
		Success:     true,
		Transaction: "0xtx",
		Payer:       "0xpayer",
		Network:     "eip155:1",
	}

	respJSON, _ := json.Marshal(settleResponse)
	encoded := base64.StdEncoding.EncodeToString(respJSON)

	// Test v2 header
	headers := map[string]string{
		"PAYMENT-RESPONSE": encoded,
	}

	result, err := client.GetPaymentSettleResponse(headers)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if !result.Success {
		t.Error("Expected success")
	}
	if result.Transaction != "0xtx" {
		t.Errorf("Expected transaction 0xtx, got %s", result.Transaction)
	}

	// Test v1 header
	headers = map[string]string{
		"X-PAYMENT-RESPONSE": encoded,
	}

	result, err = client.GetPaymentSettleResponse(headers)
	if err != nil {
		t.Fatalf("Unexpected error for v1: %v", err)
	}

	if result.Payer != "0xpayer" {
		t.Errorf("Expected payer 0xpayer, got %s", result.Payer)
	}

	// Test no header found
	_, err = client.GetPaymentSettleResponse(map[string]string{})
	if err == nil {
		t.Error("Expected error when no payment response found")
	}
}

func TestPaymentRoundTripper(t *testing.T) {
	// Create a test server that returns 402 first, then 200
	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++

		if callCount == 1 {
			// First call - return 402
			requirements := x402.PaymentRequired{
				X402Version: 2,
				Error:       "Payment required",
				Accepts: []x402.PaymentRequirements{
					{
						Scheme:  "mock",
						Network: "test:1",
						Asset:   "TEST",
						Amount:  "1000",
						PayTo:   "0xtest",
					},
				},
			}

			reqJSON, _ := json.Marshal(requirements)
			encoded := base64.StdEncoding.EncodeToString(reqJSON)

			w.Header().Set("PAYMENT-REQUIRED", encoded)
			w.WriteHeader(http.StatusPaymentRequired)
			w.Write([]byte("Payment required"))
		} else {
			// Second call - check for payment header and return 200
			if r.Header.Get("PAYMENT-SIGNATURE") == "" {
				t.Error("Expected PAYMENT-SIGNATURE header on retry")
			}
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("Success"))
		}
	}))
	defer server.Close()

	// Create mock scheme client
	mockClient := &mockSchemeClient{
		scheme: "mock",
		createPayload: func(ctx context.Context, version int, requirements x402.PaymentRequirements) (x402.PaymentPayload, error) {
			return x402.PaymentPayload{
				X402Version: version,
				Scheme:      "mock",
				Network:     requirements.Network,
				Payload:     map[string]interface{}{"sig": "test"},
			}, nil
		},
	}

	// Create x402 HTTP client
	x402Client := Newx402HTTPClient()
	x402Client.RegisterScheme("test:1", mockClient)

	// Wrap standard HTTP client
	httpClient := WrapHTTPClientWithPayment(http.DefaultClient, x402Client)

	// Make request
	resp, err := httpClient.Get(server.URL)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	body, _ := io.ReadAll(resp.Body)
	if string(body) != "Success" {
		t.Errorf("Expected body 'Success', got %s", string(body))
	}

	if callCount != 2 {
		t.Errorf("Expected 2 calls to server, got %d", callCount)
	}
}

func TestPaymentRoundTripperNoRetryOn200(t *testing.T) {
	// Server that always returns 200
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Success"))
	}))
	defer server.Close()

	x402Client := Newx402HTTPClient()
	httpClient := WrapHTTPClientWithPayment(http.DefaultClient, x402Client)

	resp, err := httpClient.Get(server.URL)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}
}

func TestDoWithPayment(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Success"))
	}))
	defer server.Close()

	client := Newx402HTTPClient()
	ctx := context.Background()
	req, _ := http.NewRequest("GET", server.URL, nil)

	resp, err := client.DoWithPayment(ctx, req)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}
}

func TestGetWithPayment(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			t.Errorf("Expected GET, got %s", r.Method)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := Newx402HTTPClient()
	ctx := context.Background()

	resp, err := client.GetWithPayment(ctx, server.URL)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	defer resp.Body.Close()
}

func TestPostWithPayment(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("Expected POST, got %s", r.Method)
		}
		body, _ := io.ReadAll(r.Body)
		if string(body) != "test body" {
			t.Errorf("Expected 'test body', got %s", string(body))
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := Newx402HTTPClient()
	ctx := context.Background()

	resp, err := client.PostWithPayment(ctx, server.URL, strings.NewReader("test body"))
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	defer resp.Body.Close()
}

// Mock scheme client for testing
type mockSchemeClient struct {
	scheme        string
	createPayload func(ctx context.Context, version int, requirements x402.PaymentRequirements) (x402.PaymentPayload, error)
}

func (m *mockSchemeClient) Scheme() string {
	return m.scheme
}

func (m *mockSchemeClient) CreatePaymentPayload(ctx context.Context, version int, requirements x402.PaymentRequirements) (x402.PaymentPayload, error) {
	if m.createPayload != nil {
		return m.createPayload(ctx, version, requirements)
	}
	return x402.PaymentPayload{
		X402Version: version,
		Scheme:      m.scheme,
		Network:     requirements.Network,
		Payload:     map[string]interface{}{},
	}, nil
}

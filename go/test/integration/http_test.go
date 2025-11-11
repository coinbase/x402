package integration_test

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"

	x402 "github.com/coinbase/x402/go"
	x402http "github.com/coinbase/x402/go/http"
	"github.com/coinbase/x402/go/test/mocks/cash"
)

// mockHTTPAdapter implements the HTTPAdapter interface for testing
type mockHTTPAdapter struct {
	headers map[string]string
	method  string
	path    string
	url     string
}

func (m *mockHTTPAdapter) GetHeader(name string) string {
	if m.headers == nil {
		return ""
	}
	// Check both cases
	if val, ok := m.headers[name]; ok {
		return val
	}
	// Try lowercase
	if val, ok := m.headers[strings.ToLower(name)]; ok {
		return val
	}
	// Try uppercase
	if val, ok := m.headers[strings.ToUpper(name)]; ok {
		return val
	}
	return ""
}

func (m *mockHTTPAdapter) GetMethod() string {
	return m.method
}

func (m *mockHTTPAdapter) GetPath() string {
	return m.path
}

func (m *mockHTTPAdapter) GetURL() string {
	return m.url
}

func (m *mockHTTPAdapter) GetAcceptHeader() string {
	return "application/json"
}

func (m *mockHTTPAdapter) GetUserAgent() string {
	return "TestClient/1.0"
}

// TestHTTPIntegration tests the integration between x402HTTPClient, x402HTTPResourceService, and x402Facilitator
func TestHTTPIntegration(t *testing.T) {
	t.Run("Cash Flow - x402HTTPClient / x402HTTPResourceService / x402Facilitator", func(t *testing.T) {
		ctx := context.Background()

		// Setup routes configuration
		routes := x402http.RoutesConfig{
			"/api/protected": x402http.RouteConfig{
				Scheme:      "cash",
				PayTo:       "merchant@example.com",
				Price:       "$0.10",
				Network:     "x402:cash",
				Description: "Access to protected API",
				MimeType:    "application/json",
			},
		}

		// Setup facilitator with cash scheme
		facilitator := x402.Newx402Facilitator()
		facilitator.RegisterScheme("x402:cash", cash.NewSchemeNetworkFacilitator())

		// Create facilitator client wrapper
		facilitatorClient := cash.NewFacilitatorClient(facilitator)

		// Setup x402 client with cash scheme
		x402Client := x402.Newx402Client()
		x402Client.RegisterScheme("x402:cash", cash.NewSchemeNetworkClient("John"))
		
		// Setup HTTP client wrapper
		httpClient := x402http.Newx402HTTPClient(x402Client)

		// Setup HTTP service
		service := x402http.Newx402HTTPResourceService(
			routes,
			x402.WithFacilitatorClient(facilitatorClient),
		)
		service.RegisterScheme("x402:cash", cash.NewSchemeNetworkService())

		// Initialize service to fetch supported kinds
		err := service.Initialize(ctx)
		if err != nil {
			t.Fatalf("Failed to initialize service: %v", err)
		}

		// Create mock adapter for initial request (no payment)
		mockAdapter := &mockHTTPAdapter{
			headers: map[string]string{},
			method:  "GET",
			path:    "/api/protected",
			url:     "https://example.com/api/protected",
		}

		// Create request context
		reqCtx := x402http.HTTPRequestContext{
			Adapter: mockAdapter,
			Path:    "/api/protected",
			Method:  "GET",
		}

		// Process initial request without payment - should get 402 response
		httpProcessResult := service.ProcessHTTPRequest(ctx, reqCtx, nil)

		if httpProcessResult.Type != x402http.ResultPaymentError {
			t.Fatalf("Expected payment-error result, got %s", httpProcessResult.Type)
		}

		if httpProcessResult.Response == nil {
			t.Fatal("Expected response instructions, got nil")
		}

		initial402Response := httpProcessResult.Response

		// Verify 402 response
		if initial402Response.Status != 402 {
			t.Errorf("Expected status 402, got %d", initial402Response.Status)
		}

		if initial402Response.Headers["PAYMENT-REQUIRED"] == "" {
			t.Error("Expected PAYMENT-REQUIRED header")
		}

		if initial402Response.IsHTML {
			t.Error("Expected non-HTML response for JSON accept header")
		}

		// Client responds to PaymentRequired
		paymentRequired, err := httpClient.GetPaymentRequiredResponse(
			initial402Response.Headers,
			nil, // No body for v2
		)
		if err != nil {
			t.Fatalf("Failed to get payment required response: %v", err)
		}

		selected, err := x402Client.SelectPaymentRequirements(
			paymentRequired.X402Version,
			paymentRequired.Accepts,
		)
		if err != nil {
			t.Fatalf("Failed to select payment requirements: %v", err)
		}

		// Marshal selected requirements to bytes
		selectedBytes, err := json.Marshal(selected)
		if err != nil {
			t.Fatalf("Failed to marshal requirements: %v", err)
		}

		payloadBytes, err := x402Client.CreatePaymentPayload(
			ctx,
			paymentRequired.X402Version,
			selectedBytes,
			nil, // Cash doesn't use resource
			nil, // Cash doesn't use extensions
		)
		if err != nil {
			t.Fatalf("Failed to create payment payload: %v", err)
		}

		requestHeaders := httpClient.EncodePaymentSignatureHeader(payloadBytes)

		// Update mock adapter with payment header
		mockAdapter.headers = requestHeaders

		// Process request with payment
		httpProcessResult2 := service.ProcessHTTPRequest(ctx, reqCtx, nil)

		if httpProcessResult2.Type != x402http.ResultPaymentVerified {
			t.Fatalf("Expected payment-verified result, got %s", httpProcessResult2.Type)
		}

		if httpProcessResult2.PaymentPayload == nil {
			t.Fatal("Expected payment payload in verified result")
		}

		if httpProcessResult2.PaymentRequirements == nil {
			t.Fatal("Expected payment requirements in verified result")
		}

		// Process settlement (simulating successful response)
		settlementHeaders, err := service.ProcessSettlement(
			ctx,
			*httpProcessResult2.PaymentPayload,
			*httpProcessResult2.PaymentRequirements,
			200, // Success status
		)
		if err != nil {
			t.Fatalf("Failed to process settlement: %v", err)
		}

		if settlementHeaders == nil {
			t.Fatal("Expected settlement headers")
		}

		if settlementHeaders["PAYMENT-RESPONSE"] == "" {
			t.Error("Expected PAYMENT-RESPONSE header")
		}

		// Decode and verify settlement response
		settleData, err := base64.StdEncoding.DecodeString(settlementHeaders["PAYMENT-RESPONSE"])
		if err != nil {
			t.Fatalf("Failed to decode settlement response: %v", err)
		}

		var settleResponse x402.SettleResponse
		err = json.Unmarshal(settleData, &settleResponse)
		if err != nil {
			t.Fatalf("Failed to unmarshal settlement response: %v", err)
		}

		if !settleResponse.Success {
			t.Errorf("Expected successful settlement, got error: %s", settleResponse.ErrorReason)
		}
	})
}


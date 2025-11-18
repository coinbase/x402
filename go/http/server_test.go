package http

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"

	x402 "github.com/coinbase/x402/go"
)

// Mock HTTP adapter for testing
type mockHTTPAdapter struct {
	headers map[string]string
	method  string
	path    string
	url     string
	accept  string
	agent   string
}

func (m *mockHTTPAdapter) GetHeader(name string) string {
	if m.headers == nil {
		return ""
	}
	return m.headers[name]
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
	return m.accept
}

func (m *mockHTTPAdapter) GetUserAgent() string {
	return m.agent
}

func TestNewx402HTTPResourceServer(t *testing.T) {
	routes := RoutesConfig{
		"GET /api": RouteConfig{
			Scheme:  "exact",
			PayTo:   "0xtest",
			Price:   "$1.00",
			Network: "eip155:1",
		},
	}

	server := Newx402HTTPResourceServer(routes)
	if server == nil {
		t.Fatal("Expected server to be created")
	}
	if server.X402ResourceServer == nil {
		t.Fatal("Expected embedded resource server")
	}
	if len(server.compiledRoutes) != 1 {
		t.Fatal("Expected 1 compiled route")
	}
}

func TestProcessHTTPRequestNoPaymentRequired(t *testing.T) {
	ctx := context.Background()

	routes := RoutesConfig{
		"GET /api": RouteConfig{
			Scheme:  "exact",
			PayTo:   "0xtest",
			Price:   "$1.00",
			Network: "eip155:1",
		},
	}

	server := Newx402HTTPResourceServer(routes)

	// Request to non-protected path
	adapter := &mockHTTPAdapter{
		method: "GET",
		path:   "/public",
		url:    "http://example.com/public",
	}

	reqCtx := HTTPRequestContext{
		Adapter: adapter,
		Path:    "/public",
		Method:  "GET",
	}

	result := server.ProcessHTTPRequest(ctx, reqCtx, nil)

	if result.Type != ResultNoPaymentRequired {
		t.Errorf("Expected no payment required, got %s", result.Type)
	}
}

func TestProcessHTTPRequestPaymentRequired(t *testing.T) {
	ctx := context.Background()

	routes := RoutesConfig{
		"GET /api": RouteConfig{
			Scheme:      "exact",
			PayTo:       "0xtest",
			Price:       "$1.00",
			Network:     "eip155:1",
			Description: "API access",
		},
	}

	// Create mock scheme server
	mockServer := &mockSchemeServer{
		scheme: "exact",
		parsePrice: func(price x402.Price, network x402.Network) (x402.AssetAmount, error) {
			return x402.AssetAmount{
				Asset:  "USDC",
				Amount: "1000000",
			}, nil
		},
	}

	// Create mock facilitator client
	mockClient := &mockFacilitatorClient{
		supported: func(ctx context.Context) (x402.SupportedResponse, error) {
			return x402.SupportedResponse{
				Kinds: []x402.SupportedKind{
					{
						X402Version: 2,
						Scheme:      "exact",
						Network:     "eip155:1",
					},
				},
			}, nil
		},
	}

	server := Newx402HTTPResourceServer(
		routes,
		x402.WithFacilitatorClient(mockClient),
		x402.WithSchemeServer("eip155:1", mockServer),
	)
	server.Initialize(ctx)

	// Request to protected path without payment
	adapter := &mockHTTPAdapter{
		method: "GET",
		path:   "/api",
		url:    "http://example.com/api",
		accept: "application/json",
	}

	reqCtx := HTTPRequestContext{
		Adapter: adapter,
		Path:    "/api",
		Method:  "GET",
	}

	result := server.ProcessHTTPRequest(ctx, reqCtx, nil)

	if result.Type != ResultPaymentError {
		t.Errorf("Expected payment error, got %s", result.Type)
	}
	if result.Response == nil {
		t.Fatal("Expected response instructions")
	}
	if result.Response.Status != 402 {
		t.Errorf("Expected status 402, got %d", result.Response.Status)
	}
	if result.Response.Headers["PAYMENT-REQUIRED"] == "" {
		t.Error("Expected PAYMENT-REQUIRED header")
	}
}

func TestProcessHTTPRequestWithBrowser(t *testing.T) {
	ctx := context.Background()

	routes := RoutesConfig{
		"*": RouteConfig{
			Scheme:      "exact",
			PayTo:       "0xtest",
			Price:       "$5.00",
			Network:     "eip155:1",
			Description: "Premium content",
		},
	}

	mockServer := &mockSchemeServer{scheme: "exact"}
	mockClient := &mockFacilitatorClient{}

	server := Newx402HTTPResourceServer(
		routes,
		x402.WithFacilitatorClient(mockClient),
		x402.WithSchemeServer("eip155:1", mockServer),
	)
	server.Initialize(ctx)

	// Browser request
	adapter := &mockHTTPAdapter{
		method: "GET",
		path:   "/content",
		url:    "http://example.com/content",
		accept: "text/html",
		agent:  "Mozilla/5.0",
	}

	reqCtx := HTTPRequestContext{
		Adapter: adapter,
		Path:    "/content",
		Method:  "GET",
	}

	paywallConfig := &PaywallConfig{
		AppName:      "Test App",
		CDPClientKey: "test-key",
	}

	result := server.ProcessHTTPRequest(ctx, reqCtx, paywallConfig)

	if result.Type != ResultPaymentError {
		t.Errorf("Expected payment error, got %s", result.Type)
	}
	if result.Response == nil {
		t.Fatal("Expected response instructions")
	}
	if !result.Response.IsHTML {
		t.Error("Expected HTML response")
	}
	if result.Response.Headers["Content-Type"] != "text/html" {
		t.Error("Expected text/html content type")
	}

	// Check HTML contains expected elements
	html := result.Response.Body.(string)
	if !strings.Contains(html, "Payment Required") {
		t.Error("Expected 'Payment Required' in HTML")
	}
	if !strings.Contains(html, "Test App") {
		t.Error("Expected app name in HTML")
	}
	if !strings.Contains(html, "test-key") {
		t.Error("Expected CDP client key in HTML")
	}
}

func TestProcessHTTPRequestWithPaymentVerified(t *testing.T) {
	ctx := context.Background()

	routes := RoutesConfig{
		"POST /api": RouteConfig{
			Scheme:  "exact",
			PayTo:   "0xtest",
			Price:   "$1.00",
			Network: "eip155:1",
		},
	}

	mockServer := &mockSchemeServer{
		scheme: "exact",
		parsePrice: func(price x402.Price, network x402.Network) (x402.AssetAmount, error) {
			return x402.AssetAmount{
				Asset:  "USDC",
				Amount: "1000000",
				Extra:  map[string]interface{}{},
			}, nil
		},
		enhanceReqs: func(ctx context.Context, base x402.PaymentRequirements, supported x402.SupportedKind, extensions []string) (x402.PaymentRequirements, error) {
			// Return the base requirements as-is
			return base, nil
		},
	}
	mockClient := &mockFacilitatorClient{
		verify: func(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (x402.VerifyResponse, error) {
			return x402.VerifyResponse{
				IsValid: true,
				Payer:   "0xpayer",
			}, nil
		},
		supported: func(ctx context.Context) (x402.SupportedResponse, error) {
			return x402.SupportedResponse{
				Kinds: []x402.SupportedKind{
					{X402Version: 2, Scheme: "exact", Network: "eip155:1"},
				},
			}, nil
		},
	}

	server := Newx402HTTPResourceServer(
		routes,
		x402.WithFacilitatorClient(mockClient),
		x402.WithSchemeServer("eip155:1", mockServer),
	)
	server.Initialize(ctx)

	// Create payment payload that matches the route requirements exactly
	acceptedRequirements := x402.PaymentRequirements{
		Scheme:            "exact",
		Network:           "eip155:1",
		Asset:             "USDC",
		Amount:            "1000000",
		PayTo:             "0xtest",
		MaxTimeoutSeconds: 300,
		Extra: map[string]interface{}{
			"resourceUrl": "http://example.com/api",
		},
	}

	paymentPayload := x402.PaymentPayload{
		X402Version: 2,
		Payload:     map[string]interface{}{"sig": "test"},
		Accepted:    acceptedRequirements,
	}

	payloadJSON, _ := json.Marshal(paymentPayload)
	encoded := base64.StdEncoding.EncodeToString(payloadJSON)

	// Request with payment
	adapter := &mockHTTPAdapter{
		method: "POST",
		path:   "/api",
		url:    "http://example.com/api",
		headers: map[string]string{
			"PAYMENT-SIGNATURE": encoded,
		},
	}

	reqCtx := HTTPRequestContext{
		Adapter: adapter,
		Path:    "/api",
		Method:  "POST",
	}

	result := server.ProcessHTTPRequest(ctx, reqCtx, nil)

	if result.Type != ResultPaymentVerified {
		errMsg := ""
		if result.Response != nil {
			if result.Response.Body != nil {
				if bodyStr, ok := result.Response.Body.(string); ok {
					errMsg = bodyStr
				} else if bodyJSON, ok := result.Response.Body.(map[string]interface{}); ok {
					if jsonBytes, err := json.Marshal(bodyJSON); err == nil {
						errMsg = string(jsonBytes)
					}
				}
			}
		}
		t.Errorf("Expected payment verified, got %s. Response body: %v, Full response: %+v", result.Type, errMsg, result.Response)
	}
	if result.PaymentPayload == nil {
		t.Error("Expected payment payload")
	}
	if result.PaymentRequirements == nil {
		t.Error("Expected payment requirements")
	}
}

func TestProcessSettlement(t *testing.T) {
	ctx := context.Background()

	mockClient := &mockFacilitatorClient{
		settle: func(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (x402.SettleResponse, error) {
			return x402.SettleResponse{
				Success:     true,
				Transaction: "0xtx",
				Payer:       "0xpayer",
			}, nil
		},
	}

	server := Newx402HTTPResourceServer(
		RoutesConfig{},
		x402.WithFacilitatorClient(mockClient),
	)
	server.Initialize(ctx)

	requirements := x402.PaymentRequirements{
		Scheme:  "exact",
		Network: "eip155:1",
		Asset:   "USDC",
		Amount:  "1000000",
		PayTo:   "0xtest",
	}

	payload := x402.PaymentPayload{
		X402Version: 2,
		Accepted:    requirements,
		Payload:     map[string]interface{}{},
	}

	// Test successful response (should settle)
	headers, err := server.ProcessSettlement(ctx, payload, requirements, 200)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if headers == nil {
		t.Fatal("Expected settlement headers")
	}
	if headers["PAYMENT-RESPONSE"] == "" {
		t.Error("Expected PAYMENT-RESPONSE header")
	}

	// Test failed response (should not settle)
	headers, err = server.ProcessSettlement(ctx, payload, requirements, 400)
	if err != nil {
		t.Fatalf("Unexpected error for 400: %v", err)
	}
	if headers != nil {
		t.Error("Expected no headers for failed response")
	}
}

func TestParseRoutePattern(t *testing.T) {
	tests := []struct {
		pattern     string
		expectVerb  string
		testPath    string
		shouldMatch bool
	}{
		{
			pattern:     "GET /api",
			expectVerb:  "GET",
			testPath:    "/api",
			shouldMatch: true,
		},
		{
			pattern:     "POST /api/*",
			expectVerb:  "POST",
			testPath:    "/api/users",
			shouldMatch: true,
		},
		{
			pattern:     "/public",
			expectVerb:  "*",
			testPath:    "/public",
			shouldMatch: true,
		},
		{
			pattern:     "*",
			expectVerb:  "*",
			testPath:    "/anything",
			shouldMatch: true,
		},
		{
			pattern:     "GET /api/[id]",
			expectVerb:  "GET",
			testPath:    "/api/123",
			shouldMatch: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.pattern, func(t *testing.T) {
			verb, regex := parseRoutePattern(tt.pattern)

			if verb != tt.expectVerb {
				t.Errorf("Expected verb %s, got %s", tt.expectVerb, verb)
			}

			normalized := normalizePath(tt.testPath)
			if regex.MatchString(normalized) != tt.shouldMatch {
				t.Errorf("Expected match=%v for path %s", tt.shouldMatch, tt.testPath)
			}
		})
	}
}

func TestNormalizePath(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"/api", "/api"},
		{"/api/", "/api"},
		{"/api//users", "/api/users"},
		{"/api?query=1", "/api"},
		{"/api#fragment", "/api"},
		{"/api%20space", "/api space"},
		{"", "/"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := normalizePath(tt.input)
			if result != tt.expected {
				t.Errorf("Expected %s, got %s", tt.expected, result)
			}
		})
	}
}

func TestGetDisplayAmount(t *testing.T) {
	server := Newx402HTTPResourceServer(RoutesConfig{})

	tests := []struct {
		name     string
		required x402.PaymentRequired
		expected float64
	}{
		{
			name: "USDC with 6 decimals",
			required: x402.PaymentRequired{
				Accepts: []x402.PaymentRequirements{
					{Amount: "5000000"},
				},
			},
			expected: 5.0,
		},
		{
			name: "Small amount",
			required: x402.PaymentRequired{
				Accepts: []x402.PaymentRequirements{
					{Amount: "100000"},
				},
			},
			expected: 0.1,
		},
		{
			name: "Invalid amount",
			required: x402.PaymentRequired{
				Accepts: []x402.PaymentRequirements{
					{Amount: "not-a-number"},
				},
			},
			expected: 0.0,
		},
		{
			name:     "No requirements",
			required: x402.PaymentRequired{},
			expected: 0.0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := server.getDisplayAmount(tt.required)
			if result != tt.expected {
				t.Errorf("Expected %f, got %f", tt.expected, result)
			}
		})
	}
}

// Mock scheme server for testing
type mockSchemeServer struct {
	scheme      string
	parsePrice  func(price x402.Price, network x402.Network) (x402.AssetAmount, error)
	enhanceReqs func(ctx context.Context, base x402.PaymentRequirements, supported x402.SupportedKind, extensions []string) (x402.PaymentRequirements, error)
}

func (m *mockSchemeServer) Scheme() string {
	return m.scheme
}

func (m *mockSchemeServer) ParsePrice(price x402.Price, network x402.Network) (x402.AssetAmount, error) {
	if m.parsePrice != nil {
		return m.parsePrice(price, network)
	}
	return x402.AssetAmount{
		Asset:  "USDC",
		Amount: "1000000",
	}, nil
}

func (m *mockSchemeServer) EnhancePaymentRequirements(ctx context.Context, base x402.PaymentRequirements, supported x402.SupportedKind, extensions []string) (x402.PaymentRequirements, error) {
	if m.enhanceReqs != nil {
		return m.enhanceReqs(ctx, base, supported, extensions)
	}
	return base, nil
}

// Mock facilitator client
type mockFacilitatorClient struct {
	verify    func(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (x402.VerifyResponse, error)
	settle    func(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (x402.SettleResponse, error)
	supported func(ctx context.Context) (x402.SupportedResponse, error)
}

func (m *mockFacilitatorClient) Verify(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (x402.VerifyResponse, error) {
	if m.verify != nil {
		return m.verify(ctx, payloadBytes, requirementsBytes)
	}
	return x402.VerifyResponse{IsValid: true}, nil
}

func (m *mockFacilitatorClient) Settle(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (x402.SettleResponse, error) {
	if m.settle != nil {
		return m.settle(ctx, payloadBytes, requirementsBytes)
	}
	return x402.SettleResponse{Success: true}, nil
}

func (m *mockFacilitatorClient) GetSupported(ctx context.Context) (x402.SupportedResponse, error) {
	if m.supported != nil {
		return m.supported(ctx)
	}
	return x402.SupportedResponse{
		Kinds: []x402.SupportedKind{
			{X402Version: 2, Scheme: "exact", Network: "eip155:1"},
		},
	}, nil
}

func (m *mockFacilitatorClient) Identifier() string {
	return "mock"
}

package http

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	x402 "github.com/coinbase/x402/go"
)

// ============================================================================
// HTTP Facilitator Client
// ============================================================================

// HTTPFacilitatorClient communicates with remote facilitator services over HTTP
type HTTPFacilitatorClient struct {
	url          string
	httpClient   *http.Client
	authProvider AuthProvider
	identifier   string
}

// AuthProvider generates authentication headers for facilitator requests
type AuthProvider interface {
	// GetAuthHeaders returns authentication headers for each endpoint
	GetAuthHeaders(ctx context.Context) (AuthHeaders, error)
}

// AuthHeaders contains authentication headers for facilitator endpoints
type AuthHeaders struct {
	Verify    map[string]string
	Settle    map[string]string
	Supported map[string]string
}

// FacilitatorConfig configures the HTTP facilitator client
type FacilitatorConfig struct {
	// URL is the base URL of the facilitator service
	URL string

	// HTTPClient is the HTTP client to use (optional)
	HTTPClient *http.Client

	// AuthProvider provides authentication headers (optional)
	AuthProvider AuthProvider

	// Timeout for requests (optional, defaults to 30s)
	Timeout time.Duration

	// Identifier for this facilitator (optional)
	Identifier string
}

// DefaultFacilitatorURL is the default public facilitator
const DefaultFacilitatorURL = "https://x402.org/facilitator"

// NewHTTPFacilitatorClient creates a new HTTP facilitator client
func NewHTTPFacilitatorClient(config *FacilitatorConfig) *HTTPFacilitatorClient {
	if config == nil {
		config = &FacilitatorConfig{}
	}

	url := config.URL
	if url == "" {
		url = DefaultFacilitatorURL
	}

	httpClient := config.HTTPClient
	if httpClient == nil {
		timeout := config.Timeout
		if timeout == 0 {
			timeout = 30 * time.Second
		}
		httpClient = &http.Client{
			Timeout: timeout,
		}
	}

	identifier := config.Identifier
	if identifier == "" {
		identifier = url
	}

	return &HTTPFacilitatorClient{
		url:          url,
		httpClient:   httpClient,
		authProvider: config.AuthProvider,
		identifier:   identifier,
	}
}

// ============================================================================
// FacilitatorClient Implementation
// ============================================================================

// Verify checks if a payment is valid without executing it
func (c *HTTPFacilitatorClient) Verify(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (x402.VerifyResponse, error) {
	// Unmarshal to get version (for request body)
	var payloadPartial struct {
		X402Version int `json:"x402Version"`
	}
	if err := json.Unmarshal(payloadBytes, &payloadPartial); err != nil {
		return x402.VerifyResponse{}, fmt.Errorf("failed to detect version: %w", err)
	}

	// Unmarshal to maps for sending to facilitator
	var payloadMap map[string]interface{}
	var requirementsMap map[string]interface{}
	json.Unmarshal(payloadBytes, &payloadMap)
	json.Unmarshal(requirementsBytes, &requirementsMap)

	// Build request body
	requestBody := map[string]interface{}{
		"x402Version":         payloadPartial.X402Version,
		"paymentPayload":      payloadMap,
		"paymentRequirements": requirementsMap,
	}

	body, err := json.Marshal(requestBody)
	if err != nil {
		return x402.VerifyResponse{}, fmt.Errorf("failed to marshal verify request: %w", err)
	}

	// Create request
	req, err := http.NewRequestWithContext(ctx, "POST", c.url+"/verify", bytes.NewReader(body))
	if err != nil {
		return x402.VerifyResponse{}, fmt.Errorf("failed to create verify request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	// Add auth headers if available
	if c.authProvider != nil {
		authHeaders, err := c.authProvider.GetAuthHeaders(ctx)
		if err != nil {
			return x402.VerifyResponse{}, fmt.Errorf("failed to get auth headers: %w", err)
		}
		for k, v := range authHeaders.Verify {
			req.Header.Set(k, v)
		}
	}

	// Make request
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return x402.VerifyResponse{}, fmt.Errorf("verify request failed: %w", err)
	}
	defer resp.Body.Close()

	// Check status
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return x402.VerifyResponse{}, fmt.Errorf("facilitator verify failed (%d): %s", resp.StatusCode, string(body))
	}

	// Parse response
	var verifyResponse x402.VerifyResponse
	if err := json.NewDecoder(resp.Body).Decode(&verifyResponse); err != nil {
		return x402.VerifyResponse{}, fmt.Errorf("failed to decode verify response: %w", err)
	}

	return verifyResponse, nil
}

// Settle executes a payment on-chain
func (c *HTTPFacilitatorClient) Settle(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (x402.SettleResponse, error) {
	// Unmarshal to get version (for request body)
	var payloadPartial struct {
		X402Version int `json:"x402Version"`
	}
	if err := json.Unmarshal(payloadBytes, &payloadPartial); err != nil {
		return x402.SettleResponse{}, fmt.Errorf("failed to detect version: %w", err)
	}

	// Unmarshal to maps for sending to facilitator
	var payloadMap map[string]interface{}
	var requirementsMap map[string]interface{}
	json.Unmarshal(payloadBytes, &payloadMap)
	json.Unmarshal(requirementsBytes, &requirementsMap)

	// Build request body
	requestBody := map[string]interface{}{
		"x402Version":         payloadPartial.X402Version,
		"paymentPayload":      payloadMap,
		"paymentRequirements": requirementsMap,
	}

	body, err := json.Marshal(requestBody)
	if err != nil {
		return x402.SettleResponse{}, fmt.Errorf("failed to marshal settle request: %w", err)
	}

	// Create request
	req, err := http.NewRequestWithContext(ctx, "POST", c.url+"/settle", bytes.NewReader(body))
	if err != nil {
		return x402.SettleResponse{}, fmt.Errorf("failed to create settle request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	// Add auth headers if available
	if c.authProvider != nil {
		authHeaders, err := c.authProvider.GetAuthHeaders(ctx)
		if err != nil {
			return x402.SettleResponse{}, fmt.Errorf("failed to get auth headers: %w", err)
		}
		for k, v := range authHeaders.Settle {
			req.Header.Set(k, v)
		}
	}

	// Make request
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return x402.SettleResponse{}, fmt.Errorf("settle request failed: %w", err)
	}
	defer resp.Body.Close()

	// Check status
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return x402.SettleResponse{}, fmt.Errorf("facilitator settle failed (%d): %s", resp.StatusCode, string(body))
	}

	// Parse response
	var settleResponse x402.SettleResponse
	if err := json.NewDecoder(resp.Body).Decode(&settleResponse); err != nil {
		return x402.SettleResponse{}, fmt.Errorf("failed to decode settle response: %w", err)
	}

	return settleResponse, nil
}

// GetSupported returns the payment kinds this facilitator supports
func (c *HTTPFacilitatorClient) GetSupported(ctx context.Context) (x402.SupportedResponse, error) {
	// Create request
	req, err := http.NewRequestWithContext(ctx, "GET", c.url+"/supported", nil)
	if err != nil {
		return x402.SupportedResponse{}, fmt.Errorf("failed to create supported request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	// Add auth headers if available
	if c.authProvider != nil {
		authHeaders, err := c.authProvider.GetAuthHeaders(ctx)
		if err != nil {
			return x402.SupportedResponse{}, fmt.Errorf("failed to get auth headers: %w", err)
		}
		for k, v := range authHeaders.Supported {
			req.Header.Set(k, v)
		}
	}

	// Make request
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return x402.SupportedResponse{}, fmt.Errorf("supported request failed: %w", err)
	}
	defer resp.Body.Close()

	// Check status
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return x402.SupportedResponse{}, fmt.Errorf("facilitator getSupported failed (%d): %s", resp.StatusCode, string(body))
	}

	// Parse response
	var supportedResponse x402.SupportedResponse
	if err := json.NewDecoder(resp.Body).Decode(&supportedResponse); err != nil {
		return x402.SupportedResponse{}, fmt.Errorf("failed to decode supported response: %w", err)
	}

	return supportedResponse, nil
}

// Identifier returns the identifier for this facilitator client
func (c *HTTPFacilitatorClient) Identifier() string {
	return c.identifier
}

// ============================================================================
// Authentication Providers
// ============================================================================

// StaticAuthProvider provides static authentication headers
type StaticAuthProvider struct {
	headers AuthHeaders
}

// NewStaticAuthProvider creates an auth provider with static headers
func NewStaticAuthProvider(apiKey string) *StaticAuthProvider {
	headers := map[string]string{
		"Authorization": "Bearer " + apiKey,
	}
	return &StaticAuthProvider{
		headers: AuthHeaders{
			Verify:    headers,
			Settle:    headers,
			Supported: headers,
		},
	}
}

// GetAuthHeaders returns the static headers
func (p *StaticAuthProvider) GetAuthHeaders(ctx context.Context) (AuthHeaders, error) {
	return p.headers, nil
}

// FuncAuthProvider uses functions to generate auth headers
type FuncAuthProvider struct {
	fn func(ctx context.Context) (AuthHeaders, error)
}

// NewFuncAuthProvider creates an auth provider from a function
func NewFuncAuthProvider(fn func(ctx context.Context) (AuthHeaders, error)) *FuncAuthProvider {
	return &FuncAuthProvider{fn: fn}
}

// GetAuthHeaders calls the function to get headers
func (p *FuncAuthProvider) GetAuthHeaders(ctx context.Context) (AuthHeaders, error) {
	return p.fn(ctx)
}

// ============================================================================
// Multiple Facilitator Client
// ============================================================================

// MultiFacilitatorClient tries multiple facilitators in order
type MultiFacilitatorClient struct {
	clients []x402.FacilitatorClient
}

// NewMultiFacilitatorClient creates a client that tries multiple facilitators
func NewMultiFacilitatorClient(clients ...x402.FacilitatorClient) *MultiFacilitatorClient {
	return &MultiFacilitatorClient{
		clients: clients,
	}
}

// Verify tries each facilitator until one succeeds
func (m *MultiFacilitatorClient) Verify(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (x402.VerifyResponse, error) {
	var lastErr error

	for _, client := range m.clients {
		resp, err := client.Verify(ctx, payloadBytes, requirementsBytes)
		if err == nil {
			return resp, nil
		}
		lastErr = err
	}

	if lastErr != nil {
		return x402.VerifyResponse{}, fmt.Errorf("all facilitators failed: %w", lastErr)
	}

	return x402.VerifyResponse{}, fmt.Errorf("no facilitators configured")
}

// Settle tries each facilitator until one succeeds
func (m *MultiFacilitatorClient) Settle(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (x402.SettleResponse, error) {
	var lastErr error

	for _, client := range m.clients {
		resp, err := client.Settle(ctx, payloadBytes, requirementsBytes)
		if err == nil {
			return resp, nil
		}
		lastErr = err
	}

	if lastErr != nil {
		return x402.SettleResponse{}, fmt.Errorf("all facilitators failed: %w", lastErr)
	}

	return x402.SettleResponse{}, fmt.Errorf("no facilitators configured")
}

// GetSupported returns combined supported kinds from all facilitators
func (m *MultiFacilitatorClient) GetSupported(ctx context.Context) (x402.SupportedResponse, error) {
	combined := x402.SupportedResponse{
		Kinds:      []x402.SupportedKind{},
		Extensions: []string{},
	}

	extensionSet := make(map[string]bool)

	for _, client := range m.clients {
		resp, err := client.GetSupported(ctx)
		if err != nil {
			continue // Skip failed facilitators
		}

		combined.Kinds = append(combined.Kinds, resp.Kinds...)

		for _, ext := range resp.Extensions {
			extensionSet[ext] = true
		}
	}

	for ext := range extensionSet {
		combined.Extensions = append(combined.Extensions, ext)
	}

	if len(combined.Kinds) == 0 {
		return combined, fmt.Errorf("no facilitators returned supported kinds")
	}

	return combined, nil
}

// Identifier returns a combined identifier for multiple facilitators
func (m *MultiFacilitatorClient) Identifier() string {
	return "multi-facilitator"
}

// ============================================================================
// Utility Functions
// ============================================================================

// toJSONSafe converts values to JSON-safe format (handles BigInt, etc.)
func toJSONSafe(v interface{}) interface{} {
	// Marshal and unmarshal to normalize
	data, err := json.Marshal(v)
	if err != nil {
		return v
	}

	var result interface{}
	json.Unmarshal(data, &result)
	return result
}

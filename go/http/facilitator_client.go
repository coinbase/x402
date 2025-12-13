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
	"github.com/coinbase/x402/go/types"
)

// ============================================================================
// HTTP Facilitator Client
// ============================================================================

// HTTPFacilitatorClient communicates with remote facilitator services over HTTP
// Implements FacilitatorClient interface (supports both V1 and V2)
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
// FacilitatorClient Implementation (Network Boundary - uses bytes)
// ============================================================================

// Verify checks if a payment is valid (supports both V1 and V2)
func (c *HTTPFacilitatorClient) Verify(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (*x402.VerifyResponse, error) {
	// Detect version from bytes
	version, err := types.DetectVersion(payloadBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to detect version: %w", err)
	}

	return c.verifyHTTP(ctx, version, payloadBytes, requirementsBytes)
}

// Settle executes a payment (supports both V1 and V2)
func (c *HTTPFacilitatorClient) Settle(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (*x402.SettleResponse, error) {
	// Detect version from bytes
	version, err := types.DetectVersion(payloadBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to detect version: %w", err)
	}

	return c.settleHTTP(ctx, version, payloadBytes, requirementsBytes)
}

// GetSupported gets supported payment kinds (shared by both V1 and V2)
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
		return x402.SupportedResponse{}, fmt.Errorf("facilitator supported failed (%d): %s", resp.StatusCode, string(body))
	}

	// Parse response
	var supportedResponse x402.SupportedResponse
	if err := json.NewDecoder(resp.Body).Decode(&supportedResponse); err != nil {
		return x402.SupportedResponse{}, fmt.Errorf("failed to decode supported response: %w", err)
	}

	return supportedResponse, nil
}

// ============================================================================
// Internal HTTP Methods (shared by V1 and V2)
// ============================================================================

func (c *HTTPFacilitatorClient) verifyHTTP(ctx context.Context, version int, payloadBytes, requirementsBytes []byte) (*x402.VerifyResponse, error) {
	// Build request body
	var payloadMap, requirementsMap map[string]interface{}
	if err := json.Unmarshal(payloadBytes, &payloadMap); err != nil {
		return nil, fmt.Errorf("failed to unmarshal payload: %w", err)
	}
	if err := json.Unmarshal(requirementsBytes, &requirementsMap); err != nil {
		return nil, fmt.Errorf("failed to unmarshal requirements: %w", err)
	}

	requestBody := map[string]interface{}{
		"x402Version":         version,
		"paymentPayload":      payloadMap,
		"paymentRequirements": requirementsMap,
	}

	body, err := json.Marshal(requestBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal verify request: %w", err)
	}

	// Create request
	req, err := http.NewRequestWithContext(ctx, "POST", c.url+"/verify", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create verify request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	// Add auth headers if available
	if c.authProvider != nil {
		authHeaders, err := c.authProvider.GetAuthHeaders(ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to get auth headers: %w", err)
		}
		for k, v := range authHeaders.Verify {
			req.Header.Set(k, v)
		}
	}

	// Make request
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("verify request failed: %w", err)
	}
	defer resp.Body.Close()

	// Check status
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("facilitator verify failed (%d): %s", resp.StatusCode, string(body))
	}

	// Parse response
	var verifyResponse x402.VerifyResponse
	if err := json.NewDecoder(resp.Body).Decode(&verifyResponse); err != nil {
		return nil, fmt.Errorf("failed to decode verify response: %w", err)
	}

	return &verifyResponse, nil
}

func (c *HTTPFacilitatorClient) settleHTTP(ctx context.Context, version int, payloadBytes, requirementsBytes []byte) (*x402.SettleResponse, error) {
	// Build request body
	var payloadMap, requirementsMap map[string]interface{}
	if err := json.Unmarshal(payloadBytes, &payloadMap); err != nil {
		return nil, fmt.Errorf("failed to unmarshal payload: %w", err)
	}
	if err := json.Unmarshal(requirementsBytes, &requirementsMap); err != nil {
		return nil, fmt.Errorf("failed to unmarshal requirements: %w", err)
	}

	requestBody := map[string]interface{}{
		"x402Version":         version,
		"paymentPayload":      payloadMap,
		"paymentRequirements": requirementsMap,
	}

	body, err := json.Marshal(requestBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal settle request: %w", err)
	}

	// Create request
	req, err := http.NewRequestWithContext(ctx, "POST", c.url+"/settle", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create settle request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	// Add auth headers if available
	if c.authProvider != nil {
		authHeaders, err := c.authProvider.GetAuthHeaders(ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to get auth headers: %w", err)
		}
		for k, v := range authHeaders.Settle {
			req.Header.Set(k, v)
		}
	}

	// Make request
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("settle request failed: %w", err)
	}
	defer resp.Body.Close()

	// Check status
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("facilitator settle failed (%d): %s", resp.StatusCode, string(body))
	}

	// Parse response
	var settleResponse x402.SettleResponse
	if err := json.NewDecoder(resp.Body).Decode(&settleResponse); err != nil {
		return nil, fmt.Errorf("failed to decode settle response: %w", err)
	}

	return &settleResponse, nil
}

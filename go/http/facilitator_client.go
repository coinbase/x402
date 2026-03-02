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

// getSupportedRetries is the number of retry attempts for GetSupported on 429 rate limit errors
const getSupportedRetries = 3

// getSupportedRetryBaseDelay is the base delay for exponential backoff on retries
const getSupportedRetryBaseDelay = 1 * time.Second

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

// GetSupported gets supported payment kinds (shared by both V1 and V2).
// Retries up to 3 times with exponential backoff on 429 rate limit errors.
func (c *HTTPFacilitatorClient) GetSupported(ctx context.Context) (x402.SupportedResponse, error) {
	var lastErr error

	for attempt := range getSupportedRetries {
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

		// Read response body
		responseBody, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return x402.SupportedResponse{}, fmt.Errorf("failed to read response body: %w", err)
		}

		// Success
		if resp.StatusCode == http.StatusOK {
			var supportedResponse x402.SupportedResponse
			if err := json.Unmarshal(responseBody, &supportedResponse); err != nil {
				return x402.SupportedResponse{}, fmt.Errorf("failed to decode supported response: %w", err)
			}
			return supportedResponse, nil
		}

		lastErr = fmt.Errorf("facilitator supported failed (%d): %s", resp.StatusCode, string(responseBody))

		// Retry on 429 with exponential backoff, except on the last attempt
		if resp.StatusCode == http.StatusTooManyRequests && attempt < getSupportedRetries-1 {
			delay := getSupportedRetryBaseDelay * time.Duration(1<<uint(attempt))
			select {
			case <-time.After(delay):
				continue
			case <-ctx.Done():
				return x402.SupportedResponse{}, ctx.Err()
			}
		}

		// Non-429 errors or last attempt: return immediately
		return x402.SupportedResponse{}, lastErr
	}

	return x402.SupportedResponse{}, lastErr
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

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	var verifyResponse x402.VerifyResponse
	if err := json.Unmarshal(responseBody, &verifyResponse); err != nil {
		return nil, x402.NewVerifyError(
			x402.ErrInvalidResponse,
			"",
			fmt.Sprintf("failed to unmarshal verify response: %s", err.Error()),
		)
	}

	// For non-200 responses, return an error with the details from the response
	if resp.StatusCode != http.StatusOK {
		if verifyResponse.InvalidReason != "" {
			return nil, x402.NewVerifyError(
				verifyResponse.InvalidReason,
				verifyResponse.Payer,
				verifyResponse.InvalidMessage,
			)
		}
		return nil, fmt.Errorf("facilitator verify failed (%d): %s", resp.StatusCode, string(responseBody))
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

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	var settleResponse x402.SettleResponse
	if err := json.Unmarshal(responseBody, &settleResponse); err != nil {
		return nil, fmt.Errorf("facilitator settle failed (%d): %s", resp.StatusCode, string(responseBody))
	}

	// For non-200 responses, return an error with the details from the response
	if resp.StatusCode != http.StatusOK {
		if settleResponse.ErrorReason != "" {
			return nil, x402.NewSettleError(
				settleResponse.ErrorReason,
				settleResponse.Payer,
				settleResponse.Network,
				settleResponse.Transaction,
				fmt.Sprintf("facilitator returned %d", resp.StatusCode),
			)
		}
		return nil, fmt.Errorf("facilitator settle failed (%d): %s", resp.StatusCode, string(responseBody))
	}

	return &settleResponse, nil
}

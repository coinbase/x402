package facilitatorclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/coinbase/x402/go/pkg/types"
)

// DefaultFacilitatorURL is the default URL for the x402 facilitator service (AnySpend mainnet)
const DefaultFacilitatorURL = "https://mainnet.anyspend.com/x402"

// DefaultTimeout is the default HTTP client timeout
const DefaultTimeout = 30 * time.Second

// Config contains configuration for the facilitator client
type Config struct {
	// URL is the base URL of the facilitator service
	// Defaults to AnySpend mainnet if not set
	URL string
	// Timeout is the HTTP client timeout
	// Defaults to 30 seconds if not set
	Timeout time.Duration
	// CreateAuthHeaders is an optional function to create authentication headers
	// The returned map is keyed by operation ("verify", "settle", "quote")
	CreateAuthHeaders func() (map[string]map[string]string, error)
}

// Client represents a facilitator client for verifying and settling payments
type Client struct {
	url               string
	httpClient        *http.Client
	createAuthHeaders func() (map[string]map[string]string, error)
}

// NewClient creates a new facilitator client
func NewClient(config Config) *Client {
	baseURL := config.URL
	if baseURL == "" {
		baseURL = DefaultFacilitatorURL
	}

	timeout := config.Timeout
	if timeout == 0 {
		timeout = DefaultTimeout
	}

	return &Client{
		url: baseURL,
		httpClient: &http.Client{
			Timeout: timeout,
		},
		createAuthHeaders: config.CreateAuthHeaders,
	}
}

// NewFacilitatorClient creates a new facilitator client (legacy constructor for backward compatibility)
func NewFacilitatorClient(config *types.FacilitatorConfig) *Client {
	if config == nil {
		return NewClient(Config{})
	}

	var timeout time.Duration
	if config.Timeout != nil {
		timeout = config.Timeout()
	}

	return NewClient(Config{
		URL:               config.URL,
		Timeout:           timeout,
		CreateAuthHeaders: config.CreateAuthHeaders,
	})
}

// =============================================================================
// Payment Methods
// =============================================================================

// Verify sends a payment verification request to the facilitator.
// Returns the verification result or an error if verification fails.
func (c *Client) Verify(ctx context.Context, payload *types.PaymentPayload, requirements *types.PaymentRequirements) (*types.VerifyResponse, error) {
	reqBody := &types.VerifyRequest{
		X402Version:         1,
		PaymentPayload:      payload,
		PaymentRequirements: requirements,
	}

	var resp types.VerifyResponse
	if err := c.doRequest(ctx, "POST", "/verify", "verify", reqBody, &resp); err != nil {
		return nil, fmt.Errorf("verify request failed: %w", err)
	}

	return &resp, nil
}

// Settle sends a payment settlement request to the facilitator.
// This should only be called after Verify returns successfully.
func (c *Client) Settle(ctx context.Context, payload *types.PaymentPayload, requirements *types.PaymentRequirements) (*types.SettleResponse, error) {
	reqBody := &types.SettleRequest{
		X402Version:         1,
		PaymentPayload:      payload,
		PaymentRequirements: requirements,
	}

	var resp types.SettleResponse
	if err := c.doRequest(ctx, "POST", "/settle", "settle", reqBody, &resp); err != nil {
		return nil, fmt.Errorf("settle request failed: %w", err)
	}

	return &resp, nil
}

// VerifyAndSettle verifies and settles a payment in sequence.
// It first calls Verify, and if successful, calls Settle.
func (c *Client) VerifyAndSettle(ctx context.Context, payload *types.PaymentPayload, requirements *types.PaymentRequirements) (*types.SettleResponse, error) {
	// Step 1: Verify the payment
	verifyResp, err := c.Verify(ctx, payload, requirements)
	if err != nil {
		return nil, fmt.Errorf("payment verification failed: %w", err)
	}

	if !verifyResp.IsValid {
		reason := "unknown"
		if verifyResp.InvalidReason != nil {
			reason = *verifyResp.InvalidReason
		}
		return nil, fmt.Errorf("payment is invalid: %s", reason)
	}

	// Step 2: Settle the payment
	settleResp, err := c.Settle(ctx, payload, requirements)
	if err != nil {
		return nil, fmt.Errorf("payment settlement failed: %w", err)
	}

	if !settleResp.Success {
		reason := "unknown"
		if settleResp.ErrorReason != nil {
			reason = *settleResp.ErrorReason
		}
		return nil, fmt.Errorf("payment settlement unsuccessful: %s", reason)
	}

	return settleResp, nil
}

// =============================================================================
// Quote Methods (AnySpend cross-token extension)
// =============================================================================

// GetQuote calls the facilitator /quote endpoint to get cross-token payment info.
// This is used when the buyer wants to pay with a different token than what the seller requires.
func (c *Client) GetQuote(ctx context.Context, req *types.QuoteRequest) (*types.QuoteData, error) {
	var resp types.QuoteResponse
	if err := c.doRequest(ctx, "POST", "/quote", "quote", req, &resp); err != nil {
		return nil, fmt.Errorf("quote request failed: %w", err)
	}

	if !resp.Success {
		return nil, fmt.Errorf("quote failed: %s", resp.Message)
	}

	return resp.Data, nil
}

// =============================================================================
// Facilitator Info Methods
// =============================================================================

// GetFacilitatorAddress returns the facilitator contract address for the given network.
// This is needed for permit-based tokens where the spender must be the facilitator.
func (c *Client) GetFacilitatorAddress(ctx context.Context, network string) (string, error) {
	// Call the /supported endpoint to get facilitator addresses per network
	var resp types.SupportedResponse
	if err := c.doRequest(ctx, "GET", "/supported", "supported", nil, &resp); err != nil {
		return "", fmt.Errorf("supported request failed: %w", err)
	}

	// Find the kind for this network and extract facilitator address
	for _, kind := range resp.Kinds {
		if kind.Network == network {
			if addr, ok := kind.Extra["facilitatorAddress"].(string); ok {
				return addr, nil
			}
		}
	}

	return "", fmt.Errorf("no facilitator address found for network: %s", network)
}

// =============================================================================
// Discovery Methods (Bazaar extension)
// =============================================================================

// ListResources lists discovered resources from the facilitator.
// This returns all registered x402-protected endpoints.
func (c *Client) ListResources(ctx context.Context, opts *types.ListResourcesOptions) (*types.DiscoveryListResponse, error) {
	// Build query parameters
	query := url.Values{}
	if opts != nil {
		if opts.Type != "" {
			query.Set("type", opts.Type)
		}
		if opts.Limit > 0 {
			query.Set("limit", strconv.Itoa(opts.Limit))
		}
		if opts.Offset > 0 {
			query.Set("offset", strconv.Itoa(opts.Offset))
		}
	}

	path := "/discovery/resources"
	if len(query) > 0 {
		path += "?" + query.Encode()
	}

	var resp types.DiscoveryListResponse
	if err := c.doRequest(ctx, "GET", path, "discovery", nil, &resp); err != nil {
		return nil, fmt.Errorf("list resources request failed: %w", err)
	}

	return &resp, nil
}

// RegisterResource registers a resource with the facilitator's discovery catalog.
// This makes the endpoint discoverable in the Bazaar.
func (c *Client) RegisterResource(ctx context.Context, resource string, accepts []types.PaymentRequirements, metadata *types.DiscoveryMetadata) error {
	reqBody := &types.DiscoveryRegisterRequest{
		Resource: resource,
		Type:     "http",
		Accepts:  accepts,
		Metadata: metadata,
	}

	var resp map[string]any
	if err := c.doRequest(ctx, "POST", "/discovery/resources", "discovery", reqBody, &resp); err != nil {
		return fmt.Errorf("register resource request failed: %w", err)
	}

	return nil
}

// UnregisterResource removes a resource from the facilitator's discovery catalog.
func (c *Client) UnregisterResource(ctx context.Context, resource string) error {
	// URL encode the resource
	path := "/discovery/resources/" + url.PathEscape(resource)

	var resp map[string]any
	if err := c.doRequest(ctx, "DELETE", path, "discovery", nil, &resp); err != nil {
		return fmt.Errorf("unregister resource request failed: %w", err)
	}

	return nil
}

// =============================================================================
// Internal Helper Methods
// =============================================================================

// doRequest performs an HTTP request to the facilitator
func (c *Client) doRequest(ctx context.Context, method, path, operation string, body any, result any) error {
	var bodyReader io.Reader
	if body != nil {
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("failed to marshal request body: %w", err)
		}
		bodyReader = bytes.NewBuffer(jsonBody)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.url+path, bodyReader)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	// Add auth headers if available
	if c.createAuthHeaders != nil {
		headers, err := c.createAuthHeaders()
		if err != nil {
			return fmt.Errorf("failed to create auth headers: %w", err)
		}
		if opHeaders, ok := headers[operation]; ok {
			for key, value := range opHeaders {
				req.Header.Set(key, value)
			}
		}
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	// Read response body
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("request failed with status %d: %s", resp.StatusCode, string(respBody))
	}

	if result != nil && len(respBody) > 0 {
		if err := json.Unmarshal(respBody, result); err != nil {
			return fmt.Errorf("failed to decode response: %w", err)
		}
	}

	return nil
}

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
// Legacy HTTP Facilitator Client (V1 Only)
// ============================================================================

// LegacyHTTPFacilitatorClient communicates with V1-only facilitator services.
// This adapter converts V1 facilitator responses to V2 format, enabling V1
// facilitators to work with V2 resource servers.
//
// Use this client when connecting to facilitators that:
//   - Only support x402 V1
//   - Return the old supported response format (array of kinds with x402Version field)
//   - Don't support extensions or signers
type LegacyHTTPFacilitatorClient struct {
	url          string
	httpClient   *http.Client
	authProvider AuthProvider
	identifier   string
}

// NewLegacyHTTPFacilitatorClient creates a new legacy HTTP facilitator client
// for V1-only facilitators. The client converts V1 responses to V2 format.
func NewLegacyHTTPFacilitatorClient(config *FacilitatorConfig) *LegacyHTTPFacilitatorClient {
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

	return &LegacyHTTPFacilitatorClient{
		url:          url,
		httpClient:   httpClient,
		authProvider: config.AuthProvider,
		identifier:   identifier,
	}
}

// ============================================================================
// FacilitatorClient Implementation
// ============================================================================

// Verify checks if a payment is valid (V1 only)
func (c *LegacyHTTPFacilitatorClient) Verify(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (*x402.VerifyResponse, error) {
	// Detect version from bytes
	version, err := types.DetectVersion(payloadBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to detect version: %w", err)
	}

	// Legacy facilitators only support V1
	if version != 1 {
		return nil, fmt.Errorf("legacy facilitator only supports V1, got V%d", version)
	}

	return c.verifyHTTP(ctx, version, payloadBytes, requirementsBytes)
}

// Settle executes a payment (V1 only)
func (c *LegacyHTTPFacilitatorClient) Settle(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (*x402.SettleResponse, error) {
	// Detect version from bytes
	version, err := types.DetectVersion(payloadBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to detect version: %w", err)
	}

	// Legacy facilitators only support V1
	if version != 1 {
		return nil, fmt.Errorf("legacy facilitator only supports V1, got V%d", version)
	}

	return c.settleHTTP(ctx, version, payloadBytes, requirementsBytes)
}

// GetSupported gets supported payment kinds and converts V1 format to V2
func (c *LegacyHTTPFacilitatorClient) GetSupported(ctx context.Context) (x402.SupportedResponse, error) {
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
		return x402.SupportedResponse{}, fmt.Errorf("legacy facilitator supported failed (%d): %s", resp.StatusCode, string(body))
	}

	// Parse V1 response
	var v1Response x402.SupportedResponseV1
	if err := json.NewDecoder(resp.Body).Decode(&v1Response); err != nil {
		return x402.SupportedResponse{}, fmt.Errorf("failed to decode V1 supported response: %w", err)
	}

	// Convert V1 to V2
	return c.convertV1ToV2(v1Response), nil
}

// ============================================================================
// Internal Methods
// ============================================================================

// convertV1ToV2 converts V1 supported response format to V2 format.
// Groups kinds by version and adds empty extensions and signers.
func (c *LegacyHTTPFacilitatorClient) convertV1ToV2(v1Response x402.SupportedResponseV1) x402.SupportedResponse {
	kindsByVersion := make(map[string][]types.SupportedKind)

	// Group kinds by version
	for _, v1Kind := range v1Response.Kinds {
		versionKey := fmt.Sprintf("%d", v1Kind.X402Version)

		// Create V2 kind (without X402Version field)
		v2Kind := types.SupportedKind{
			Scheme:  v1Kind.Scheme,
			Network: v1Kind.Network,
		}

		// Convert RawMessage Extra to map if present
		if v1Kind.Extra != nil {
			var extraMap map[string]interface{}
			if err := json.Unmarshal(*v1Kind.Extra, &extraMap); err == nil {
				v2Kind.Extra = extraMap
			}
		}

		kindsByVersion[versionKey] = append(kindsByVersion[versionKey], v2Kind)
	}

	return x402.SupportedResponse{
		Kinds:      kindsByVersion,
		Extensions: []string{},                // V1 facilitators don't support extensions
		Signers:    make(map[string][]string), // V1 facilitators don't provide signer information
	}
}

// verifyHTTP makes the HTTP verify request (shared with regular client)
func (c *LegacyHTTPFacilitatorClient) verifyHTTP(ctx context.Context, version int, payloadBytes, requirementsBytes []byte) (*x402.VerifyResponse, error) {
	// Build request body
	var payloadMap, requirementsMap map[string]interface{}
	json.Unmarshal(payloadBytes, &payloadMap)
	json.Unmarshal(requirementsBytes, &requirementsMap)

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
		return nil, fmt.Errorf("legacy facilitator verify failed (%d): %s", resp.StatusCode, string(body))
	}

	// Parse response
	var verifyResponse x402.VerifyResponse
	if err := json.NewDecoder(resp.Body).Decode(&verifyResponse); err != nil {
		return nil, fmt.Errorf("failed to decode verify response: %w", err)
	}

	return &verifyResponse, nil
}

// settleHTTP makes the HTTP settle request (shared with regular client)
func (c *LegacyHTTPFacilitatorClient) settleHTTP(ctx context.Context, version int, payloadBytes, requirementsBytes []byte) (*x402.SettleResponse, error) {
	// Build request body
	var payloadMap, requirementsMap map[string]interface{}
	json.Unmarshal(payloadBytes, &payloadMap)
	json.Unmarshal(requirementsBytes, &requirementsMap)

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
		return nil, fmt.Errorf("legacy facilitator settle failed (%d): %s", resp.StatusCode, string(body))
	}

	// Parse response
	var settleResponse x402.SettleResponse
	if err := json.NewDecoder(resp.Body).Decode(&settleResponse); err != nil {
		return nil, fmt.Errorf("failed to decode settle response: %w", err)
	}

	return &settleResponse, nil
}

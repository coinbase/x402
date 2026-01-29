package http

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	x402 "github.com/gatechain/x402/go"
	"github.com/gatechain/x402/go/types"
	"github.com/google/uuid"
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

// DefaultFacilitatorURL is the default public facilitator (Gate Web3 OpenAPI Testnet)
// Matches the documentation in querydoc: https://openapi-test.gateweb3.cc/api/v1/x402
const DefaultFacilitatorURL = "https://openapi-test.gateweb3.cc/api/v1/x402"

// Gate Web3 signing path and logical target URIs (used for x-target-uri)
const (
	gateWeb3SigningPath          = "/api/v1/dex"
	gateWeb3TargetURISupported   = "/v1/x402/supported"
	gateWeb3TargetURIVerify      = "/v1/x402/verify"
	gateWeb3TargetURISettle      = "/v1/x402/settle"
	envGateWeb3APIKey            = "GATE_WEB3_API_KEY"
	envGateWeb3APISecret         = "GATE_WEB3_API_SECRET"
	envGateWeb3Passphrase        = "GATE_WEB3_PASSPHRASE"
	envGateWeb3RealIP            = "GATE_WEB3_REAL_IP"
	defaultGateWeb3ForwardedFor  = "127.0.0.1"
	defaultGateWeb3Passphrase    = ""
	defaultGateWeb3RequestIDPref = "req-"
)

type gateWeb3Credentials struct {
	APIKey     string
	APISecret  string
	Passphrase string
	RealIP     string
}

// loadGateWeb3Credentials loads AK/SK and related configuration for the default signing logic.
// If both AK and SK are present, the Gate Web3 default signing is enabled.
func loadGateWeb3Credentials() (*gateWeb3Credentials, bool) {
	ak := strings.TrimSpace(os.Getenv(envGateWeb3APIKey))
	sk := strings.TrimSpace(os.Getenv(envGateWeb3APISecret))
	if ak == "" || sk == "" {
		return nil, false
	}

	pass := os.Getenv(envGateWeb3Passphrase)
	if pass == "" {
		pass = defaultGateWeb3Passphrase
	}

	realIP := os.Getenv(envGateWeb3RealIP)
	if realIP == "" {
		realIP = defaultGateWeb3ForwardedFor
	}

	return &gateWeb3Credentials{
		APIKey:     ak,
		APISecret:  sk,
		Passphrase: pass,
		RealIP:     realIP,
	}, true
}

// applyGateWeb3Signature signs the request using the same logic as web3api.sh and sets HTTP headers.
// PREHASH = <timestamp><gateWeb3SigningPath><rawBody>
// Signature = Base64(HMAC_SHA256(SK, PREHASH))
// Additional headers: X-Api-Key, X-Timestamp, X-Signature, X-Passphrase, X-Request-Id, X-Forwarded-For, x-target-uri
func applyGateWeb3Signature(req *http.Request, body []byte, targetURI string) {
	creds, ok := loadGateWeb3Credentials()
	if !ok {
		// If credentials are not configured, fall back to any custom AuthProvider
		return
	}

	timestamp := time.Now().UnixMilli()
	prehash := fmt.Sprintf("%d%s%s", timestamp, gateWeb3SigningPath, string(body))

	mac := hmac.New(sha256.New, []byte(creds.APISecret))
	_, _ = mac.Write([]byte(prehash))
	signature := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	req.Header.Set("X-Api-Key", creds.APIKey)
	req.Header.Set("X-Timestamp", strconv.FormatInt(timestamp, 10))
	req.Header.Set("X-Signature", signature)

	if creds.Passphrase != "" {
		req.Header.Set("X-Passphrase", creds.Passphrase)
	}
	if creds.RealIP != "" {
		req.Header.Set("X-Forwarded-For", creds.RealIP)
	}

	// Request ID
	req.Header.Set("X-Request-Id", uuid.NewString())

	// x-target-uri: remove leading slash per gateway expectation
	req.Header.Set("x-target-uri", strings.TrimPrefix(targetURI, "/"))
}

// facilitatorAPIResponse is the standard envelope used by the facilitator API
//
//	{
//	  "code": 0,
//	  "msg":  "",
//	  "data": { ... }
//	}
type facilitatorAPIResponse[T any] struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
	Data T      `json:"data"`
}

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
	// OpenAPI style: POST to a single endpoint with action wrapper
	requestBody := map[string]interface{}{
		"action": "x402.supported",
		"params": map[string]interface{}{},
	}

	body, err := json.Marshal(requestBody)
	if err != nil {
		return x402.SupportedResponse{}, fmt.Errorf("failed to marshal supported request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader(body))
	if err != nil {
		return x402.SupportedResponse{}, fmt.Errorf("failed to create supported request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	// Apply default web3api.sh-style signing
	applyGateWeb3Signature(req, body, gateWeb3TargetURISupported)

	// Apply additional custom auth headers (if provided), overriding defaults if needed
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

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return x402.SupportedResponse{}, fmt.Errorf("failed to read supported response body: %w", err)
	}

	var apiResp facilitatorAPIResponse[x402.SupportedResponse]
	if err := json.Unmarshal(responseBody, &apiResp); err != nil {
		return x402.SupportedResponse{}, fmt.Errorf("failed to decode supported response (%d): %s", resp.StatusCode, string(responseBody))
	}

	// For non-200 or non-zero business code, return an error
	if resp.StatusCode != http.StatusOK || apiResp.Code != 0 {
		return x402.SupportedResponse{}, fmt.Errorf("facilitator supported failed (http=%d, code=%d, msg=%s)", resp.StatusCode, apiResp.Code, apiResp.Msg)
	}

	return apiResp.Data, nil
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

	params := map[string]interface{}{
		"x402Version":         version,
		"paymentPayload":      payloadMap,
		"paymentRequirements": requirementsMap,
	}

	// OpenAPI style: wrap in action/params envelope
	requestBody := map[string]interface{}{
		"action": "x402.verify",
		"params": params,
	}

	body, err := json.Marshal(requestBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal verify request: %w", err)
	}

	// Create request (single endpoint, action determines operation)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create verify request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	// Apply default web3api.sh-style signing
	applyGateWeb3Signature(req, body, gateWeb3TargetURIVerify)

	// Apply additional custom auth headers (if provided), overriding defaults if needed
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

	var apiResp facilitatorAPIResponse[x402.VerifyResponse]
	if err := json.Unmarshal(responseBody, &apiResp); err != nil {
		return nil, fmt.Errorf("facilitator verify failed (%d): %s", resp.StatusCode, string(responseBody))
	}

	// For non-200 or non-zero business code, return an error with details
	if resp.StatusCode != http.StatusOK || apiResp.Code != 0 {
		if apiResp.Data.InvalidReason != "" {
			return nil, x402.NewVerifyError(
				apiResp.Data.InvalidReason,
				apiResp.Data.Payer,
				"",
				fmt.Errorf("facilitator returned http=%d code=%d msg=%s", resp.StatusCode, apiResp.Code, apiResp.Msg),
			)
		}
		return nil, fmt.Errorf("facilitator verify failed (http=%d, code=%d, msg=%s)", resp.StatusCode, apiResp.Code, apiResp.Msg)
	}

	return &apiResp.Data, nil
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

	params := map[string]interface{}{
		"x402Version":         version,
		"paymentPayload":      payloadMap,
		"paymentRequirements": requirementsMap,
	}
	// OpenAPI style: wrap in action/params envelope
	requestBody := map[string]interface{}{
		"action": "x402.settle",
		"params": params,
	}

	body, err := json.Marshal(requestBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal settle request: %w", err)
	}

	// Create request (single endpoint, action determines operation)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create settle request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	// Apply default web3api.sh-style signing
	applyGateWeb3Signature(req, body, gateWeb3TargetURISettle)

	// Apply additional custom auth headers (if provided), overriding defaults if needed
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

	var apiResp facilitatorAPIResponse[x402.SettleResponse]
	if err := json.Unmarshal(responseBody, &apiResp); err != nil {
		return nil, fmt.Errorf("facilitator settle failed (%d): %s", resp.StatusCode, string(responseBody))
	}

	// For non-200 or non-zero business code, return an error with the details from the response
	if resp.StatusCode != http.StatusOK || apiResp.Code != 0 {
		if apiResp.Data.ErrorReason != "" {
			return nil, x402.NewSettleError(
				apiResp.Data.ErrorReason,
				apiResp.Data.Payer,
				apiResp.Data.Network,
				apiResp.Data.Transaction,
				fmt.Errorf("facilitator returned http=%d code=%d msg=%s", resp.StatusCode, apiResp.Code, apiResp.Msg),
			)
		}
		return nil, fmt.Errorf("facilitator settle failed (http=%d, code=%d, msg=%s)", resp.StatusCode, apiResp.Code, apiResp.Msg)
	}

	return &apiResp.Data, nil
}

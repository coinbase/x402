package facilitatorclient

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"

	"github.com/coinbase/x402/go/pkg/types"
)

const (
	// DefaultFacilitatorURL is the default URL for the x402 facilitator service
	DefaultFacilitatorURL = "https://x402.org/facilitator"

	headerContentType   = "Content-Type"
	mimeApplicationJSON = "application/json"

	authHeaderVerify    = "verify"
	authHeaderSettle    = "settle"
	authHeaderSupported = "supported"
	authHeaderList      = "list"
)

// FacilitatorClient represents a facilitator client for verifying and settling payments
type FacilitatorClient struct {
	URL               string
	HTTPClient        *http.Client
	CreateAuthHeaders func() (map[string]map[string]string, error)
}

// NewFacilitatorClient creates a new facilitator client
func NewFacilitatorClient(config *types.FacilitatorConfig) *FacilitatorClient {
	if config == nil {
		config = &types.FacilitatorConfig{
			URL: DefaultFacilitatorURL,
		}
	}

	httpCli := &http.Client{}
	if config.Timeout != nil {
		httpCli.Timeout = config.Timeout()
	}

	return &FacilitatorClient{
		URL:               config.URL,
		HTTPClient:        httpCli,
		CreateAuthHeaders: config.CreateAuthHeaders,
	}
}

// Verify sends a payment verification request to the facilitator.
//
// Reference: https://github.com/coinbase/x402/blob/3bd4ba0d5c94bdcde03c22f9156c5425d9eba4c6/specs/x402-specification.md#L261
func (c *FacilitatorClient) Verify(payload *types.PaymentPayload, requirements *types.PaymentRequirements) (*types.VerifyResponse, error) {
	reqBody := map[string]any{
		"x402Version":         1,
		"paymentPayload":      payload,
		"paymentRequirements": requirements,
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request body: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, fmt.Sprintf("%s/verify", c.URL), bytes.NewBuffer(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set(headerContentType, mimeApplicationJSON)

	// Add auth headers if available
	if err := c.addAuthHeader(req, authHeaderVerify); err != nil {
		return nil, fmt.Errorf("failed to apply verify auth headers: %w", err)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send verify request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to verify payment: %s", resp.Status)
	}

	var verifyResp types.VerifyResponse
	if err := json.NewDecoder(resp.Body).Decode(&verifyResp); err != nil {
		return nil, fmt.Errorf("failed to decode verify response: %w", err)
	}

	return &verifyResp, nil
}

// Settle sends a payment settlement request to the facilitator.
//
// Reference: https://github.com/coinbase/x402/blob/3bd4ba0d5c94bdcde03c22f9156c5425d9eba4c6/specs/x402-specification.md#L335
func (c *FacilitatorClient) Settle(payload *types.PaymentPayload, requirements *types.PaymentRequirements) (*types.SettleResponse, error) {
	reqBody := map[string]any{
		"x402Version":         1,
		"paymentPayload":      payload,
		"paymentRequirements": requirements,
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request body: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, fmt.Sprintf("%s/settle", c.URL), bytes.NewBuffer(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set(headerContentType, mimeApplicationJSON)

	// Add auth headers if available
	if err := c.addAuthHeader(req, authHeaderSettle); err != nil {
		return nil, fmt.Errorf("failed to apply settle auth headers: %w", err)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send settle request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to settle payment: %s", resp.Status)
	}

	var settleResp types.SettleResponse
	if err := json.NewDecoder(resp.Body).Decode(&settleResp); err != nil {
		return nil, fmt.Errorf("failed to decode settle response: %w", err)
	}

	return &settleResp, nil
}

// Supported retrieves the list of payment kinds supported by the facilitator.
//
// Reference: https://github.com/coinbase/x402/blob/3bd4ba0d5c94bdcde03c22f9156c5425d9eba4c6/specs/x402-specification.md#L364
func (c *FacilitatorClient) Supported() (*types.SupportedPaymentKindsResponse, error) {
	req, err := http.NewRequest(http.MethodGet, fmt.Sprintf("%s/supported", c.URL), nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create supported request: %w", err)
	}
	req.Header.Set(headerContentType, mimeApplicationJSON)

	if err := c.addAuthHeader(req, authHeaderSupported); err != nil {
		return nil, fmt.Errorf("failed to apply supported auth headers: %w", err)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send supported request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to get supported payment kinds: %s", resp.Status)
	}

	var supportedResp types.SupportedPaymentKindsResponse
	if err := json.NewDecoder(resp.Body).Decode(&supportedResp); err != nil {
		return nil, fmt.Errorf("failed to decode supported response: %w", err)
	}

	return &supportedResp, nil
}

// ListDiscoveryResources retrieves discoverable facilitator resources. Authentication relies on
// the optional "list" auth header when CreateAuthHeaders provides one, matching the TypeScript
// client behavior.
//
// Reference: https://github.com/coinbase/x402/blob/3bd4ba0d5c94bdcde03c22f9156c5425d9eba4c6/specs/x402-specification.md#L408
func (c *FacilitatorClient) ListDiscoveryResources(request *types.ListDiscoveryResourcesRequest) (*types.ListDiscoveryResourcesResponse, error) {
	endpoint := fmt.Sprintf("%s/discovery/resources", c.URL)

	if encoded := encodeDiscoveryQuery(request); encoded != "" {
		endpoint = fmt.Sprintf("%s?%s", endpoint, encoded)
	}

	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create discovery request: %w", err)
	}
	req.Header.Set(headerContentType, mimeApplicationJSON)

	if err := c.addAuthHeader(req, authHeaderList); err != nil {
		return nil, fmt.Errorf("failed to apply discovery auth headers: %w", err)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send discovery request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to list discovery resources: %s", resp.Status)
	}

	var discoveryResp types.ListDiscoveryResourcesResponse
	if err := json.NewDecoder(resp.Body).Decode(&discoveryResp); err != nil {
		return nil, fmt.Errorf("failed to decode discovery response: %w", err)
	}

	return &discoveryResp, nil
}

func (c *FacilitatorClient) addAuthHeader(req *http.Request, key string) error {
	if c.CreateAuthHeaders == nil {
		return nil
	}

	headers, err := c.CreateAuthHeaders()
	if err != nil {
		return fmt.Errorf("create auth headers: %w", err)
	}

	actionHeaders, ok := headers[key]
	if !ok {
		return nil
	}

	for headerKey, value := range actionHeaders {
		req.Header.Set(headerKey, value)
	}

	return nil
}

func encodeDiscoveryQuery(req *types.ListDiscoveryResourcesRequest) string {
	if req == nil {
		return ""
	}

	values := url.Values{}

	if req.Type != nil && *req.Type != "" {
		values.Set("type", *req.Type)
	}
	if req.Limit != nil {
		values.Set("limit", strconv.Itoa(*req.Limit))
	}
	if req.Offset != nil {
		values.Set("offset", strconv.Itoa(*req.Offset))
	}

	return values.Encode()
}

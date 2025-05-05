package facilitatorclient

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/coinbase/x402/go/pkg/types"
)

// DefaultFacilitatorURL is the default URL for the x402 facilitator service
const DefaultFacilitatorURL = "https://x402.org/facilitator"

// FacilitatorClient represents a facilitator client for verifying and settling payments
type FacilitatorClient struct {
	URL        string
	HTTPClient *http.Client
}

// NewFacilitatorClient creates a new facilitator client
func NewFacilitatorClient(url string) *FacilitatorClient {
	if url == "" {
		url = DefaultFacilitatorURL
	}
	return &FacilitatorClient{
		URL:        url,
		HTTPClient: http.DefaultClient,
	}
}

// Verify sends a payment verification request to the facilitator
func (c *FacilitatorClient) Verify(payload *types.PaymentPayload, requirements *types.PaymentRequirements) (*types.VerifyResponse, error) {
	reqBody := map[string]any{
		"paymentPayload":      payload,
		"paymentRequirements": requirements,
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request body: %w", err)
	}

	req, err := http.NewRequest("POST", fmt.Sprintf("%s/verify", c.URL), bytes.NewBuffer(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

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

// Settle sends a payment settlement request to the facilitator
func (c *FacilitatorClient) Settle(payload *types.PaymentPayload, requirements *types.PaymentRequirements) (*types.SettleResponse, error) {
	reqBody := map[string]any{
		"paymentPayload":      payload,
		"paymentRequirements": requirements,
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request body: %w", err)
	}

	req, err := http.NewRequest("POST", fmt.Sprintf("%s/settle", c.URL), bytes.NewBuffer(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

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

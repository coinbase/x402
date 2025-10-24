package types

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"time"
)

// PaymentRequirements represents the payment requirements for a resource
type PaymentRequirements struct {
	Scheme            string           `json:"scheme"`
	Network           string           `json:"network"`
	MaxAmountRequired string           `json:"maxAmountRequired"`
	Resource          string           `json:"resource"`
	Description       string           `json:"description"`
	MimeType          string           `json:"mimeType"`
	PayTo             string           `json:"payTo"`
	MaxTimeoutSeconds int              `json:"maxTimeoutSeconds"`
	Asset             string           `json:"asset"`
	OutputSchema      *json.RawMessage `json:"outputSchema,omitempty"`
	Extra             *json.RawMessage `json:"extra,omitempty"`
}

// ListDiscoveryResourcesRequest represents query parameters accepted by /discovery/resources.
type ListDiscoveryResourcesRequest struct {
	Type   *string `json:"type,omitempty"`
	Limit  *int    `json:"limit,omitempty"`
	Offset *int    `json:"offset,omitempty"`
}

// SupportedPaymentKind mirrors the facilitator supported payment kind payload.
type SupportedPaymentKind struct {
	X402Version int            `json:"x402Version"`
	Scheme      string         `json:"scheme"`
	Network     string         `json:"network"`
	Extra       map[string]any `json:"extra,omitempty"`
}

// SupportedPaymentKindsResponse is returned by the facilitator /supported endpoint.
type SupportedPaymentKindsResponse struct {
	Kinds []SupportedPaymentKind `json:"kinds"`
}

// DiscoveredResource models a facilitator discovery resource entry.
type DiscoveredResource struct {
	Resource    string                `json:"resource"`
	Type        string                `json:"type"`
	X402Version int                   `json:"x402Version"`
	Accepts     []PaymentRequirements `json:"accepts"`
	LastUpdated int64                 `json:"lastUpdated"`
	Metadata    map[string]any        `json:"metadata,omitempty"`
}

// ListDiscoveryPagination captures pagination metadata for discovery listings.
type ListDiscoveryPagination struct {
	Limit  int `json:"limit"`
	Offset int `json:"offset"`
	Total  int `json:"total"`
}

// ListDiscoveryResourcesResponse represents the facilitator /discovery/resources response.
type ListDiscoveryResourcesResponse struct {
	X402Version int                     `json:"x402Version"`
	Items       []DiscoveredResource    `json:"items"`
	Pagination  ListDiscoveryPagination `json:"pagination"`
}

// PaymentPayload represents the decoded payment payload for a client's payment
type PaymentPayload struct {
	X402Version int              `json:"x402Version"`
	Scheme      string           `json:"scheme"`
	Network     string           `json:"network"`
	Payload     *ExactEvmPayload `json:"payload"`
}

// ExactEvmPayloadAuthorization represents the payload for an exact EVM payment
type ExactEvmPayload struct {
	Signature     string                        `json:"signature"`
	Authorization *ExactEvmPayloadAuthorization `json:"authorization"`
}

// ExactEvmPayloadAuthorization represents the payload for an exact EVM payment ERC-3009
// authorization EIP-712 typed data message
type ExactEvmPayloadAuthorization struct {
	From        string `json:"from"`
	To          string `json:"to"`
	Value       string `json:"value"`
	ValidAfter  string `json:"validAfter"`
	ValidBefore string `json:"validBefore"`
	Nonce       string `json:"nonce"`
}

// VerifyResponse represents the response from the verify endpoint
type VerifyResponse struct {
	IsValid       bool    `json:"isValid"`
	InvalidReason *string `json:"invalidReason,omitempty"`
	Payer         *string `json:"payer,omitempty"`
}

// SettleResponse represents the response from the settle endpoint
type SettleResponse struct {
	Success     bool    `json:"success"`
	ErrorReason *string `json:"errorReason,omitempty"`
	Transaction string  `json:"transaction"`
	Network     string  `json:"network"`
	Payer       *string `json:"payer,omitempty"`
}

func (s *SettleResponse) EncodeToBase64String() (string, error) {
	jsonBytes, err := json.Marshal(s)
	if err != nil {
		return "", fmt.Errorf("failed to base64 encode the settle response: %w", err)
	}

	return base64.StdEncoding.EncodeToString(jsonBytes), nil
}

// DecodePaymentPayloadFromBase64 decodes a base64 encoded string into a PaymentPayload
func DecodePaymentPayloadFromBase64(encoded string) (*PaymentPayload, error) {
	decodedBytes, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("failed to decode base64 string: %w", err)
	}

	var payload PaymentPayload
	if err := json.Unmarshal(decodedBytes, &payload); err != nil {
		return nil, fmt.Errorf("failed to unmarshal payment payload: %w", err)
	}

	// Set the x402Version after decoding, matching the TypeScript behavior
	payload.X402Version = 1

	return &payload, nil
}

// SetUSDCInfo sets the USDC token information in the Extra field of PaymentRequirements
func (p *PaymentRequirements) SetUSDCInfo(isTestnet bool) error {
	usdcInfo := map[string]any{
		"name":    "USDC",
		"version": "2",
	}

	if !isTestnet {
		usdcInfo["name"] = "USD Coin"
	}

	jsonBytes, err := json.Marshal(usdcInfo)
	if err != nil {
		return fmt.Errorf("failed to marshal USDC info: %w", err)
	}

	rawMessage := json.RawMessage(jsonBytes)
	p.Extra = &rawMessage
	return nil
}

// FacilitatorConfig represents configuration for the facilitator service.
// CreateAuthHeaders must return a map keyed by facilitator operation names:
//
//	verify, settle, supported, list. Implementations may omit keys when no
//	authentication is required for a specific operation.
type FacilitatorConfig struct {
	URL               string
	Timeout           func() time.Duration
	CreateAuthHeaders func() (map[string]map[string]string, error)
}

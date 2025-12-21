package types

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"time"
)

// PaymentRequirements represents the payment requirements for a resource
type PaymentRequirements struct {
	// Core x402 protocol fields
	Scheme            string `json:"scheme"`
	Network           string `json:"network"`
	MaxAmountRequired string `json:"maxAmountRequired"`
	Resource          string `json:"resource"`
	Description       string `json:"description,omitempty"`
	MimeType          string `json:"mimeType,omitempty"`
	PayTo             string `json:"payTo"`
	MaxTimeoutSeconds int    `json:"maxTimeoutSeconds,omitempty"`
	Asset             string `json:"asset"`

	// Cross-token payment fields (AnySpend extension)
	SrcTokenAddress   string `json:"srcTokenAddress,omitempty"`
	SrcNetwork        string `json:"srcNetwork,omitempty"`
	SrcAmountRequired string `json:"srcAmountRequired,omitempty"`

	// Extra contains token EIP-712 domain info for signature creation
	Extra *PaymentExtra `json:"extra,omitempty"`

	// OutputSchema contains discovery extension fields in the same format as TypeScript SDK.
	// The facilitator expects: outputSchema.input.discoverable, outputSchema.metadata, etc.
	OutputSchema *OutputSchema `json:"outputSchema,omitempty"`
}

// OutputSchema contains the request/response structure for discovery.
// This matches the TypeScript SDK format used by express middleware.
type OutputSchema struct {
	Input           *OutputSchemaInput         `json:"input,omitempty"`
	Output          any                        `json:"output,omitempty"`
	DiscoveryOutput *DiscoverySchemaDefinition `json:"discoveryOutput,omitempty"`
	Metadata        *DiscoveryMetadata         `json:"metadata,omitempty"`
}

// OutputSchemaInput contains input schema and discovery flag.
type OutputSchemaInput struct {
	Type           string                     `json:"type,omitempty"`   // e.g., "http"
	Method         string                     `json:"method,omitempty"` // e.g., "POST"
	Discoverable   bool                       `json:"discoverable,omitempty"`
	DiscoveryInput *DiscoverySchemaDefinition `json:"discoveryInput,omitempty"`
}

// PaymentExtra contains additional token metadata required for EIP-712 signature verification.
// This is populated from token metadata API or facilitator quote response.
type PaymentExtra struct {
	// Name is the ERC20 token name (used in EIP-712 domain)
	Name string `json:"name,omitempty"`
	// Version is the ERC20 token version (used in EIP-712 domain)
	Version string `json:"version,omitempty"`
	// SignatureType specifies the signature method: "authorization" (EIP-3009) or "permit" (ERC-2612)
	SignatureType string `json:"signatureType,omitempty"`
	// ChainID is the chain ID for EIP-712 domain (from quote)
	ChainID int `json:"chainId,omitempty"`
	// VerifyingContract is the token contract address for EIP-712 domain (from quote)
	VerifyingContract string `json:"verifyingContract,omitempty"`
	// FacilitatorAddress is the facilitator's address that will be approved as spender
	FacilitatorAddress string `json:"facilitatorAddress,omitempty"`
}

// PaymentPayload represents the decoded payment payload for a client's payment.
// The Payload field is generic to support both EIP-3009 (authorization) and ERC-2612 (permit).
type PaymentPayload struct {
	X402Version int            `json:"x402Version"`
	Scheme      string         `json:"scheme"`
	Network     string         `json:"network"`
	Payload     map[string]any `json:"payload"` // Generic for both authorization & permit
}

// PaymentPayloadTyped represents the decoded payment payload with typed EVM payload.
// Use this when you need to access specific fields of the authorization payload.
type PaymentPayloadTyped struct {
	X402Version int              `json:"x402Version"`
	Scheme      string           `json:"scheme"`
	Network     string           `json:"network"`
	Payload     *ExactEvmPayload `json:"payload"`
}

// ExactEvmPayload represents the payload for an exact EVM payment
type ExactEvmPayload struct {
	Signature     string                        `json:"signature"`
	Authorization *ExactEvmPayloadAuthorization `json:"authorization,omitempty"`
	Permit        *ExactEvmPayloadPermit        `json:"permit,omitempty"`
}

// ExactEvmPayloadAuthorization represents the payload for an exact EVM payment ERC-3009
// authorization EIP-712 typed data message (used by USDC)
type ExactEvmPayloadAuthorization struct {
	From        string `json:"from"`
	To          string `json:"to"`
	Value       string `json:"value"`
	ValidAfter  string `json:"validAfter"`
	ValidBefore string `json:"validBefore"`
	Nonce       string `json:"nonce"`
}

// ExactEvmPayloadPermit represents the payload for an ERC-2612 permit
// EIP-712 typed data message (used by tokens like B3)
type ExactEvmPayloadPermit struct {
	Owner    string `json:"owner"`
	Spender  string `json:"spender"`
	Value    string `json:"value"`
	Nonce    string `json:"nonce"`
	Deadline string `json:"deadline"`
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
func (p *PaymentRequirements) SetUSDCInfo(isTestnet bool) {
	name := "USD Coin"
	if isTestnet {
		name = "USDC"
	}

	p.Extra = &PaymentExtra{
		Name:          name,
		Version:       "2",
		SignatureType: "authorization", // USDC uses EIP-3009
	}
}

// SetTokenInfo sets the token information in the Extra field of PaymentRequirements
func (p *PaymentRequirements) SetTokenInfo(name, version, signatureType string) {
	p.Extra = &PaymentExtra{
		Name:          name,
		Version:       version,
		SignatureType: signatureType,
	}
}

// FacilitatorConfig represents configuration for the facilitator service
type FacilitatorConfig struct {
	URL               string
	Timeout           func() time.Duration
	CreateAuthHeaders func() (map[string]map[string]string, error)
}

// =============================================================================
// Quote Types (AnySpend cross-token payment extension)
// =============================================================================

// QuoteRequest represents the request body for Facilitator /quote endpoint.
// Used when buyer wants to pay with a different token than what seller requires.
type QuoteRequest struct {
	SrcTokenAddress string `json:"srcTokenAddress"`
	DstTokenAddress string `json:"dstTokenAddress"`
	DstAmount       string `json:"dstAmount"`
	SrcNetwork      string `json:"srcNetwork"`
	DstNetwork      string `json:"dstNetwork"`
}

// QuoteDomain contains the EIP-712 domain info from the quote response.
// This is needed for the buyer to create the correct signature.
type QuoteDomain struct {
	Name              string `json:"name"`
	Version           string `json:"version"`
	ChainID           int    `json:"chainId"`
	VerifyingContract string `json:"verifyingContract"`
}

// QuoteData contains the quote data from the facilitator response.
type QuoteData struct {
	PaymentAmount      string       `json:"paymentAmount"`
	DestinationAmount  string       `json:"destinationAmount"`
	FacilitatorAddress string       `json:"facilitatorAddress"`
	SignatureType      string       `json:"signatureType"`
	Domain             *QuoteDomain `json:"domain,omitempty"`
}

// QuoteResponse represents the response from Facilitator /quote endpoint.
type QuoteResponse struct {
	Success bool       `json:"success"`
	Message string     `json:"message"`
	Data    *QuoteData `json:"data,omitempty"`
}

// =============================================================================
// Verify/Settle Request Types
// =============================================================================

// VerifyRequest represents the request body for Facilitator /verify endpoint.
type VerifyRequest struct {
	X402Version         int                  `json:"x402Version"`
	PaymentPayload      *PaymentPayload      `json:"paymentPayload"`
	PaymentRequirements *PaymentRequirements `json:"paymentRequirements"`
}

// SettleRequest represents the request body for Facilitator /settle endpoint.
type SettleRequest struct {
	X402Version         int                  `json:"x402Version"`
	PaymentPayload      *PaymentPayload      `json:"paymentPayload"`
	PaymentRequirements *PaymentRequirements `json:"paymentRequirements"`
}

// =============================================================================
// Facilitator Supported Types
// =============================================================================

// SupportedKind represents a supported scheme-network pair from /supported endpoint.
type SupportedKind struct {
	X402Version int                    `json:"x402Version"`
	Scheme      string                 `json:"scheme"`
	Network     string                 `json:"network"`
	Extra       map[string]interface{} `json:"extra,omitempty"`
}

// SupportedResponse represents the response from Facilitator /supported endpoint.
type SupportedResponse struct {
	Kinds []SupportedKind `json:"kinds"`
}

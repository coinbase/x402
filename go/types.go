package x402

import (
	"encoding/json"
	"fmt"
	"strings"
)

// Network represents a blockchain network identifier in CAIP-2 format
// Format: namespace:reference (e.g., "eip155:1" for Ethereum mainnet)
type Network string

// Parse splits the network into namespace and reference components
func (n Network) Parse() (namespace, reference string, err error) {
	parts := strings.Split(string(n), ":")
	if len(parts) != 2 {
		return "", "", fmt.Errorf("invalid network format: %s", n)
	}
	return parts[0], parts[1], nil
}

// Match checks if this network matches a pattern (supports wildcards)
// e.g., "eip155:1" matches "eip155:*" and "eip155:*" matches "eip155:1"
func (n Network) Match(pattern Network) bool {
	if n == pattern {
		return true
	}

	nStr := string(n)
	patternStr := string(pattern)

	// Check if pattern has wildcard
	if strings.HasSuffix(patternStr, ":*") {
		prefix := strings.TrimSuffix(patternStr, "*")
		return strings.HasPrefix(nStr, prefix)
	}

	// Check if n has wildcard (for bidirectional matching)
	if strings.HasSuffix(nStr, ":*") {
		prefix := strings.TrimSuffix(nStr, "*")
		return strings.HasPrefix(patternStr, prefix)
	}

	return false
}

// Price represents a price that can be specified in various formats
type Price interface{}

// AssetAmount represents an amount of a specific asset
type AssetAmount struct {
	Asset  string                 `json:"asset"`
	Amount string                 `json:"amount"`
	Extra  map[string]interface{} `json:"extra,omitempty"`
}

// PaymentRequirements defines what payment is acceptable for a resource
type PaymentRequirements struct {
	Scheme            string                 `json:"scheme"`
	Network           Network                `json:"network"`
	Asset             string                 `json:"asset"`
	Amount            string                 `json:"amount"`                      // v2 field
	MaxAmountRequired string                 `json:"maxAmountRequired,omitempty"` // v1 compatibility field
	PayTo             string                 `json:"payTo"`
	MaxTimeoutSeconds int                    `json:"maxTimeoutSeconds"`
	Extra             map[string]interface{} `json:"extra,omitempty"`
}

// PartialPaymentPayload contains the minimal payment data from mechanism clients
// This is what SchemeNetworkClient.CreatePaymentPayload returns
type PartialPaymentPayload struct {
	X402Version int                    `json:"x402Version"`
	Payload     map[string]interface{} `json:"payload"`
}

// PaymentPayload contains the signed payment authorization from a client
type PaymentPayload struct {
	X402Version int                    `json:"x402Version"`
	Payload     map[string]interface{} `json:"payload"`
	Accepted    PaymentRequirements    `json:"accepted"`          // V2: scheme/network in accepted
	Scheme      string                 `json:"scheme,omitempty"`  // V1: scheme at top level
	Network     string                 `json:"network,omitempty"` // V1: network at top level
	Resource    *ResourceInfo          `json:"resource,omitempty"`
	Extensions  map[string]interface{} `json:"extensions,omitempty"`
}

// ResourceInfo describes the resource being accessed
type ResourceInfo struct {
	URL         string `json:"url"`
	Description string `json:"description"`
	MimeType    string `json:"mimeType"`
}

// PaymentRequired is the 402 response sent to clients
type PaymentRequired struct {
	X402Version int                    `json:"x402Version"`
	Error       string                 `json:"error,omitempty"`
	Resource    *ResourceInfo          `json:"resource,omitempty"`
	Accepts     []PaymentRequirements  `json:"accepts"`
	Extensions  map[string]interface{} `json:"extensions,omitempty"`
}

// VerifyRequest contains the payment to verify
type VerifyRequest struct {
	PaymentPayload      PaymentPayload      `json:"paymentPayload"`
	PaymentRequirements PaymentRequirements `json:"paymentRequirements"`
}

// VerifyResponse contains the verification result
type VerifyResponse struct {
	IsValid       bool   `json:"isValid"`
	InvalidReason string `json:"invalidReason,omitempty"`
	Payer         string `json:"payer,omitempty"`
}

// SettleRequest contains the payment to settle
type SettleRequest struct {
	PaymentPayload      PaymentPayload      `json:"paymentPayload"`
	PaymentRequirements PaymentRequirements `json:"paymentRequirements"`
}

// SettleResponse contains the settlement result
type SettleResponse struct {
	Success     bool    `json:"success"`
	ErrorReason string  `json:"errorReason,omitempty"`
	Payer       string  `json:"payer,omitempty"`
	Transaction string  `json:"transaction"`
	Network     Network `json:"network"`
}

// SupportedKind represents a single supported payment configuration
type SupportedKind struct {
	X402Version int                    `json:"x402Version"`
	Scheme      string                 `json:"scheme"`
	Network     Network                `json:"network"`
	Extra       map[string]interface{} `json:"extra,omitempty"`
}

// SupportedResponse describes what payment kinds a facilitator supports
type SupportedResponse struct {
	Kinds      []SupportedKind `json:"kinds"`
	Extensions []string        `json:"extensions"`
}

// ResourceConfig defines payment configuration for a protected resource
type ResourceConfig struct {
	Scheme            string  `json:"scheme"`
	PayTo             string  `json:"payTo"`
	Price             Price   `json:"price"`
	Network           Network `json:"network"`
	MaxTimeoutSeconds int     `json:"maxTimeoutSeconds,omitempty"`
}

// DeepEqual performs deep equality check on payment requirements
func DeepEqual(a, b interface{}) bool {
	// Normalize to JSON and compare
	aJSON, err := json.Marshal(a)
	if err != nil {
		return false
	}
	bJSON, err := json.Marshal(b)
	if err != nil {
		return false
	}

	var aNorm, bNorm interface{}
	if err := json.Unmarshal(aJSON, &aNorm); err != nil {
		return false
	}
	if err := json.Unmarshal(bJSON, &bNorm); err != nil {
		return false
	}

	aNormJSON, _ := json.Marshal(aNorm)
	bNormJSON, _ := json.Marshal(bNorm)

	return string(aNormJSON) == string(bNormJSON)
}

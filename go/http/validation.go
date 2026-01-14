package http

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"regexp"

	"github.com/coinbase/x402/go/types"
)

// Base64 regex pattern - requires at least one character
var base64Regex = regexp.MustCompile(`^[A-Za-z0-9+/]+={0,2}$`)

// ValidateAndDecodePaymentHeader validates and decodes a payment header string.
// It performs comprehensive validation of:
// - Base64 format
// - JSON structure
// - Required fields and their types
//
// Returns the decoded PaymentPayload if valid, or an error with a descriptive message.
func ValidateAndDecodePaymentHeader(paymentHeader string) (*types.PaymentPayload, error) {
	// Validate header is not empty
	if paymentHeader == "" {
		return nil, fmt.Errorf("payment header is empty")
	}

	// Validate base64 format
	if !base64Regex.MatchString(paymentHeader) {
		return nil, fmt.Errorf("invalid payment header format: not valid base64")
	}

	// Decode base64
	decoded, err := base64.StdEncoding.DecodeString(paymentHeader)
	if err != nil {
		return nil, fmt.Errorf("invalid payment header format: base64 decoding failed - %v", err)
	}

	// Parse JSON into a map first for validation
	var rawPayload map[string]interface{}
	if err := json.Unmarshal(decoded, &rawPayload); err != nil {
		return nil, fmt.Errorf("invalid payment header format: not valid JSON - %v", err)
	}

	// Validate required top-level fields
	if _, exists := rawPayload["x402Version"]; !exists {
		return nil, fmt.Errorf("missing required field: x402Version")
	}
	if version, ok := rawPayload["x402Version"].(float64); !ok {
		return nil, fmt.Errorf("invalid field type: x402Version must be a number")
	} else if int(version) < 1 {
		return nil, fmt.Errorf("invalid value: x402Version must be at least 1")
	}

	if _, exists := rawPayload["resource"]; !exists {
		return nil, fmt.Errorf("missing required field: resource")
	}
	resourceMap, ok := rawPayload["resource"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid field type: resource must be an object")
	}

	// Validate resource fields
	if _, exists := resourceMap["url"]; !exists {
		return nil, fmt.Errorf("missing required field: resource.url")
	}
	if _, ok := resourceMap["url"].(string); !ok {
		return nil, fmt.Errorf("invalid field type: resource.url must be a string")
	}

	if _, exists := resourceMap["description"]; !exists {
		return nil, fmt.Errorf("missing required field: resource.description")
	}
	if _, ok := resourceMap["description"].(string); !ok {
		return nil, fmt.Errorf("invalid field type: resource.description must be a string")
	}

	if _, exists := resourceMap["mimeType"]; !exists {
		return nil, fmt.Errorf("missing required field: resource.mimeType")
	}
	if _, ok := resourceMap["mimeType"].(string); !ok {
		return nil, fmt.Errorf("invalid field type: resource.mimeType must be a string")
	}

	if _, exists := rawPayload["accepted"]; !exists {
		return nil, fmt.Errorf("missing required field: accepted")
	}
	if _, ok := rawPayload["accepted"].(map[string]interface{}); !ok {
		return nil, fmt.Errorf("invalid field type: accepted must be an object")
	}

	if _, exists := rawPayload["payload"]; !exists {
		return nil, fmt.Errorf("missing required field: payload")
	}
	if _, ok := rawPayload["payload"].(map[string]interface{}); !ok {
		return nil, fmt.Errorf("invalid field type: payload must be an object")
	}

	// If all validations pass, unmarshal into the PaymentPayload struct
	var payload types.PaymentPayload
	if err := json.Unmarshal(decoded, &payload); err != nil {
		return nil, fmt.Errorf("failed to parse payment payload: %v", err)
	}

	return &payload, nil
}

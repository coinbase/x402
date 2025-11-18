package types

import "encoding/json"

// PaymentPayloadV2 represents a v2 payment payload structure
// V2 has accepted field with nested scheme/network/requirements
type PaymentPayloadV2 struct {
	X402Version int                    `json:"x402Version"`
	Payload     map[string]interface{} `json:"payload"`
	Accepted    PaymentRequirementsV2  `json:"accepted"`
	Resource    *ResourceInfoV2        `json:"resource,omitempty"`
	Extensions  map[string]interface{} `json:"extensions,omitempty"`
}

// PaymentRequirementsV2 represents v2 payment requirements structure
type PaymentRequirementsV2 struct {
	Scheme            string                 `json:"scheme"`
	Network           string                 `json:"network"`
	Asset             string                 `json:"asset"`
	Amount            string                 `json:"amount"`
	PayTo             string                 `json:"payTo"`
	MaxTimeoutSeconds int                    `json:"maxTimeoutSeconds,omitempty"`
	Extra             map[string]interface{} `json:"extra,omitempty"`
}

// PaymentRequiredV2 represents a v2 402 response structure
type PaymentRequiredV2 struct {
	X402Version int                     `json:"x402Version"`
	Error       string                  `json:"error,omitempty"`
	Resource    *ResourceInfoV2         `json:"resource,omitempty"`
	Accepts     []PaymentRequirementsV2 `json:"accepts"`
	Extensions  map[string]interface{}  `json:"extensions,omitempty"`
}

// ResourceInfoV2 describes the resource being accessed
type ResourceInfoV2 struct {
	URL         string `json:"url"`
	Description string `json:"description,omitempty"`
	MimeType    string `json:"mimeType,omitempty"`
}

// Unmarshal helpers

// ToPaymentPayloadV2 unmarshals bytes to v2 payment payload
func ToPaymentPayloadV2(data []byte) (*PaymentPayloadV2, error) {
	var payload PaymentPayloadV2
	if err := json.Unmarshal(data, &payload); err != nil {
		return nil, err
	}
	return &payload, nil
}

// ToPaymentRequirementsV2 unmarshals bytes to v2 payment requirements
func ToPaymentRequirementsV2(data []byte) (*PaymentRequirementsV2, error) {
	var requirements PaymentRequirementsV2
	if err := json.Unmarshal(data, &requirements); err != nil {
		return nil, err
	}
	return &requirements, nil
}

// ToPaymentRequiredV2 unmarshals bytes to v2 payment required response
func ToPaymentRequiredV2(data []byte) (*PaymentRequiredV2, error) {
	var required PaymentRequiredV2
	if err := json.Unmarshal(data, &required); err != nil {
		return nil, err
	}
	return &required, nil
}

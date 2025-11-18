package types

import "encoding/json"

// PaymentPayloadV1 represents a v1 payment payload structure
// V1 has scheme and network at top level (not in accepted field)
type PaymentPayloadV1 struct {
	X402Version int                    `json:"x402Version"`
	Scheme      string                 `json:"scheme"`
	Network     string                 `json:"network"`
	Payload     map[string]interface{} `json:"payload"`
}

// PaymentRequirementsV1 represents v1 payment requirements structure
type PaymentRequirementsV1 struct {
	Scheme            string           `json:"scheme"`
	Network           string           `json:"network"`
	MaxAmountRequired string           `json:"maxAmountRequired"`
	Resource          string           `json:"resource"`
	Description       string           `json:"description,omitempty"`
	MimeType          string           `json:"mimeType,omitempty"`
	PayTo             string           `json:"payTo"`
	MaxTimeoutSeconds int              `json:"maxTimeoutSeconds"`
	Asset             string           `json:"asset"`
	OutputSchema      *json.RawMessage `json:"outputSchema,omitempty"`
	Extra             *json.RawMessage `json:"extra,omitempty"`
}

// PaymentRequiredV1 represents a v1 402 response structure
type PaymentRequiredV1 struct {
	X402Version int                     `json:"x402Version"`
	Error       string                  `json:"error,omitempty"`
	Accepts     []PaymentRequirementsV1 `json:"accepts"`
}

// Unmarshal helpers

// ToPaymentPayloadV1 unmarshals bytes to v1 payment payload
func ToPaymentPayloadV1(data []byte) (*PaymentPayloadV1, error) {
	var payload PaymentPayloadV1
	if err := json.Unmarshal(data, &payload); err != nil {
		return nil, err
	}
	return &payload, nil
}

// ToPaymentRequirementsV1 unmarshals bytes to v1 payment requirements
func ToPaymentRequirementsV1(data []byte) (*PaymentRequirementsV1, error) {
	var requirements PaymentRequirementsV1
	if err := json.Unmarshal(data, &requirements); err != nil {
		return nil, err
	}
	return &requirements, nil
}

// ToPaymentRequiredV1 unmarshals bytes to v1 payment required response
func ToPaymentRequiredV1(data []byte) (*PaymentRequiredV1, error) {
	var required PaymentRequiredV1
	if err := json.Unmarshal(data, &required); err != nil {
		return nil, err
	}
	return &required, nil
}

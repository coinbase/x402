package x402

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
)

// PaymentDetails represents the payment requirements for a resource
type PaymentDetails struct {
	Scheme                  string           `json:"scheme"`
	NetworkID               string           `json:"networkId"`
	MaxAmountRequired       *big.Int         `json:"maxAmountRequired"`
	Resource                string           `json:"resource"`
	Description             string           `json:"description"`
	MimeType                string           `json:"mimeType"`
	PayToAddress            string           `json:"payToAddress"`
	RequiredDeadlineSeconds int              `json:"requiredDeadlineSeconds"`
	USDCAddress             string           `json:"usdcAddress"`
	OutputSchema            *json.RawMessage `json:"outputSchema"`
	Extra                   *json.RawMessage `json:"extra"`
}

// VerifyResponse represents the response from the verify endpoint
type VerifyResponse struct {
	IsValid       bool   `json:"isValid"`
	InvalidReason string `json:"invalidReason"`
	PayerAddress  string `json:"payerAddress"`
}

// SettleResponse represents the response from the settle endpoint
type SettleResponse struct {
	Success   bool   `json:"success"`
	Error     string `json:"error"`
	TxHash    string `json:"txHash"`
	NetworkID string `json:"networkId"`
}

func (s *SettleResponse) EncodeToBase64String() (string, error) {
	jsonBytes, err := json.Marshal(s)
	if err != nil {
		return "", fmt.Errorf("failed to base64 encode the settle response: %w", err)
	}

	return base64.StdEncoding.EncodeToString(jsonBytes), nil
}

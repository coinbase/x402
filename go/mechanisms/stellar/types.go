package stellar

import (
	"encoding/json"
	"fmt"
)

// ExactStellarPayload represents a Stellar payment payload
type ExactStellarPayload struct {
	Transaction string `json:"transaction"` // Base64 encoded signed XDR envelope
}

// ToMap converts an ExactStellarPayload to a map for JSON marshaling
func (p *ExactStellarPayload) ToMap() map[string]interface{} {
	return map[string]interface{}{
		"transaction": p.Transaction,
	}
}

// PayloadFromMap creates an ExactStellarPayload from a map
func PayloadFromMap(data map[string]interface{}) (*ExactStellarPayload, error) {
	jsonBytes, err := json.Marshal(data)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload data: %w", err)
	}

	var payload ExactStellarPayload
	if err := json.Unmarshal(jsonBytes, &payload); err != nil {
		return nil, fmt.Errorf("failed to unmarshal payload: %w", err)
	}

	if payload.Transaction == "" {
		return nil, fmt.Errorf("missing transaction field in payload")
	}

	return &payload, nil
}

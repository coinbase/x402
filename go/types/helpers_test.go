package types

import (
	"encoding/json"
	"testing"
)

// ---- GetSchemeAndNetwork ----

func TestGetSchemeAndNetwork_V1_Valid(t *testing.T) {
	payload := map[string]interface{}{
		"scheme":  "exact",
		"network": "eip155:8453",
	}
	data, _ := json.Marshal(payload)

	scheme, network, err := GetSchemeAndNetwork(1, data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if scheme != "exact" {
		t.Errorf("expected scheme 'exact', got %q", scheme)
	}
	if network != "eip155:8453" {
		t.Errorf("expected network 'eip155:8453', got %q", network)
	}
}

func TestGetSchemeAndNetwork_V2_Valid(t *testing.T) {
	payload := map[string]interface{}{
		"accepted": map[string]interface{}{
			"scheme":  "upto",
			"network": "eip155:84532",
		},
	}
	data, _ := json.Marshal(payload)

	scheme, network, err := GetSchemeAndNetwork(2, data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if scheme != "upto" {
		t.Errorf("expected scheme 'upto', got %q", scheme)
	}
	if network != "eip155:84532" {
		t.Errorf("expected network 'eip155:84532', got %q", network)
	}
}

func TestGetSchemeAndNetwork_V1_MissingFields(t *testing.T) {
	// Missing scheme and network should return empty strings (not an error)
	payload := map[string]interface{}{"other": "value"}
	data, _ := json.Marshal(payload)

	scheme, network, err := GetSchemeAndNetwork(1, data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if scheme != "" {
		t.Errorf("expected empty scheme, got %q", scheme)
	}
	if network != "" {
		t.Errorf("expected empty network, got %q", network)
	}
}

func TestGetSchemeAndNetwork_V1_MalformedJSON(t *testing.T) {
	_, _, err := GetSchemeAndNetwork(1, []byte(`{bad json`))
	if err == nil {
		t.Fatal("expected error for malformed JSON")
	}
}

func TestGetSchemeAndNetwork_V2_MalformedJSON(t *testing.T) {
	_, _, err := GetSchemeAndNetwork(2, []byte(`{bad json`))
	if err == nil {
		t.Fatal("expected error for malformed JSON")
	}
}

func TestGetSchemeAndNetwork_UnsupportedVersion(t *testing.T) {
	_, _, err := GetSchemeAndNetwork(99, []byte(`{}`))
	if err == nil {
		t.Fatal("expected error for unsupported version")
	}
}

func TestGetSchemeAndNetwork_V2_MissingAccepted(t *testing.T) {
	// V2 payload without accepted field should return empty strings
	payload := map[string]interface{}{"other": "value"}
	data, _ := json.Marshal(payload)

	scheme, network, err := GetSchemeAndNetwork(2, data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if scheme != "" {
		t.Errorf("expected empty scheme, got %q", scheme)
	}
	if network != "" {
		t.Errorf("expected empty network, got %q", network)
	}
}

// ---- MatchPayloadToRequirements ----

func TestMatchPayloadToRequirements_V1_Match(t *testing.T) {
	payload := map[string]interface{}{
		"scheme":  "exact",
		"network": "eip155:8453",
	}
	requirements := map[string]interface{}{
		"scheme":  "exact",
		"network": "eip155:8453",
	}
	payloadBytes, _ := json.Marshal(payload)
	requirementsBytes, _ := json.Marshal(requirements)

	matched, err := MatchPayloadToRequirements(1, payloadBytes, requirementsBytes)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !matched {
		t.Error("expected match but got no match")
	}
}

func TestMatchPayloadToRequirements_V1_SchemeMismatch(t *testing.T) {
	payload := map[string]interface{}{
		"scheme":  "upto",
		"network": "eip155:8453",
	}
	requirements := map[string]interface{}{
		"scheme":  "exact",
		"network": "eip155:8453",
	}
	payloadBytes, _ := json.Marshal(payload)
	requirementsBytes, _ := json.Marshal(requirements)

	matched, err := MatchPayloadToRequirements(1, payloadBytes, requirementsBytes)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if matched {
		t.Error("expected no match due to scheme mismatch")
	}
}

func TestMatchPayloadToRequirements_V1_NetworkMismatch(t *testing.T) {
	payload := map[string]interface{}{
		"scheme":  "exact",
		"network": "eip155:84532",
	}
	requirements := map[string]interface{}{
		"scheme":  "exact",
		"network": "eip155:8453",
	}
	payloadBytes, _ := json.Marshal(payload)
	requirementsBytes, _ := json.Marshal(requirements)

	matched, err := MatchPayloadToRequirements(1, payloadBytes, requirementsBytes)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if matched {
		t.Error("expected no match due to network mismatch")
	}
}

func TestMatchPayloadToRequirements_V2_Match(t *testing.T) {
	payload := map[string]interface{}{
		"accepted": map[string]interface{}{
			"scheme":  "exact",
			"network": "eip155:8453",
			"amount":  "1000000",
			"asset":   "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
			"payTo":   "0x1234567890123456789012345678901234567890",
		},
	}
	requirements := map[string]interface{}{
		"scheme":  "exact",
		"network": "eip155:8453",
		"amount":  "1000000",
		"asset":   "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
		"payTo":   "0x1234567890123456789012345678901234567890",
	}
	payloadBytes, _ := json.Marshal(payload)
	requirementsBytes, _ := json.Marshal(requirements)

	matched, err := MatchPayloadToRequirements(2, payloadBytes, requirementsBytes)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !matched {
		t.Error("expected match but got no match")
	}
}

func TestMatchPayloadToRequirements_V2_AmountMismatch(t *testing.T) {
	payload := map[string]interface{}{
		"accepted": map[string]interface{}{
			"scheme":  "exact",
			"network": "eip155:8453",
			"amount":  "2000000",
			"asset":   "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
			"payTo":   "0x1234567890123456789012345678901234567890",
		},
	}
	requirements := map[string]interface{}{
		"scheme":  "exact",
		"network": "eip155:8453",
		"amount":  "1000000",
		"asset":   "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
		"payTo":   "0x1234567890123456789012345678901234567890",
	}
	payloadBytes, _ := json.Marshal(payload)
	requirementsBytes, _ := json.Marshal(requirements)

	matched, err := MatchPayloadToRequirements(2, payloadBytes, requirementsBytes)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if matched {
		t.Error("expected no match due to amount mismatch")
	}
}

func TestMatchPayloadToRequirements_V2_PayToMismatch(t *testing.T) {
	payload := map[string]interface{}{
		"accepted": map[string]interface{}{
			"scheme":  "exact",
			"network": "eip155:8453",
			"amount":  "1000000",
			"asset":   "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
			"payTo":   "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
		},
	}
	requirements := map[string]interface{}{
		"scheme":  "exact",
		"network": "eip155:8453",
		"amount":  "1000000",
		"asset":   "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
		"payTo":   "0x1234567890123456789012345678901234567890",
	}
	payloadBytes, _ := json.Marshal(payload)
	requirementsBytes, _ := json.Marshal(requirements)

	matched, err := MatchPayloadToRequirements(2, payloadBytes, requirementsBytes)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if matched {
		t.Error("expected no match due to payTo mismatch")
	}
}

func TestMatchPayloadToRequirements_V1_MalformedPayload(t *testing.T) {
	requirements := map[string]interface{}{
		"scheme":  "exact",
		"network": "eip155:8453",
	}
	requirementsBytes, _ := json.Marshal(requirements)

	_, err := MatchPayloadToRequirements(1, []byte(`{bad`), requirementsBytes)
	if err == nil {
		t.Fatal("expected error for malformed payload JSON")
	}
}

func TestMatchPayloadToRequirements_V1_MalformedRequirements(t *testing.T) {
	payload := map[string]interface{}{
		"scheme":  "exact",
		"network": "eip155:8453",
	}
	payloadBytes, _ := json.Marshal(payload)

	_, err := MatchPayloadToRequirements(1, payloadBytes, []byte(`{bad`))
	if err == nil {
		t.Fatal("expected error for malformed requirements JSON")
	}
}

func TestMatchPayloadToRequirements_V2_MalformedPayload(t *testing.T) {
	requirements := map[string]interface{}{
		"scheme":  "exact",
		"network": "eip155:8453",
	}
	requirementsBytes, _ := json.Marshal(requirements)

	_, err := MatchPayloadToRequirements(2, []byte(`{bad`), requirementsBytes)
	if err == nil {
		t.Fatal("expected error for malformed payload JSON")
	}
}

func TestMatchPayloadToRequirements_V2_MalformedRequirements(t *testing.T) {
	payload := map[string]interface{}{
		"accepted": map[string]interface{}{
			"scheme":  "exact",
			"network": "eip155:8453",
		},
	}
	payloadBytes, _ := json.Marshal(payload)

	_, err := MatchPayloadToRequirements(2, payloadBytes, []byte(`{bad`))
	if err == nil {
		t.Fatal("expected error for malformed requirements JSON")
	}
}

func TestMatchPayloadToRequirements_UnsupportedVersion(t *testing.T) {
	_, err := MatchPayloadToRequirements(99, []byte(`{}`), []byte(`{}`))
	if err == nil {
		t.Fatal("expected error for unsupported version")
	}
}

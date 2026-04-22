package types

import (
	"encoding/json"
	"testing"
)

// ============================================================
// V1 unmarshal helpers
// ============================================================

func TestToPaymentPayloadV1(t *testing.T) {
	tests := []struct {
		name    string
		data    []byte
		wantErr bool
		check   func(*testing.T, *PaymentPayloadV1)
	}{
		{
			name: "valid v1 payload",
			data: []byte(`{
				"x402Version": 1,
				"scheme": "exact",
				"network": "eip155:8453",
				"payload": {"signature": "0xabc", "nonce": "0x1"}
			}`),
			check: func(t *testing.T, p *PaymentPayloadV1) {
				if p.X402Version != 1 {
					t.Errorf("X402Version = %d, want 1", p.X402Version)
				}
				if p.Scheme != "exact" {
					t.Errorf("Scheme = %q, want exact", p.Scheme)
				}
				if p.Network != "eip155:8453" {
					t.Errorf("Network = %q, want eip155:8453", p.Network)
				}
				if p.Payload["signature"] != "0xabc" {
					t.Errorf("Payload[signature] = %v, want 0xabc", p.Payload["signature"])
				}
			},
		},
		{
			name: "empty payload field",
			data: []byte(`{"x402Version": 1, "scheme": "exact", "network": "eip155:8453"}`),
			check: func(t *testing.T, p *PaymentPayloadV1) {
				if p.Payload != nil {
					t.Errorf("expected nil payload, got %v", p.Payload)
				}
			},
		},
		{
			name:    "invalid JSON",
			data:    []byte(`{bad json`),
			wantErr: true,
		},
		{
			name:    "empty bytes",
			data:    []byte{},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ToPaymentPayloadV1(tt.data)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ToPaymentPayloadV1() err = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && tt.check != nil {
				tt.check(t, got)
			}
		})
	}
}

func TestToPaymentRequirementsV1(t *testing.T) {
	tests := []struct {
		name    string
		data    []byte
		wantErr bool
		check   func(*testing.T, *PaymentRequirementsV1)
	}{
		{
			name: "valid requirements",
			data: []byte(`{
				"scheme": "exact",
				"network": "eip155:8453",
				"maxAmountRequired": "1000000",
				"resource": "https://api.example.com/data",
				"payTo": "0xRecipient",
				"maxTimeoutSeconds": 300,
				"asset": "0xUSDC"
			}`),
			check: func(t *testing.T, r *PaymentRequirementsV1) {
				if r.Scheme != "exact" {
					t.Errorf("Scheme = %q, want exact", r.Scheme)
				}
				if r.MaxAmountRequired != "1000000" {
					t.Errorf("MaxAmountRequired = %q, want 1000000", r.MaxAmountRequired)
				}
				if r.MaxTimeoutSeconds != 300 {
					t.Errorf("MaxTimeoutSeconds = %d, want 300", r.MaxTimeoutSeconds)
				}
				if r.Asset != "0xUSDC" {
					t.Errorf("Asset = %q, want 0xUSDC", r.Asset)
				}
			},
		},
		{
			name: "with optional description and mimeType",
			data: []byte(`{
				"scheme": "exact",
				"network": "eip155:84532",
				"maxAmountRequired": "500",
				"resource": "https://example.com",
				"payTo": "0xABC",
				"maxTimeoutSeconds": 60,
				"asset": "0xDEF",
				"description": "Test resource",
				"mimeType": "application/json"
			}`),
			check: func(t *testing.T, r *PaymentRequirementsV1) {
				if r.Description != "Test resource" {
					t.Errorf("Description = %q, want 'Test resource'", r.Description)
				}
				if r.MimeType != "application/json" {
					t.Errorf("MimeType = %q, want 'application/json'", r.MimeType)
				}
			},
		},
		{
			name:    "invalid JSON",
			data:    []byte(`not json`),
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ToPaymentRequirementsV1(tt.data)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ToPaymentRequirementsV1() err = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && tt.check != nil {
				tt.check(t, got)
			}
		})
	}
}

func TestToPaymentRequiredV1(t *testing.T) {
	tests := []struct {
		name    string
		data    []byte
		wantErr bool
		check   func(*testing.T, *PaymentRequiredV1)
	}{
		{
			name: "valid payment required with accepts",
			data: []byte(`{
				"x402Version": 1,
				"accepts": [
					{
						"scheme": "exact",
						"network": "eip155:8453",
						"maxAmountRequired": "1000000",
						"resource": "https://api.example.com",
						"payTo": "0xRecipient",
						"maxTimeoutSeconds": 300,
						"asset": "0xUSDC"
					}
				]
			}`),
			check: func(t *testing.T, r *PaymentRequiredV1) {
				if r.X402Version != 1 {
					t.Errorf("X402Version = %d, want 1", r.X402Version)
				}
				if len(r.Accepts) != 1 {
					t.Fatalf("len(Accepts) = %d, want 1", len(r.Accepts))
				}
				if r.Accepts[0].Scheme != "exact" {
					t.Errorf("Accepts[0].Scheme = %q, want exact", r.Accepts[0].Scheme)
				}
			},
		},
		{
			name: "with error field",
			data: []byte(`{"x402Version": 1, "error": "payment failed", "accepts": []}`),
			check: func(t *testing.T, r *PaymentRequiredV1) {
				if r.Error != "payment failed" {
					t.Errorf("Error = %q, want 'payment failed'", r.Error)
				}
			},
		},
		{
			name: "multiple accepts",
			data: []byte(`{
				"x402Version": 1,
				"accepts": [
					{"scheme": "exact", "network": "eip155:8453", "maxAmountRequired": "1000000", "resource": "https://a.com", "payTo": "0xA", "maxTimeoutSeconds": 60, "asset": "0xUSDC1"},
					{"scheme": "exact", "network": "eip155:84532", "maxAmountRequired": "500000", "resource": "https://b.com", "payTo": "0xB", "maxTimeoutSeconds": 120, "asset": "0xUSDC2"}
				]
			}`),
			check: func(t *testing.T, r *PaymentRequiredV1) {
				if len(r.Accepts) != 2 {
					t.Fatalf("len(Accepts) = %d, want 2", len(r.Accepts))
				}
			},
		},
		{
			name:    "invalid JSON",
			data:    []byte(`[1,2,3]`),
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ToPaymentRequiredV1(tt.data)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ToPaymentRequiredV1() err = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && tt.check != nil {
				tt.check(t, got)
			}
		})
	}
}

func TestToSupportedKindV1(t *testing.T) {
	tests := []struct {
		name    string
		data    []byte
		wantErr bool
		check   func(*testing.T, *SupportedKindV1)
	}{
		{
			name: "valid supported kind",
			data: []byte(`{"x402Version": 1, "scheme": "exact", "network": "eip155:8453"}`),
			check: func(t *testing.T, k *SupportedKindV1) {
				if k.X402Version != 1 {
					t.Errorf("X402Version = %d, want 1", k.X402Version)
				}
				if k.Scheme != "exact" {
					t.Errorf("Scheme = %q, want exact", k.Scheme)
				}
				if k.Network != "eip155:8453" {
					t.Errorf("Network = %q, want eip155:8453", k.Network)
				}
			},
		},
		{
			name:    "invalid JSON",
			data:    []byte(`{`),
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ToSupportedKindV1(tt.data)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ToSupportedKindV1() err = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && tt.check != nil {
				tt.check(t, got)
			}
		})
	}
}

// ============================================================
// V1 getter methods (interface implementation)
// ============================================================

func TestPaymentPayloadV1_Getters(t *testing.T) {
	p := PaymentPayloadV1{
		X402Version: 1,
		Scheme:      "exact",
		Network:     "eip155:8453",
		Payload:     map[string]interface{}{"sig": "0xabc"},
	}

	if got := p.GetVersion(); got != 1 {
		t.Errorf("GetVersion() = %d, want 1", got)
	}
	if got := p.GetScheme(); got != "exact" {
		t.Errorf("GetScheme() = %q, want exact", got)
	}
	if got := p.GetNetwork(); got != "eip155:8453" {
		t.Errorf("GetNetwork() = %q, want eip155:8453", got)
	}
	payload := p.GetPayload()
	if payload["sig"] != "0xabc" {
		t.Errorf("GetPayload()[sig] = %v, want 0xabc", payload["sig"])
	}
}

func TestPaymentRequirementsV1_Getters(t *testing.T) {
	r := PaymentRequirementsV1{
		Scheme:            "exact",
		Network:           "eip155:8453",
		Asset:             "0xUSDC",
		MaxAmountRequired: "1000000",
		PayTo:             "0xRecipient",
		MaxTimeoutSeconds: 300,
	}

	if got := r.GetScheme(); got != "exact" {
		t.Errorf("GetScheme() = %q, want exact", got)
	}
	if got := r.GetNetwork(); got != "eip155:8453" {
		t.Errorf("GetNetwork() = %q, want eip155:8453", got)
	}
	if got := r.GetAsset(); got != "0xUSDC" {
		t.Errorf("GetAsset() = %q, want 0xUSDC", got)
	}
	if got := r.GetAmount(); got != "1000000" {
		t.Errorf("GetAmount() = %q, want 1000000", got)
	}
	if got := r.GetPayTo(); got != "0xRecipient" {
		t.Errorf("GetPayTo() = %q, want 0xRecipient", got)
	}
	if got := r.GetMaxTimeoutSeconds(); got != 300 {
		t.Errorf("GetMaxTimeoutSeconds() = %d, want 300", got)
	}
}

func TestPaymentRequirementsV1_GetExtra(t *testing.T) {
	t.Run("nil extra returns nil", func(t *testing.T) {
		r := PaymentRequirementsV1{}
		if got := r.GetExtra(); got != nil {
			t.Errorf("GetExtra() = %v, want nil", got)
		}
	})

	t.Run("valid JSON extra returns map", func(t *testing.T) {
		raw := json.RawMessage(`{"key": "value", "num": 42}`)
		r := PaymentRequirementsV1{Extra: &raw}
		extra := r.GetExtra()
		if extra == nil {
			t.Fatal("GetExtra() = nil, want map")
		}
		if extra["key"] != "value" {
			t.Errorf("extra[key] = %v, want value", extra["key"])
		}
	})

	t.Run("invalid JSON extra returns empty map", func(t *testing.T) {
		raw := json.RawMessage(`not valid json`)
		r := PaymentRequirementsV1{Extra: &raw}
		extra := r.GetExtra()
		if extra == nil {
			t.Error("GetExtra() returned nil, want empty map on error")
		}
		if len(extra) != 0 {
			t.Errorf("GetExtra() len = %d, want 0", len(extra))
		}
	})
}

// ============================================================
// V2 unmarshal helpers
// ============================================================

func TestToPaymentPayload(t *testing.T) {
	tests := []struct {
		name    string
		data    []byte
		wantErr bool
		check   func(*testing.T, *PaymentPayload)
	}{
		{
			name: "valid v2 payload",
			data: []byte(`{
				"x402Version": 2,
				"payload": {"signature": "0xdef"},
				"accepted": {
					"scheme": "exact",
					"network": "eip155:8453",
					"asset": "0xUSDC",
					"amount": "1000000",
					"payTo": "0xRecipient",
					"maxTimeoutSeconds": 300
				}
			}`),
			check: func(t *testing.T, p *PaymentPayload) {
				if p.X402Version != 2 {
					t.Errorf("X402Version = %d, want 2", p.X402Version)
				}
				if p.Accepted.Scheme != "exact" {
					t.Errorf("Accepted.Scheme = %q, want exact", p.Accepted.Scheme)
				}
				if p.Accepted.Network != "eip155:8453" {
					t.Errorf("Accepted.Network = %q, want eip155:8453", p.Accepted.Network)
				}
				if p.Payload["signature"] != "0xdef" {
					t.Errorf("Payload[signature] = %v, want 0xdef", p.Payload["signature"])
				}
			},
		},
		{
			name: "with optional resource",
			data: []byte(`{
				"x402Version": 2,
				"payload": {},
				"accepted": {"scheme": "exact", "network": "eip155:8453", "asset": "0xUSDC", "amount": "1", "payTo": "0xA", "maxTimeoutSeconds": 60},
				"resource": {"url": "https://api.example.com", "description": "Test API", "mimeType": "application/json"}
			}`),
			check: func(t *testing.T, p *PaymentPayload) {
				if p.Resource == nil {
					t.Fatal("Resource = nil, want non-nil")
				}
				if p.Resource.URL != "https://api.example.com" {
					t.Errorf("Resource.URL = %q, want https://api.example.com", p.Resource.URL)
				}
				if p.Resource.MimeType != "application/json" {
					t.Errorf("Resource.MimeType = %q, want application/json", p.Resource.MimeType)
				}
			},
		},
		{
			name: "with extensions",
			data: []byte(`{
				"x402Version": 2,
				"payload": {},
				"accepted": {"scheme": "exact", "network": "eip155:8453", "asset": "0xUSDC", "amount": "1", "payTo": "0xA", "maxTimeoutSeconds": 60},
				"extensions": {"gaslessPayment": true}
			}`),
			check: func(t *testing.T, p *PaymentPayload) {
				if p.Extensions == nil {
					t.Fatal("Extensions = nil, want non-nil")
				}
				if p.Extensions["gaslessPayment"] != true {
					t.Errorf("Extensions[gaslessPayment] = %v, want true", p.Extensions["gaslessPayment"])
				}
			},
		},
		{
			name:    "invalid JSON",
			data:    []byte(`{"x402Version": "not a number"}`),
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ToPaymentPayload(tt.data)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ToPaymentPayload() err = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && tt.check != nil {
				tt.check(t, got)
			}
		})
	}
}

func TestToPaymentRequirements(t *testing.T) {
	tests := []struct {
		name    string
		data    []byte
		wantErr bool
		check   func(*testing.T, *PaymentRequirements)
	}{
		{
			name: "valid requirements",
			data: []byte(`{
				"scheme": "exact",
				"network": "eip155:8453",
				"asset": "0xUSDC",
				"amount": "1000000",
				"payTo": "0xRecipient",
				"maxTimeoutSeconds": 300
			}`),
			check: func(t *testing.T, r *PaymentRequirements) {
				if r.Scheme != "exact" {
					t.Errorf("Scheme = %q, want exact", r.Scheme)
				}
				if r.Amount != "1000000" {
					t.Errorf("Amount = %q, want 1000000", r.Amount)
				}
				if r.MaxTimeoutSeconds != 300 {
					t.Errorf("MaxTimeoutSeconds = %d, want 300", r.MaxTimeoutSeconds)
				}
			},
		},
		{
			name: "with extra field",
			data: []byte(`{
				"scheme": "exact",
				"network": "eip155:8453",
				"asset": "0xUSDC",
				"amount": "1",
				"payTo": "0xA",
				"maxTimeoutSeconds": 60,
				"extra": {"customField": "customValue"}
			}`),
			check: func(t *testing.T, r *PaymentRequirements) {
				if r.Extra == nil {
					t.Fatal("Extra = nil, want non-nil")
				}
				if r.Extra["customField"] != "customValue" {
					t.Errorf("Extra[customField] = %v, want customValue", r.Extra["customField"])
				}
			},
		},
		{
			name:    "invalid JSON",
			data:    []byte(`not-json`),
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ToPaymentRequirements(tt.data)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ToPaymentRequirements() err = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && tt.check != nil {
				tt.check(t, got)
			}
		})
	}
}

func TestToPaymentRequired(t *testing.T) {
	tests := []struct {
		name    string
		data    []byte
		wantErr bool
		check   func(*testing.T, *PaymentRequired)
	}{
		{
			name: "valid payment required",
			data: []byte(`{
				"x402Version": 2,
				"accepts": [
					{
						"scheme": "exact",
						"network": "eip155:8453",
						"asset": "0xUSDC",
						"amount": "1000000",
						"payTo": "0xRecipient",
						"maxTimeoutSeconds": 300
					}
				]
			}`),
			check: func(t *testing.T, r *PaymentRequired) {
				if r.X402Version != 2 {
					t.Errorf("X402Version = %d, want 2", r.X402Version)
				}
				if len(r.Accepts) != 1 {
					t.Fatalf("len(Accepts) = %d, want 1", len(r.Accepts))
				}
				if r.Accepts[0].Amount != "1000000" {
					t.Errorf("Accepts[0].Amount = %q, want 1000000", r.Accepts[0].Amount)
				}
			},
		},
		{
			name: "with error and resource",
			data: []byte(`{
				"x402Version": 2,
				"error": "insufficient funds",
				"resource": {"url": "https://api.example.com"},
				"accepts": []
			}`),
			check: func(t *testing.T, r *PaymentRequired) {
				if r.Error != "insufficient funds" {
					t.Errorf("Error = %q, want 'insufficient funds'", r.Error)
				}
				if r.Resource == nil {
					t.Fatal("Resource = nil, want non-nil")
				}
				if r.Resource.URL != "https://api.example.com" {
					t.Errorf("Resource.URL = %q, want https://api.example.com", r.Resource.URL)
				}
			},
		},
		{
			name: "with extensions",
			data: []byte(`{
				"x402Version": 2,
				"accepts": [],
				"extensions": {"reputationRequired": true}
			}`),
			check: func(t *testing.T, r *PaymentRequired) {
				if r.Extensions == nil {
					t.Fatal("Extensions = nil, want non-nil")
				}
			},
		},
		{
			name:    "invalid JSON",
			data:    []byte(`null`),
			wantErr: false, // null unmarshals to zero value without error
			check: func(t *testing.T, r *PaymentRequired) {
				if r == nil {
					t.Error("got nil pointer from null JSON, want zero-value struct")
				}
			},
		},
		{
			name:    "malformed JSON",
			data:    []byte(`{invalid`),
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ToPaymentRequired(tt.data)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ToPaymentRequired() err = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && tt.check != nil {
				tt.check(t, got)
			}
		})
	}
}

func TestToSupportedKind(t *testing.T) {
	tests := []struct {
		name    string
		data    []byte
		wantErr bool
		check   func(*testing.T, *SupportedKind)
	}{
		{
			name: "valid supported kind",
			data: []byte(`{"x402Version": 2, "scheme": "exact", "network": "eip155:8453"}`),
			check: func(t *testing.T, k *SupportedKind) {
				if k.X402Version != 2 {
					t.Errorf("X402Version = %d, want 2", k.X402Version)
				}
				if k.Scheme != "exact" {
					t.Errorf("Scheme = %q, want exact", k.Scheme)
				}
				if k.Network != "eip155:8453" {
					t.Errorf("Network = %q, want eip155:8453", k.Network)
				}
			},
		},
		{
			name: "with extra",
			data: []byte(`{"x402Version": 2, "scheme": "upto", "network": "eip155:84532", "extra": {"maxUsd": 10}}`),
			check: func(t *testing.T, k *SupportedKind) {
				if k.Scheme != "upto" {
					t.Errorf("Scheme = %q, want upto", k.Scheme)
				}
				if k.Extra == nil {
					t.Error("Extra = nil, want non-nil")
				}
			},
		},
		{
			name:    "invalid JSON",
			data:    []byte(`[]`),
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ToSupportedKind(tt.data)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ToSupportedKind() err = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && tt.check != nil {
				tt.check(t, got)
			}
		})
	}
}

// ============================================================
// V2 getter methods (interface implementation)
// ============================================================

func TestPaymentPayload_Getters(t *testing.T) {
	p := PaymentPayload{
		X402Version: 2,
		Payload:     map[string]interface{}{"sig": "0xdef"},
		Accepted: PaymentRequirements{
			Scheme:  "exact",
			Network: "eip155:8453",
		},
	}

	if got := p.GetVersion(); got != 2 {
		t.Errorf("GetVersion() = %d, want 2", got)
	}
	if got := p.GetScheme(); got != "exact" {
		t.Errorf("GetScheme() = %q, want exact", got)
	}
	if got := p.GetNetwork(); got != "eip155:8453" {
		t.Errorf("GetNetwork() = %q, want eip155:8453", got)
	}
	payload := p.GetPayload()
	if payload["sig"] != "0xdef" {
		t.Errorf("GetPayload()[sig] = %v, want 0xdef", payload["sig"])
	}
}

func TestPaymentRequirements_Getters(t *testing.T) {
	r := PaymentRequirements{
		Scheme:            "exact",
		Network:           "eip155:8453",
		Asset:             "0xUSDC",
		Amount:            "1000000",
		PayTo:             "0xRecipient",
		MaxTimeoutSeconds: 300,
		Extra:             map[string]interface{}{"fee": "0.1%"},
	}

	if got := r.GetScheme(); got != "exact" {
		t.Errorf("GetScheme() = %q, want exact", got)
	}
	if got := r.GetNetwork(); got != "eip155:8453" {
		t.Errorf("GetNetwork() = %q, want eip155:8453", got)
	}
	if got := r.GetAsset(); got != "0xUSDC" {
		t.Errorf("GetAsset() = %q, want 0xUSDC", got)
	}
	if got := r.GetAmount(); got != "1000000" {
		t.Errorf("GetAmount() = %q, want 1000000", got)
	}
	if got := r.GetPayTo(); got != "0xRecipient" {
		t.Errorf("GetPayTo() = %q, want 0xRecipient", got)
	}
	if got := r.GetMaxTimeoutSeconds(); got != 300 {
		t.Errorf("GetMaxTimeoutSeconds() = %d, want 300", got)
	}
	extra := r.GetExtra()
	if extra["fee"] != "0.1%" {
		t.Errorf("GetExtra()[fee] = %v, want 0.1%%", extra["fee"])
	}
}

func TestPaymentRequirements_GetExtra_Nil(t *testing.T) {
	r := PaymentRequirements{}
	if got := r.GetExtra(); got != nil {
		t.Errorf("GetExtra() with nil Extra = %v, want nil", got)
	}
}

// ============================================================
// ResourceInfo struct
// ============================================================

func TestResourceInfo_JSON(t *testing.T) {
	t.Run("round-trip with all fields", func(t *testing.T) {
		ri := ResourceInfo{
			URL:         "https://api.example.com/endpoint",
			Description: "Test endpoint",
			MimeType:    "application/json",
		}
		data, err := json.Marshal(ri)
		if err != nil {
			t.Fatalf("Marshal failed: %v", err)
		}
		var got ResourceInfo
		if err := json.Unmarshal(data, &got); err != nil {
			t.Fatalf("Unmarshal failed: %v", err)
		}
		if got.URL != ri.URL {
			t.Errorf("URL = %q, want %q", got.URL, ri.URL)
		}
		if got.Description != ri.Description {
			t.Errorf("Description = %q, want %q", got.Description, ri.Description)
		}
		if got.MimeType != ri.MimeType {
			t.Errorf("MimeType = %q, want %q", got.MimeType, ri.MimeType)
		}
	})

	t.Run("optional fields omitted when empty", func(t *testing.T) {
		ri := ResourceInfo{URL: "https://example.com"}
		data, err := json.Marshal(ri)
		if err != nil {
			t.Fatalf("Marshal failed: %v", err)
		}
		// description and mimeType should be omitted
		if string(data) != `{"url":"https://example.com"}` {
			t.Errorf("JSON = %s, want only url field", string(data))
		}
	})
}

// ============================================================
// SupportedResponse (V2) struct
// ============================================================

func TestSupportedResponse_JSON(t *testing.T) {
	t.Run("round-trip", func(t *testing.T) {
		data := []byte(`{
			"kinds": [
				{"x402Version": 2, "scheme": "exact", "network": "eip155:8453"},
				{"x402Version": 2, "scheme": "upto", "network": "eip155:84532"}
			],
			"extensions": ["gaslessPayment", "reputation"],
			"signers": {"eip155": ["0xFacilitatorAddr"]}
		}`)
		var sr SupportedResponse
		if err := json.Unmarshal(data, &sr); err != nil {
			t.Fatalf("Unmarshal failed: %v", err)
		}
		if len(sr.Kinds) != 2 {
			t.Errorf("len(Kinds) = %d, want 2", len(sr.Kinds))
		}
		if len(sr.Extensions) != 2 {
			t.Errorf("len(Extensions) = %d, want 2", len(sr.Extensions))
		}
		if len(sr.Signers["eip155"]) != 1 {
			t.Errorf("len(Signers[eip155]) = %d, want 1", len(sr.Signers["eip155"]))
		}
	})
}

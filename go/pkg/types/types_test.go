package types

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/google/go-cmp/cmp"
)

func TestSupportedPaymentKindsResponseSpecExample(t *testing.T) {
	t.Parallel()

	// Reference: https://github.com/coinbase/x402/blob/3bd4ba0d5c94bdcde03c22f9156c5425d9eba4c6/specs/x402-specification.md#L371
	const specJSON = `{
		"kinds": [
			{
				"x402Version": 1,
				"scheme": "exact",
				"network": "base-sepolia"
			},
			{
				"x402Version": 1,
				"scheme": "exact",
				"network": "base"
			},
			{
				"x402Version": 1,
				"scheme": "exact",
				"network": "avalanche-fuji"
			},
			{
				"x402Version": 1,
				"scheme": "exact",
				"network": "avalanche"
			},
			{
				"x402Version": 1,
				"scheme": "exact",
				"network": "iotex"
			}
		]
	}`

	var got SupportedPaymentKindsResponse
	if err := json.Unmarshal([]byte(specJSON), &got); err != nil {
		t.Fatalf("failed to unmarshal spec json: %v", err)
	}

	want := SupportedPaymentKindsResponse{
		Kinds: []SupportedPaymentKind{
			{X402Version: 1, Scheme: "exact", Network: "base-sepolia"},
			{X402Version: 1, Scheme: "exact", Network: "base"},
			{X402Version: 1, Scheme: "exact", Network: "avalanche-fuji"},
			{X402Version: 1, Scheme: "exact", Network: "avalanche"},
			{X402Version: 1, Scheme: "exact", Network: "iotex"},
		},
	}

	if diff := cmp.Diff(want, got); diff != "" {
		t.Fatalf("supported response mismatch (-want +got)\n%s", diff)
	}
}

func TestListDiscoveryResourcesResponseSpecExample(t *testing.T) {
	t.Parallel()

	// Reference: https://github.com/coinbase/x402/blob/3bd4ba0d5c94bdcde03c22f9156c5425d9eba4c6/specs/x402-specification.md#L420
	const specJSON = `{
        "x402Version": 1,
        "items": [
            {
                "resource": "https://api.example.com/premium-data",
                "type": "http",
                "x402Version": 1,
                "accepts": [
                    {
                        "scheme": "exact",
                        "network": "base-sepolia",
                        "maxAmountRequired": "10000",
                        "resource": "https://api.example.com/premium-data",
                        "description": "Access to premium market data",
                        "mimeType": "application/json",
                        "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
                        "maxTimeoutSeconds": 60,
                        "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                        "extra": {
                            "name": "USDC",
                            "version": "2"
                        }
                    }
                ],
                "lastUpdated": 1703123456,
                "metadata": {
                    "category": "finance",
                    "provider": "Example Corp"
                }
            }
        ],
        "pagination": {
            "limit": 10,
            "offset": 0,
            "total": 1
        }
    }`

	var got ListDiscoveryResourcesResponse
	if err := json.Unmarshal([]byte(specJSON), &got); err != nil {
		t.Fatalf("failed to unmarshal spec json: %v", err)
	}

	wants := ListDiscoveryResourcesResponse{
		X402Version: 1,
		Items: []DiscoveredResource{
			{
				Resource:    "https://api.example.com/premium-data",
				Type:        "http",
				X402Version: 1,
				Accepts: []PaymentRequirements{
					{
						Scheme:            "exact",
						Network:           "base-sepolia",
						MaxAmountRequired: "10000",
						Resource:          "https://api.example.com/premium-data",
						Description:       "Access to premium market data",
						MimeType:          "application/json",
						PayTo:             "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
						MaxTimeoutSeconds: 60,
						Asset:             "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
						Extra:             rawMessagePtr(`{"name":"USDC","version":"2"}`),
					},
				},
				LastUpdated: 1703123456,
				Metadata: map[string]any{
					"category": "finance",
					"provider": "Example Corp",
				},
			},
		},
		Pagination: ListDiscoveryPagination{Limit: 10, Offset: 0, Total: 1},
	}

	if diff := cmp.Diff(wants, got, cmp.Comparer(rawMessagePtrEqual)); diff != "" {
		t.Fatalf("discovery response mismatch (-want +got)\n%s", diff)
	}
}

func rawMessagePtr(s string) *json.RawMessage {
	rm := json.RawMessage(s)
	return &rm
}

func rawMessagePtrEqual(a, b *json.RawMessage) bool {
	if a == nil || b == nil {
		return a == b
	}

	var bufA, bufB bytes.Buffer
	if err := json.Compact(&bufA, *a); err != nil {
		return false
	}
	if err := json.Compact(&bufB, *b); err != nil {
		return false
	}

	return bytes.Equal(bufA.Bytes(), bufB.Bytes())
}

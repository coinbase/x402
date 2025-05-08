package facilitatorclient_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/coinbase/x402/go/pkg/facilitatorclient"
	"github.com/coinbase/x402/go/pkg/types"
)

func TestVerify(t *testing.T) {
	// Create test server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/verify" {
			t.Errorf("Expected to request '/verify', got: %s", r.URL.Path)
		}
		if r.Method != "POST" {
			t.Errorf("Expected POST request, got: %s", r.Method)
		}

		resp := types.VerifyResponse{
			IsValid: true,
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	// Create client with test server URL
	client := facilitatorclient.NewFacilitatorClient(server.URL)

	// Test data
	paymentPayload := &types.PaymentPayload{
		X402Version: 1,
		Scheme:      "exact",
		Network:     "base-sepolia",
		Payload: &types.ExactEvmPayload{
			Signature: "0xvalidSignature",
			Authorization: &types.ExactEvmPayloadAuthorization{
				From:        "0xvalidFrom",
				To:          "0xvalidTo",
				Value:       "1000000",
				ValidAfter:  "1745323800",
				ValidBefore: "1745323985",
				Nonce:       "0xvalidNonce",
			},
		},
	}
	paymentRequirements := &types.PaymentRequirements{
		Scheme:            "exact",
		Network:           "base-sepolia",
		MaxAmountRequired: "1000000",
		Resource:          "https://example.com/resource",
		Description:       "Test resource",
		MimeType:          "application/json",
		PayTo:             "0x123",
		MaxTimeoutSeconds: 30,
		Asset:             "0xusdcAddress",
	}

	// Test verify
	resp, err := client.Verify(paymentPayload, paymentRequirements)
	if err != nil {
		t.Fatalf("Expected no error, got: %v", err)
	}
	if !resp.IsValid {
		t.Errorf("Expected valid response, got invalid")
	}
}

func TestSettle(t *testing.T) {
	// Create test server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/settle" {
			t.Errorf("Expected to request '/settle', got: %s", r.URL.Path)
		}
		if r.Method != "POST" {
			t.Errorf("Expected POST request, got: %s", r.Method)
		}

		resp := types.SettleResponse{
			Success:     true,
			Transaction: "0xvalidTransaction",
			Network:     "base-sepolia",
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	// Create client with test server URL
	client := facilitatorclient.NewFacilitatorClient(server.URL)

	// Test data
	paymentPayload := &types.PaymentPayload{
		X402Version: 1,
		Scheme:      "exact",
		Network:     "base-sepolia",
		Payload: &types.ExactEvmPayload{
			Signature: "0xvalidSignature",
			Authorization: &types.ExactEvmPayloadAuthorization{
				From:        "0xvalidFrom",
				To:          "0xvalidTo",
				Value:       "1000000",
				ValidAfter:  "1745323800",
				ValidBefore: "1745323985",
				Nonce:       "0xvalidNonce",
			},
		},
	}
	paymentRequirements := &types.PaymentRequirements{
		Scheme:            "exact",
		Network:           "base-sepolia",
		MaxAmountRequired: "1000000",
		Resource:          "https://example.com/resource",
		Description:       "Test resource",
		MimeType:          "application/json",
		PayTo:             "0x123",
		MaxTimeoutSeconds: 30,
		Asset:             "0xusdcAddress",
	}

	// Test settle
	resp, err := client.Settle(paymentPayload, paymentRequirements)
	if err != nil {
		t.Fatalf("Expected no error, got: %v", err)
	}
	if !resp.Success {
		t.Errorf("Expected successful response, got unsuccessful")
	}
	if resp.Transaction != "0xvalidTransaction" {
		t.Errorf("Expected transaction '0xvalidTransaction', got: %s", resp.Transaction)
	}
	if resp.Network != "base-sepolia" {
		t.Errorf("Expected network 'base-sepolia', got: %s", resp.Network)
	}
}

package facilitatorclient_test

import (
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/coinbase/x402/pkg/x402"
	"github.com/coinbase/x402/pkg/x402/facilitatorclient"
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

		resp := x402.VerifyResponse{
			IsValid: true,
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	// Create client with test server URL
	client := facilitatorclient.NewFacilitatorClient(server.URL)

	// Test data
	payload := "test_payload"
	details := x402.PaymentDetails{
		Scheme:                  "exact",
		NetworkID:               "84532",
		MaxAmountRequired:       big.NewInt(1000000),
		Resource:                "https://example.com/resource",
		Description:             "Test resource",
		MimeType:                "application/json",
		PayToAddress:            "0x123",
		RequiredDeadlineSeconds: 30,
		USDCAddress:             "0x456",
	}

	// Test verify
	resp, err := client.Verify(payload, details)
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

		resp := x402.SettleResponse{
			Success:   true,
			TxHash:    "0x789",
			NetworkID: "84532",
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	// Create client with test server URL
	client := facilitatorclient.NewFacilitatorClient(server.URL)

	// Test data
	payload := "test_payload"
	details := x402.PaymentDetails{
		Scheme:                  "exact",
		NetworkID:               "84532",
		MaxAmountRequired:       big.NewInt(1000000),
		Resource:                "https://example.com/resource",
		Description:             "Test resource",
		MimeType:                "application/json",
		PayToAddress:            "0x123",
		RequiredDeadlineSeconds: 30,
		USDCAddress:             "0x456",
	}

	// Test settle
	resp, err := client.Settle(payload, details)
	if err != nil {
		t.Fatalf("Expected no error, got: %v", err)
	}
	if !resp.Success {
		t.Errorf("Expected successful response, got unsuccessful")
	}
	if resp.TxHash != "0x789" {
		t.Errorf("Expected txHash '0x789', got: %s", resp.TxHash)
	}
	if resp.NetworkID != "84532" {
		t.Errorf("Expected networkId '84532', got: %s", resp.NetworkID)
	}
}

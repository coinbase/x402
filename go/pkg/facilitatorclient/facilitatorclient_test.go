package facilitatorclient_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/coinbase/x402/go/pkg/facilitatorclient"
	"github.com/coinbase/x402/go/pkg/types"
	"github.com/google/go-cmp/cmp"
)

func TestVerify(t *testing.T) {
	t.Parallel()

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
	config := &types.FacilitatorConfig{
		URL: server.URL,
	}
	client := facilitatorclient.NewFacilitatorClient(config)

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
	t.Parallel()

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
	config := &types.FacilitatorConfig{
		URL: server.URL,
	}
	client := facilitatorclient.NewFacilitatorClient(config)

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

func TestTimeout(t *testing.T) {
	t.Parallel()

	timeoutDuration := time.Millisecond * 100

	// Create test server that takes a while to respond
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(2 * timeoutDuration)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	config := &types.FacilitatorConfig{
		URL: server.URL,
		Timeout: func() time.Duration {
			return timeoutDuration
		},
	}

	// Create client with test server URL and a timeout option
	client := facilitatorclient.NewFacilitatorClient(config)

	// Test data
	paymentPayload := &types.PaymentPayload{}
	paymentRequirements := &types.PaymentRequirements{}

	// Test verify with timeout
	_, err := client.Verify(paymentPayload, paymentRequirements)
	t.Log(err)
	if err == nil {
		t.Error("Expected timeout error, got err == nil")
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("Expected context deadline exceeded error, got: %v", err)
	}
}

func TestVerifyWithAuthHeaders(t *testing.T) {
	t.Parallel()

	var capturedAuthHeader string

	// Create test server that captures the auth header
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedAuthHeader = r.Header.Get("Authorization")
		resp := types.VerifyResponse{
			IsValid: true,
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	// Create mock auth headers function
	createAuthHeaders := func() (map[string]map[string]string, error) {
		return map[string]map[string]string{
			"verify": {"Authorization": "Bearer test-token"},
			"settle": {"Authorization": "Bearer settle-token"},
		}, nil
	}

	// Create client with test server URL and auth headers
	config := &types.FacilitatorConfig{
		URL:               server.URL,
		CreateAuthHeaders: createAuthHeaders,
	}
	client := facilitatorclient.NewFacilitatorClient(config)

	// Test verify with auth headers
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

	_, err := client.Verify(paymentPayload, paymentRequirements)
	if err != nil {
		t.Fatalf("Expected no error, got: %v", err)
	}

	// Verify that the auth header was set correctly
	expectedAuthHeader := "Bearer test-token"
	if capturedAuthHeader != expectedAuthHeader {
		t.Errorf("Expected auth header '%s', got: '%s'", expectedAuthHeader, capturedAuthHeader)
	}
}

func TestSettleWithAuthHeaders(t *testing.T) {
	t.Parallel()

	var capturedAuthHeader string

	// Create test server that captures the auth header
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedAuthHeader = r.Header.Get("Authorization")
		resp := types.SettleResponse{
			Success:     true,
			Transaction: "0xvalidTransaction",
			Network:     "base-sepolia",
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	// Create mock auth headers function
	createAuthHeaders := func() (map[string]map[string]string, error) {
		return map[string]map[string]string{
			"verify": {"Authorization": "Bearer test-token"},
			"settle": {"Authorization": "Bearer settle-token"},
		}, nil
	}

	// Create client with test server URL and auth headers
	config := &types.FacilitatorConfig{
		URL:               server.URL,
		CreateAuthHeaders: createAuthHeaders,
	}
	client := facilitatorclient.NewFacilitatorClient(config)

	// Test settle with auth headers
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

	_, err := client.Settle(paymentPayload, paymentRequirements)
	if err != nil {
		t.Fatalf("Expected no error, got: %v", err)
	}

	// Verify that the auth header was set correctly
	expectedAuthHeader := "Bearer settle-token"
	if capturedAuthHeader != expectedAuthHeader {
		t.Errorf("Expected auth header '%s', got: '%s'", expectedAuthHeader, capturedAuthHeader)
	}
}

func TestSupported(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/supported" {
			t.Fatalf("expected supported path, got %s", r.URL.Path)
		}
		if r.Method != http.MethodGet {
			t.Fatalf("expected GET method, got %s", r.Method)
		}

		resp := types.SupportedPaymentKindsResponse{
			Kinds: []types.SupportedPaymentKind{
				{X402Version: 1, Scheme: "exact", Network: "base-sepolia", Extra: map[string]any{"note": "example"}},
			},
		}
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			t.Fatalf("failed to encode response: %v", err)
		}
	}))
	defer server.Close()

	client := facilitatorclient.NewFacilitatorClient(&types.FacilitatorConfig{URL: server.URL})

	resp, err := client.Supported()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	wantKinds := []types.SupportedPaymentKind{{
		X402Version: 1,
		Scheme:      "exact",
		Network:     "base-sepolia",
		Extra:       map[string]any{"note": "example"},
	}}

	if diff := cmp.Diff(wantKinds, resp.Kinds); diff != "" {
		t.Fatalf("unexpected supported kinds (-want +got)\n%s", diff)
	}
}

func TestSupportedWithAuthHeaders(t *testing.T) {
	t.Parallel()

	var capturedAuth string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedAuth = r.Header.Get("Authorization")
		_ = json.NewEncoder(w).Encode(types.SupportedPaymentKindsResponse{})
	}))
	defer server.Close()

	client := facilitatorclient.NewFacilitatorClient(&types.FacilitatorConfig{
		URL: server.URL,
		CreateAuthHeaders: func() (map[string]map[string]string, error) {
			return map[string]map[string]string{
				"supported": {"Authorization": "Bearer supported"},
			}, nil
		},
	})

	if _, err := client.Supported(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if capturedAuth != "Bearer supported" {
		t.Fatalf("expected supported auth header, got %s", capturedAuth)
	}
}

func TestListDiscoveryResources(t *testing.T) {
	t.Parallel()

	sampleTime := time.Now().UTC().Truncate(time.Second).Unix()
	emptyDiscoveryResponse := &types.ListDiscoveryResourcesResponse{
		Pagination: types.ListDiscoveryPagination{Limit: 0, Offset: 0, Total: 0},
	}
	wantEmptyDiscoveryResponse := &types.ListDiscoveryResourcesResponse{
		Pagination: types.ListDiscoveryPagination{Limit: 0, Offset: 0, Total: 0},
	}

	testCases := []struct {
		name         string
		req          *types.ListDiscoveryResourcesRequest
		wantQuery    string
		wantParams   map[string]string
		respondWith  *types.ListDiscoveryResourcesResponse
		wantResponse *types.ListDiscoveryResourcesResponse
	}{
		{
			name: "full request returns discovery resources",
			req: &types.ListDiscoveryResourcesRequest{
				Type:   ptr("http"),
				Limit:  ptr(5),
				Offset: ptr(10),
			},
			wantQuery: "limit=5&offset=10&type=http",
			wantParams: map[string]string{
				"type":   "http",
				"limit":  "5",
				"offset": "10",
			},
			respondWith: &types.ListDiscoveryResourcesResponse{
				X402Version: 1,
				Items: []types.DiscoveredResource{
					{
						Resource:    "https://example.com/resource",
						Type:        "http",
						X402Version: 1,
						Accepts: []types.PaymentRequirements{
							{Scheme: "exact", Network: "base-sepolia"},
						},
						LastUpdated: sampleTime,
						Metadata:    map[string]any{"foo": "bar"},
					},
				},
				Pagination: types.ListDiscoveryPagination{Limit: 5, Offset: 10, Total: 1},
			},
			wantResponse: &types.ListDiscoveryResourcesResponse{
				X402Version: 1,
				Items: []types.DiscoveredResource{
					{
						Resource:    "https://example.com/resource",
						Type:        "http",
						X402Version: 1,
						Accepts: []types.PaymentRequirements{{
							Scheme:  "exact",
							Network: "base-sepolia",
						}},
						LastUpdated: sampleTime,
						Metadata:    map[string]any{"foo": "bar"},
					},
				},
				Pagination: types.ListDiscoveryPagination{Limit: 5, Offset: 10, Total: 1},
			},
		},
		{
			name:         "empty request",
			req:          &types.ListDiscoveryResourcesRequest{},
			wantQuery:    "",
			respondWith:  emptyDiscoveryResponse,
			wantResponse: wantEmptyDiscoveryResponse,
		},
		{
			name:         "type only",
			req:          &types.ListDiscoveryResourcesRequest{Type: ptr("http")},
			wantQuery:    "type=http",
			respondWith:  emptyDiscoveryResponse,
			wantResponse: wantEmptyDiscoveryResponse,
		},
		{
			name:         "limit only",
			req:          &types.ListDiscoveryResourcesRequest{Limit: ptr(25)},
			wantQuery:    "limit=25",
			respondWith:  emptyDiscoveryResponse,
			wantResponse: wantEmptyDiscoveryResponse,
		},
		{
			name:         "offset only",
			req:          &types.ListDiscoveryResourcesRequest{Offset: ptr(10)},
			wantQuery:    "offset=10",
			respondWith:  emptyDiscoveryResponse,
			wantResponse: wantEmptyDiscoveryResponse,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if tc.wantQuery != "" && r.URL.RawQuery != tc.wantQuery {
					t.Fatalf("unexpected query: got %q want %q", r.URL.RawQuery, tc.wantQuery)
				}

				if len(tc.wantParams) > 0 {
					q := r.URL.Query()
					if len(q) != len(tc.wantParams) {
						t.Fatalf("unexpected number of query params: got %d want %d", len(q), len(tc.wantParams))
					}
					for key, want := range tc.wantParams {
						if got := q.Get(key); got != want {
							t.Fatalf("unexpected %s query: got %s want %s", key, got, want)
						}
					}
				}

				resp := tc.respondWith
				if resp == nil {
					resp = &types.ListDiscoveryResourcesResponse{
						Pagination: types.ListDiscoveryPagination{Limit: 0, Offset: 0, Total: 0},
					}
				}

				if err := json.NewEncoder(w).Encode(resp); err != nil {
					t.Fatalf("failed to encode response: %v", err)
				}
			}))
			defer server.Close()

			client := facilitatorclient.NewFacilitatorClient(&types.FacilitatorConfig{URL: server.URL})

			resp, err := client.ListDiscoveryResources(tc.req)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if diff := cmp.Diff(tc.wantResponse, resp); diff != "" {
				t.Fatalf("unexpected discovery response (-want +got)\n%s", diff)
			}
		})
	}
}

func TestListDiscoveryResourcesWithAuthHeaders(t *testing.T) {
	t.Parallel()

	var capturedAuth string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedAuth = r.Header.Get("Authorization")
		_ = json.NewEncoder(w).Encode(types.ListDiscoveryResourcesResponse{Pagination: types.ListDiscoveryPagination{Limit: 0, Offset: 0, Total: 0}})
	}))
	defer server.Close()

	client := facilitatorclient.NewFacilitatorClient(&types.FacilitatorConfig{
		URL: server.URL,
		CreateAuthHeaders: func() (map[string]map[string]string, error) {
			return map[string]map[string]string{
				"list": {"Authorization": "Bearer list"},
			}, nil
		},
	})

	if _, err := client.ListDiscoveryResources(&types.ListDiscoveryResourcesRequest{}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if capturedAuth != "Bearer list" {
		t.Fatalf("expected list auth header, got %s", capturedAuth)
	}
}

func ptr[T any](v T) *T {
	return &v
}

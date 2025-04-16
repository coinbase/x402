package gin_test

import (
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"

	"github.com/coinbase/x402/pkg/x402"
	x402gin "github.com/coinbase/x402/pkg/x402/gin"
)

// TestServerConfig configures how the test facilitator server responds.
type TestServerConfig struct {
	// Verification response
	VerifySuccess bool
	InvalidReason string

	// Settlement response
	SettleSuccess bool
	SettleError   string
	TxHash        string
	NetworkID     string

	// Server behavior
	VerifyStatusCode int
	SettleStatusCode int
	PayerAddress     string
}

// NewTestConfig returns a default test configuration with successful responses.
func NewTestConfig() TestServerConfig {
	return TestServerConfig{
		VerifySuccess:    true,
		InvalidReason:    "Invalid payment",
		SettleSuccess:    true,
		SettleError:      "Settlement failed",
		TxHash:           "0xtesthash",
		NetworkID:        "84532",
		VerifyStatusCode: http.StatusOK,
		SettleStatusCode: http.StatusOK,
		PayerAddress:     "0x349002E7213E7F7CF68a8368ca83Fd85CEC4DDB0",
	}
}

// setupTest creates a test environment with configurable facilitator server.
func setupTest(t *testing.T, amount *big.Float, address string, config TestServerConfig, opts ...x402gin.Options) (*gin.Engine, *httptest.ResponseRecorder, *http.Request) {
	t.Helper()

	// Create a test facilitator server
	facilitatorServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/verify":
			w.WriteHeader(config.VerifyStatusCode)
			json.NewEncoder(w).Encode(x402.VerifyResponse{
				IsValid:       config.VerifySuccess,
				InvalidReason: config.InvalidReason,
				PayerAddress:  config.PayerAddress,
			})
		case "/settle":
			w.WriteHeader(config.SettleStatusCode)
			json.NewEncoder(w).Encode(x402.SettleResponse{
				Success:   config.SettleSuccess,
				TxHash:    config.TxHash,
				NetworkID: config.NetworkID,
			})
		}
	}))
	t.Cleanup(func() { facilitatorServer.Close() })

	gin.SetMode(gin.TestMode)
	router := gin.New()

	allOpts := append([]x402gin.Options{x402gin.WithFacilitatorURL(facilitatorServer.URL)}, opts...)

	router.GET("/protected", x402gin.PaymentMiddleware(amount, address, allOpts...), func(c *gin.Context) {
		c.String(http.StatusOK, "success")
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/protected", nil)

	return router, w, req
}

func TestPaymentMiddleware_NoPaymentHeader(t *testing.T) {
	router, w, req := setupTest(t, big.NewFloat(1.0), "0xTestAddress", NewTestConfig())

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusPaymentRequired, w.Code)

	var response map[string]any
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)
	assert.Contains(t, response, "error")
	assert.Contains(t, response, "paymentDetails")
}

func TestPaymentMiddleware_WebBrowserRequest(t *testing.T) {
	router, w, req := setupTest(t, big.NewFloat(1.0), "0xTestAddress", NewTestConfig())

	req.Header.Set("Accept", "text/html")
	req.Header.Set("User-Agent", "Mozilla/5.0")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusPaymentRequired, w.Code)
	assert.Contains(t, w.Body.String(), "<html>")
	assert.Equal(t, "text/html", w.Header().Get("Content-Type"))
}

func TestPaymentMiddleware_ValidPayment(t *testing.T) {
	router, w, req := setupTest(t, big.NewFloat(1.0), "0xTestAddress", NewTestConfig())

	req.Header.Set("X-PAYMENT", "validPaymentToken")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "success")
	assert.NotEmpty(t, w.Header().Get("X-PAYMENT-RESPONSE"))

	responseStr := w.Header().Get("X-PAYMENT-RESPONSE")
	responseBytes, err := base64.StdEncoding.DecodeString(responseStr)
	assert.NoError(t, err)

	var settleResponse x402.SettleResponse
	err = json.Unmarshal(responseBytes, &settleResponse)
	assert.NoError(t, err)
	assert.True(t, settleResponse.Success)
	assert.Equal(t, "0xtesthash", settleResponse.TxHash)
}

func TestPaymentMiddleware_VerificationFails(t *testing.T) {
	config := NewTestConfig()
	config.VerifySuccess = false

	router, w, req := setupTest(t, big.NewFloat(1.0), "0xTestAddress", config)

	req.Header.Set("X-PAYMENT", "invalidPaymentToken")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusPaymentRequired, w.Code)

	var response map[string]any
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)
	assert.Contains(t, response, "error")
	assert.Contains(t, response, "paymentDetails")
	assert.Contains(t, response, "payerAddress")
	assert.Equal(t, config.InvalidReason, response["error"])
}

func TestPaymentMiddleware_VerificationServerError(t *testing.T) {
	config := NewTestConfig()
	config.VerifyStatusCode = http.StatusInternalServerError

	router, w, req := setupTest(t, big.NewFloat(1.0), "0xTestAddress", config)

	req.Header.Set("X-PAYMENT", "validPaymentToken")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)

	var response map[string]any
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)
	assert.Contains(t, response, "error")
}

func TestPaymentMiddleware_SettlementFails(t *testing.T) {
	config := NewTestConfig()
	config.SettleSuccess = false

	router, w, req := setupTest(t, big.NewFloat(1.0), "0xTestAddress", config)

	req.Header.Set("X-PAYMENT", "validPaymentToken")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "success")

	assert.NotEmpty(t, w.Header().Get("X-PAYMENT-RESPONSE"))

	responseStr := w.Header().Get("X-PAYMENT-RESPONSE")
	responseBytes, err := base64.StdEncoding.DecodeString(responseStr)
	assert.NoError(t, err)

	var settleResponse x402.SettleResponse
	err = json.Unmarshal(responseBytes, &settleResponse)
	assert.NoError(t, err)
	assert.False(t, settleResponse.Success)
}

func TestPaymentMiddleware_SettlementServerError(t *testing.T) {
	config := NewTestConfig()
	config.SettleStatusCode = http.StatusInternalServerError

	router, w, req := setupTest(t, big.NewFloat(1.0), "0xTestAddress", config)

	req.Header.Set("X-PAYMENT", "validPaymentToken")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "success")

	assert.Empty(t, w.Header().Get("X-PAYMENT-RESPONSE"))
}

func TestPaymentMiddleware_Options(t *testing.T) {
	testCases := []struct {
		name    string
		opts    []x402gin.Options
		amount  *big.Float
		address string
	}{
		{
			name: "with custom description",
			opts: []x402gin.Options{
				x402gin.WithDescription("Test Description"),
				x402gin.WithMimeType("application/json"),
				x402gin.WithMaxDeadlineSeconds(120),
				x402gin.WithTestnet(true),
			},
			amount:  big.NewFloat(1.0),
			address: "0xTestAddress",
		},
		{
			name: "with custom paywall HTML",
			opts: []x402gin.Options{
				x402gin.WithCustomPaywallHTML("<html><body>Custom Paywall</body></html>"),
				x402gin.WithResource("test-resource"),
			},
			amount:  big.NewFloat(2.0),
			address: "0xTestAddress2",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			router, w, req := setupTest(t, tc.amount, tc.address, NewTestConfig(), tc.opts...)

			req.Header.Set("X-PAYMENT", "validPaymentToken")
			router.ServeHTTP(w, req)

			assert.Equal(t, http.StatusOK, w.Code)
			assert.Contains(t, w.Body.String(), "success")
			assert.NotEmpty(t, w.Header().Get("X-PAYMENT-RESPONSE"))
		})
	}
}

func TestPaymentMiddleware_NetworkSelection(t *testing.T) {
	testCases := []struct {
		name    string
		testnet bool
	}{
		{
			name:    "base-sepolia",
			testnet: true,
		},
		{
			name:    "base",
			testnet: false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			router, w, req := setupTest(
				t,
				big.NewFloat(1.0),
				"0xTestAddress",
				NewTestConfig(),
				x402gin.WithTestnet(tc.testnet),
			)

			router.ServeHTTP(w, req)

			assert.Equal(t, http.StatusPaymentRequired, w.Code)

			var response map[string]any
			err := json.Unmarshal(w.Body.Bytes(), &response)
			assert.NoError(t, err)

			details, ok := response["paymentDetails"].(map[string]any)
			assert.True(t, ok)

			expectedNetworkID := "8453"
			if tc.testnet {
				expectedNetworkID = "84532"
			}
			assert.Equal(t, expectedNetworkID, details["networkId"])
		})
	}
}

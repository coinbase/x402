package http

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/types"
)

// ============================================================================
// x402HTTPClient - HTTP-aware payment client
// ============================================================================

// x402HTTPClient wraps x402Client with HTTP-specific payment handling
type x402HTTPClient struct {
	client *x402.X402Client
}

// Newx402HTTPClient creates a new HTTP-aware x402 client
func Newx402HTTPClient(client *x402.X402Client) *x402HTTPClient {
	return &x402HTTPClient{
		client: client,
	}
}

// ============================================================================
// Header Encoding/Decoding
// ============================================================================

// EncodePaymentSignatureHeader encodes a payment payload into HTTP headers
// Returns appropriate headers based on protocol version
// Works with raw payload bytes
func (c *x402HTTPClient) EncodePaymentSignatureHeader(payloadBytes []byte) map[string]string {
	// Detect version from bytes
	version, err := types.DetectVersion(payloadBytes)
	if err != nil {
		panic(fmt.Sprintf("failed to detect version: %v", err))
	}

	// Base64 encode the payload bytes
	encoded := base64.StdEncoding.EncodeToString(payloadBytes)

	switch version {
	case 2:
		return map[string]string{
			"PAYMENT-SIGNATURE": encoded,
		}
	case 1:
		return map[string]string{
			"X-PAYMENT": encoded,
		}
	default:
		panic(fmt.Sprintf("unsupported x402 version: %d", version))
	}
}

// GetPaymentRequiredResponse extracts payment requirements from HTTP response
// Handles both v1 (body) and v2 (header) formats
func (c *x402HTTPClient) GetPaymentRequiredResponse(headers map[string]string, body []byte) (x402.PaymentRequired, error) {
	// Normalize headers to uppercase
	normalizedHeaders := make(map[string]string)
	for k, v := range headers {
		normalizedHeaders[strings.ToUpper(k)] = v
	}

	// Check v2 header first
	if header, exists := normalizedHeaders["PAYMENT-REQUIRED"]; exists {
		return decodePaymentRequiredHeader(header)
	}

	// Fall back to v1 body format
	if len(body) > 0 {
		var required x402.PaymentRequired
		if err := json.Unmarshal(body, &required); err == nil {
			if required.X402Version == 1 {
				return required, nil
			}
		}
	}

	return x402.PaymentRequired{}, fmt.Errorf("no payment required information found in response")
}

// GetPaymentSettleResponse extracts settlement response from HTTP headers
func (c *x402HTTPClient) GetPaymentSettleResponse(headers map[string]string) (x402.SettleResponse, error) {
	// Normalize headers to uppercase
	normalizedHeaders := make(map[string]string)
	for k, v := range headers {
		normalizedHeaders[strings.ToUpper(k)] = v
	}

	// Check v2 header
	if header, exists := normalizedHeaders["PAYMENT-RESPONSE"]; exists {
		return decodePaymentResponseHeader(header)
	}

	// Check v1 header
	if header, exists := normalizedHeaders["X-PAYMENT-RESPONSE"]; exists {
		return decodePaymentResponseHeader(header)
	}

	return x402.SettleResponse{}, fmt.Errorf("payment response header not found")
}

// ============================================================================
// HTTP Client Wrapper
// ============================================================================

// WrapHTTPClientWithPayment wraps a standard HTTP client with x402 payment handling
// This allows transparent payment handling for HTTP requests
func WrapHTTPClientWithPayment(client *http.Client, x402Client *x402HTTPClient) *http.Client {
	if client == nil {
		client = http.DefaultClient
	}

	// Wrap the transport with payment handling
	originalTransport := client.Transport
	if originalTransport == nil {
		originalTransport = http.DefaultTransport
	}

	client.Transport = &PaymentRoundTripper{
		Transport:  originalTransport,
		x402Client: x402Client,
		retryCount: &sync.Map{},
	}

	return client
}

// PaymentRoundTripper implements http.RoundTripper with x402 payment handling
type PaymentRoundTripper struct {
	Transport  http.RoundTripper
	x402Client *x402HTTPClient
	retryCount *sync.Map // Track retry count per request to prevent infinite loops
}

// RoundTrip implements http.RoundTripper
func (t *PaymentRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	// Get or initialize retry count for this request
	requestID := fmt.Sprintf("%p", req)
	count, _ := t.retryCount.LoadOrStore(requestID, 0)
	retries := count.(int)

	// Prevent infinite retry loops
	if retries > 1 {
		t.retryCount.Delete(requestID)
		return nil, fmt.Errorf("payment retry limit exceeded")
	}

	// Make initial request
	resp, err := t.Transport.RoundTrip(req)
	if err != nil {
		t.retryCount.Delete(requestID)
		return nil, err
	}

	// If not 402, return as-is
	if resp.StatusCode != http.StatusPaymentRequired {
		t.retryCount.Delete(requestID)
		return resp, nil
	}

	// Increment retry count
	t.retryCount.Store(requestID, retries+1)

	// Extract payment requirements
	headers := make(map[string]string)
	for k, v := range resp.Header {
		if len(v) > 0 {
			headers[k] = v[0]
		}
	}

	// Read body if present (for v1 compatibility)
	var body []byte
	if resp.Body != nil {
		body, err = io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			t.retryCount.Delete(requestID)
			return nil, fmt.Errorf("failed to read 402 response body: %w", err)
		}
	}

	// Parse payment requirements
	paymentRequired, err := t.x402Client.GetPaymentRequiredResponse(headers, body)
	if err != nil {
		t.retryCount.Delete(requestID)
		return nil, fmt.Errorf("failed to parse payment requirements: %w", err)
	}

	// Select and create payment
	selected, err := t.x402Client.client.SelectPaymentRequirements(paymentRequired.X402Version, paymentRequired.Accepts)
	if err != nil {
		t.retryCount.Delete(requestID)
		return nil, fmt.Errorf("cannot fulfill payment requirements: %w", err)
	}

	ctx := req.Context()
	if ctx == nil {
		ctx = context.Background()
	}

	// Marshal selected requirements to bytes
	selectedBytes, err := json.Marshal(selected)
	if err != nil {
		t.retryCount.Delete(requestID)
		return nil, fmt.Errorf("failed to marshal requirements: %w", err)
	}

	// Convert resource if present
	var resourceV2 *types.ResourceInfoV2
	if paymentRequired.Resource != nil {
		resourceV2 = &types.ResourceInfoV2{
			URL:         paymentRequired.Resource.URL,
			Description: paymentRequired.Resource.Description,
			MimeType:    paymentRequired.Resource.MimeType,
		}
	}

	payloadBytes, err := t.x402Client.client.CreatePaymentPayload(ctx, paymentRequired.X402Version, selectedBytes, resourceV2, paymentRequired.Extensions)
	if err != nil {
		t.retryCount.Delete(requestID)
		return nil, fmt.Errorf("failed to create payment: %w", err)
	}

	// Create new request with payment header
	paymentReq := req.Clone(ctx)
	paymentHeaders := t.x402Client.EncodePaymentSignatureHeader(payloadBytes)
	for k, v := range paymentHeaders {
		paymentReq.Header.Set(k, v)
	}

	// Retry with payment
	newResp, err := t.Transport.RoundTrip(paymentReq)
	t.retryCount.Delete(requestID)
	return newResp, err
}

// ============================================================================
// Convenience Methods
// ============================================================================

// DoWithPayment performs an HTTP request with automatic payment handling
func (c *x402HTTPClient) DoWithPayment(ctx context.Context, req *http.Request) (*http.Response, error) {
	// Create a client with our transport
	client := &http.Client{
		Transport: &PaymentRoundTripper{
			Transport:  http.DefaultTransport,
			x402Client: c,
			retryCount: &sync.Map{},
		},
	}

	return client.Do(req.WithContext(ctx))
}

// GetWithPayment performs a GET request with automatic payment handling
func (c *x402HTTPClient) GetWithPayment(ctx context.Context, url string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	return c.DoWithPayment(ctx, req)
}

// PostWithPayment performs a POST request with automatic payment handling
func (c *x402HTTPClient) PostWithPayment(ctx context.Context, url string, body io.Reader) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, "POST", url, body)
	if err != nil {
		return nil, err
	}
	return c.DoWithPayment(ctx, req)
}

// ============================================================================
// Header Encoding/Decoding Functions
// ============================================================================

// encodePaymentSignatureHeader encodes a payment payload as base64
func encodePaymentSignatureHeader(payload x402.PaymentPayload) string {
	data, err := json.Marshal(payload)
	if err != nil {
		panic(fmt.Sprintf("failed to marshal payment payload: %v", err))
	}
	return base64.StdEncoding.EncodeToString(data)
}

// decodePaymentSignatureHeader decodes a base64 payment signature header
func decodePaymentSignatureHeader(header string) (x402.PaymentPayload, error) {
	data, err := base64.StdEncoding.DecodeString(header)
	if err != nil {
		return x402.PaymentPayload{}, fmt.Errorf("invalid base64 encoding: %w", err)
	}

	var payload x402.PaymentPayload
	if err := json.Unmarshal(data, &payload); err != nil {
		return x402.PaymentPayload{}, fmt.Errorf("invalid payment payload JSON: %w", err)
	}

	return payload, nil
}

// encodePaymentRequiredHeader encodes payment requirements as base64
func encodePaymentRequiredHeader(required x402.PaymentRequired) string {
	data, err := json.Marshal(required)
	if err != nil {
		panic(fmt.Sprintf("failed to marshal payment required: %v", err))
	}
	return base64.StdEncoding.EncodeToString(data)
}

// decodePaymentRequiredHeader decodes a base64 payment required header
func decodePaymentRequiredHeader(header string) (x402.PaymentRequired, error) {
	data, err := base64.StdEncoding.DecodeString(header)
	if err != nil {
		return x402.PaymentRequired{}, fmt.Errorf("invalid base64 encoding: %w", err)
	}

	var required x402.PaymentRequired
	if err := json.Unmarshal(data, &required); err != nil {
		return x402.PaymentRequired{}, fmt.Errorf("invalid payment required JSON: %w", err)
	}

	return required, nil
}

// encodePaymentResponseHeader encodes a settlement response as base64
func encodePaymentResponseHeader(response x402.SettleResponse) string {
	data, err := json.Marshal(response)
	if err != nil {
		panic(fmt.Sprintf("failed to marshal settle response: %v", err))
	}
	return base64.StdEncoding.EncodeToString(data)
}

// decodePaymentResponseHeader decodes a base64 payment response header
func decodePaymentResponseHeader(header string) (x402.SettleResponse, error) {
	data, err := base64.StdEncoding.DecodeString(header)
	if err != nil {
		return x402.SettleResponse{}, fmt.Errorf("invalid base64 encoding: %w", err)
	}

	var response x402.SettleResponse
	if err := json.Unmarshal(data, &response); err != nil {
		return x402.SettleResponse{}, fmt.Errorf("invalid settle response JSON: %w", err)
	}

	return response, nil
}

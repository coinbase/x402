package main

import (
	"context"
	"fmt"
	"net/http"
	"time"

	x402 "github.com/coinbase/x402/go"
	x402http "github.com/coinbase/x402/go/http"
	evm "github.com/coinbase/x402/go/mechanisms/evm/exact/client"
	evmsigners "github.com/coinbase/x402/go/signers/evm"
)

/**
 * Request Middleware Example
 *
 * This example demonstrates how to implement custom request/response
 * interceptors (middleware) for x402 HTTP clients:
 * - Adding custom headers to all requests
 * - Request/response logging
 * - Authentication token injection
 * - Response validation
 * - Request modification before payment
 */

// LoggingTransport logs all HTTP requests and responses
type LoggingTransport struct {
	Transport http.RoundTripper
}

func (t *LoggingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	// Log request
	fmt.Printf("📤 [Request Middleware] Outgoing request:\n")
	fmt.Printf("   Method: %s\n", req.Method)
	fmt.Printf("   URL: %s\n", req.URL.String())
	fmt.Printf("   Headers:\n")
	for k, v := range req.Header {
		if k != "PAYMENT-SIGNATURE" && k != "X-PAYMENT" {
			// Don't log payment headers (they're long)
			fmt.Printf("     %s: %v\n", k, v)
		} else {
			fmt.Printf("     %s: [payment data]\n", k)
		}
	}
	fmt.Println()

	// Execute request
	start := time.Now()
	resp, err := t.Transport.RoundTrip(req)
	duration := time.Since(start)

	// Log response
	if err != nil {
		fmt.Printf("📥 [Response Middleware] Request failed after %v: %v\n\n", duration, err)
		return resp, err
	}

	fmt.Printf("📥 [Response Middleware] Response received:\n")
	fmt.Printf("   Status: %d %s\n", resp.StatusCode, resp.Status)
	fmt.Printf("   Duration: %v\n", duration)
	fmt.Printf("   Headers:\n")
	for k, v := range resp.Header {
		if k == "Payment-Response" || k == "X-Payment-Response" {
			fmt.Printf("     %s: [payment settlement data]\n", k)
		} else {
			fmt.Printf("     %s: %v\n", k, v)
		}
	}
	fmt.Println()

	return resp, err
}

// HeaderInjectionTransport adds custom headers to all requests
type HeaderInjectionTransport struct {
	Transport     http.RoundTripper
	CustomHeaders map[string]string
}

func (t *HeaderInjectionTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	// Clone request to avoid modifying the original
	clonedReq := req.Clone(req.Context())

	// Add custom headers
	for k, v := range t.CustomHeaders {
		clonedReq.Header.Set(k, v)
		fmt.Printf("➕ [Header Injection] Added: %s: %s\n", k, v)
	}

	return t.Transport.RoundTrip(clonedReq)
}

// ValidationTransport validates responses before returning them
type ValidationTransport struct {
	Transport http.RoundTripper
}

func (t *ValidationTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	resp, err := t.Transport.RoundTrip(req)
	if err != nil {
		return resp, err
	}

	// Validate response
	fmt.Printf("🔍 [Response Validation] Validating response...\n")

	// Check for payment settlement
	if resp.StatusCode == 200 {
		paymentHeader := resp.Header.Get("PAYMENT-RESPONSE")
		if paymentHeader == "" {
			paymentHeader = resp.Header.Get("X-PAYMENT-RESPONSE")
		}

		if paymentHeader != "" {
			fmt.Printf("   ✅ Payment settled successfully\n")
		} else {
			fmt.Printf("   ℹ️  No payment required for this resource\n")
		}
	}

	fmt.Println()
	return resp, err
}

func runRequestMiddlewareExample(ctx context.Context, evmPrivateKey, url string) error {
	fmt.Println("🔧 Creating client with custom request middleware...\n")

	// Create signer
	evmSigner, err := evmsigners.NewClientSignerFromPrivateKey(evmPrivateKey)
	if err != nil {
		return err
	}

	// Create x402 client
	client := x402.Newx402Client().
		Register("eip155:*", evm.NewExactEvmScheme(evmSigner))

	httpClient := x402http.Newx402HTTPClient(client)

	// Build middleware stack (executes in reverse order):
	// Request flow: HeaderInjection → Logging → Validation → x402Payment → Base Transport
	// Response flow: Base Transport → x402Payment → Validation → Logging → HeaderInjection

	baseTransport := http.DefaultTransport

	// Layer 1: Validation (closest to base transport)
	validationTransport := &ValidationTransport{
		Transport: baseTransport,
	}

	// Layer 2: Logging
	loggingTransport := &LoggingTransport{
		Transport: validationTransport,
	}

	// Layer 3: Custom header injection
	headerTransport := &HeaderInjectionTransport{
		Transport: loggingTransport,
		CustomHeaders: map[string]string{
			"User-Agent":       "x402-go-advanced-client/1.0",
			"X-Client-Version": "2.0.0",
			"X-Request-ID":     fmt.Sprintf("req-%d", time.Now().Unix()),
		},
	}

	// Create HTTP client with middleware stack and wrap with x402 payment handling
	baseClient := &http.Client{
		Transport: headerTransport,
		Timeout:   30 * time.Second,
	}
	
	customClient := x402http.WrapHTTPClientWithPayment(baseClient, httpClient)

	// Make request
	fmt.Printf("🌐 Making request with middleware stack to: %s\n\n", url)

	fmt.Println("📚 Middleware Stack (execution order):")
	fmt.Println("   1. x402 Payment Handling → wraps client with payment logic")
	fmt.Println("   2. Header Injection → adds custom headers")
	fmt.Println("   3. Logging → logs request/response details")
	fmt.Println("   4. Validation → validates responses")
	fmt.Println("   5. Base Transport → actual HTTP call")
	fmt.Println()

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return err
	}

	resp, err := customClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	fmt.Println("✅ Request completed successfully with all middleware layers\n")

	return printResponse(resp, "Response with request middleware")
}


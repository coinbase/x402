// Package http provides HTTP-specific implementations of x402 components.
// This includes HTTP-aware clients, services, and facilitator clients.
package http

import (
	"context"
	"io"
	"net/http"

	x402 "github.com/coinbase/x402/go"
)

// ============================================================================
// Re-export main types for convenience
// ============================================================================

// HTTP Client types
type (
	// HTTPClient is an alias for x402HTTPClient
	HTTPClient = x402HTTPClient

	// HTTPService is an alias for x402HTTPResourceService
	HTTPService = x402HTTPResourceService
)

// ============================================================================
// Constructor functions with simpler names
// ============================================================================

// NewClient creates a new HTTP-aware x402 client
func NewClient(opts ...x402.ClientOption) *x402HTTPClient {
	return Newx402HTTPClient(opts...)
}

// NewService creates a new HTTP resource service
func NewService(routes RoutesConfig, opts ...x402.ResourceServiceOption) *x402HTTPResourceService {
	return Newx402HTTPResourceService(routes, opts...)
}

// NewFacilitatorClient creates a new HTTP facilitator client
func NewFacilitatorClient(config *FacilitatorConfig) *HTTPFacilitatorClient {
	return NewHTTPFacilitatorClient(config)
}

// ============================================================================
// Convenience functions
// ============================================================================

// WrapClient wraps a standard HTTP client with x402 payment handling
func WrapClient(client *http.Client, x402Client *x402HTTPClient) *http.Client {
	return WrapHTTPClientWithPayment(client, x402Client)
}

// Get performs a GET request with automatic payment handling
func Get(ctx context.Context, url string, x402Client *x402HTTPClient) (*http.Response, error) {
	return x402Client.GetWithPayment(ctx, url)
}

// Post performs a POST request with automatic payment handling
func Post(ctx context.Context, url string, body io.Reader, x402Client *x402HTTPClient) (*http.Response, error) {
	return x402Client.PostWithPayment(ctx, url, body)
}

// Do performs an HTTP request with automatic payment handling
func Do(ctx context.Context, req *http.Request, x402Client *x402HTTPClient) (*http.Response, error) {
	return x402Client.DoWithPayment(ctx, req)
}

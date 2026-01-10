package http

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/types"
)

// ============================================================================
// HTTP Adapter Interface
// ============================================================================

// HTTPAdapter provides framework-agnostic HTTP operations
// Implement this for each web framework (Gin, Echo, net/http, etc.)
type HTTPAdapter interface {
	GetHeader(name string) string
	GetMethod() string
	GetPath() string
	GetURL() string
	GetAcceptHeader() string
	GetUserAgent() string
}

// ============================================================================
// Configuration Types
// ============================================================================

// PaywallConfig configures the HTML paywall for browser requests
type PaywallConfig struct {
	CDPClientKey         string `json:"cdpClientKey,omitempty"`
	AppName              string `json:"appName,omitempty"`
	AppLogo              string `json:"appLogo,omitempty"`
	SessionTokenEndpoint string `json:"sessionTokenEndpoint,omitempty"`
	CurrentURL           string `json:"currentUrl,omitempty"`
	Testnet              bool   `json:"testnet,omitempty"`
}

// DynamicPayToFunc is a function that resolves payTo address dynamically based on request context
type DynamicPayToFunc func(context.Context, HTTPRequestContext) (string, error)

// DynamicPriceFunc is a function that resolves price dynamically based on request context
type DynamicPriceFunc func(context.Context, HTTPRequestContext) (x402.Price, error)

// UnpaidResponse represents the custom response for unpaid (402) API requests.
// This allows servers to return preview data, error messages, or other content
// when a request lacks payment.
type UnpaidResponse struct {
	// ContentType is the content type for the response (e.g., "application/json", "text/plain").
	ContentType string

	// Body is the response body to include in the 402 response.
	Body interface{}
}

// UnpaidResponseBodyFunc generates a custom response for unpaid API requests.
// It receives the HTTP request context and returns the content type and body for the 402 response.
//
// For browser requests (Accept: text/html), the paywall HTML takes precedence.
// This callback is only used for API clients.
//
// Args:
//
//	ctx: Context for cancellation
//	reqCtx: HTTP request context
//
// Returns:
//
//	UnpaidResponse with ContentType and Body for the 402 response
type UnpaidResponseBodyFunc func(ctx context.Context, reqCtx HTTPRequestContext) (*UnpaidResponse, error)

// PaymentOption represents a single payment option for a route
// Represents one way a client can pay for access to the resource
type PaymentOption struct {
	Scheme            string                 `json:"scheme"`
	PayTo             interface{}            `json:"payTo"` // string or DynamicPayToFunc
	Price             interface{}            `json:"price"` // x402.Price or DynamicPriceFunc
	Network           x402.Network           `json:"network"`
	MaxTimeoutSeconds int                    `json:"maxTimeoutSeconds,omitempty"`
	Extra             map[string]interface{} `json:"extra,omitempty"`
}

// PaymentOptions is a slice of PaymentOption for convenience
type PaymentOptions = []PaymentOption

// RouteConfig defines payment configuration for an HTTP endpoint
type RouteConfig struct {
	// Payment options for this route
	Accepts PaymentOptions `json:"accepts"`

	// HTTP-specific metadata
	Resource          string                 `json:"resource,omitempty"`
	Description       string                 `json:"description,omitempty"`
	MimeType          string                 `json:"mimeType,omitempty"`
	CustomPaywallHTML string                 `json:"customPaywallHtml,omitempty"`
	Extensions        map[string]interface{} `json:"extensions,omitempty"`

	// UnpaidResponseBody is an optional callback to generate a custom response for unpaid API requests.
	// For browser requests (Accept: text/html), the paywall HTML takes precedence.
	// If not provided, defaults to { ContentType: "application/json", Body: nil }.
	UnpaidResponseBody UnpaidResponseBodyFunc `json:"-"`
}

// RoutesConfig maps route patterns to configurations
type RoutesConfig map[string]RouteConfig

// CompiledRoute is a parsed route ready for matching
type CompiledRoute struct {
	Verb   string
	Regex  *regexp.Regexp
	Config RouteConfig
}

// ============================================================================
// Request/Response Types
// ============================================================================

// HTTPRequestContext encapsulates an HTTP request
type HTTPRequestContext struct {
	Adapter       HTTPAdapter
	Path          string
	Method        string
	PaymentHeader string
}

// HTTPResponseInstructions tells the framework how to respond
type HTTPResponseInstructions struct {
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers"`
	Body    interface{}       `json:"body,omitempty"`
	IsHTML  bool              `json:"isHtml,omitempty"`
}

// HTTPProcessResult indicates the result of processing a payment request
type HTTPProcessResult struct {
	Type                string
	Response            *HTTPResponseInstructions
	PaymentPayload      *types.PaymentPayload      // V2 only
	PaymentRequirements *types.PaymentRequirements // V2 only
}

// Result type constants
const (
	ResultNoPaymentRequired = "no-payment-required"
	ResultPaymentVerified   = "payment-verified"
	ResultPaymentError      = "payment-error"
)

// ProcessSettleResult represents the result of settlement processing
type ProcessSettleResult struct {
	Success     bool
	Headers     map[string]string
	ErrorReason string
	Transaction string
	Network     x402.Network
	Payer       string
}

// ============================================================================
// x402HTTPResourceServer
// ============================================================================

// x402HTTPResourceServer provides HTTP-specific payment handling
type x402HTTPResourceServer struct {
	*x402.X402ResourceServer
	compiledRoutes []CompiledRoute
}

// Newx402HTTPResourceServer creates a new HTTP resource server
func Newx402HTTPResourceServer(routes RoutesConfig, opts ...x402.ResourceServerOption) *x402HTTPResourceServer {
	return Wrappedx402HTTPResourceServer(routes, x402.Newx402ResourceServer(opts...))
}

// Wrappedx402HTTPResourceServer wraps an existing resource server with HTTP functionality.
func Wrappedx402HTTPResourceServer(routes RoutesConfig, resourceServer *x402.X402ResourceServer) *x402HTTPResourceServer {
	server := &x402HTTPResourceServer{
		X402ResourceServer: resourceServer,
		compiledRoutes:     []CompiledRoute{},
	}

	// Handle both single route and multiple routes
	normalizedRoutes := routes
	if normalizedRoutes == nil {
		normalizedRoutes = make(RoutesConfig)
	}

	// Compile routes
	for pattern, config := range normalizedRoutes {
		verb, regex := parseRoutePattern(pattern)
		server.compiledRoutes = append(server.compiledRoutes, CompiledRoute{
			Verb:   verb,
			Regex:  regex,
			Config: config,
		})
	}

	return server
}

// BuildPaymentRequirementsFromOptions builds payment requirements from multiple payment options
// This method handles resolving dynamic values and building requirements for each option
//
// Args:
//
//	ctx: Context for cancellation
//	options: Payment options (may contain dynamic functions)
//	reqCtx: HTTP request context for dynamic resolution
//
// Returns:
//
//	Array of payment requirements (one per option)
func (s *x402HTTPResourceServer) BuildPaymentRequirementsFromOptions(ctx context.Context, options []PaymentOption, reqCtx HTTPRequestContext) ([]types.PaymentRequirements, error) {
	allRequirements := make([]types.PaymentRequirements, 0)

	for _, option := range options {
		// Resolve dynamic payTo and price if they are functions
		var resolvedPayTo string
		if payToFunc, ok := option.PayTo.(DynamicPayToFunc); ok {
			// It's a function, call it
			payTo, err := payToFunc(ctx, reqCtx)
			if err != nil {
				return nil, fmt.Errorf("failed to resolve dynamic payTo: %w", err)
			}
			resolvedPayTo = payTo
		} else if payToStr, ok := option.PayTo.(string); ok {
			// It's a static string
			resolvedPayTo = payToStr
		} else {
			return nil, fmt.Errorf("payTo must be string or DynamicPayToFunc, got %T", option.PayTo)
		}

		// Resolve Price (x402.Price or DynamicPriceFunc)
		var resolvedPrice x402.Price
		if priceFunc, ok := option.Price.(DynamicPriceFunc); ok {
			// It's a function, call it
			price, err := priceFunc(ctx, reqCtx)
			if err != nil {
				return nil, fmt.Errorf("failed to resolve dynamic price: %w", err)
			}
			resolvedPrice = price
		} else {
			// It's a static value (string, number, or AssetAmount)
			resolvedPrice = option.Price
		}

		// Build resource config from this option
		resourceConfig := x402.ResourceConfig{
			Scheme:            option.Scheme,
			PayTo:             resolvedPayTo,
			Price:             resolvedPrice,
			Network:           option.Network,
			MaxTimeoutSeconds: option.MaxTimeoutSeconds,
		}

		// Use existing BuildPaymentRequirementsFromConfig for each option
		requirements, err := s.BuildPaymentRequirementsFromConfig(ctx, resourceConfig)
		if err != nil {
			return nil, fmt.Errorf("failed to build requirements for option %s on %s: %w", option.Scheme, option.Network, err)
		}

		allRequirements = append(allRequirements, requirements...)
	}

	return allRequirements, nil
}

// ProcessHTTPRequest handles an HTTP request and returns processing result
func (s *x402HTTPResourceServer) ProcessHTTPRequest(ctx context.Context, reqCtx HTTPRequestContext, paywallConfig *PaywallConfig) HTTPProcessResult {
	// Find matching route
	routeConfig := s.getRouteConfig(reqCtx.Path, reqCtx.Method)
	if routeConfig == nil {
		return HTTPProcessResult{Type: ResultNoPaymentRequired}
	}

	// Get payment options from route config
	paymentOptions := routeConfig.Accepts
	if len(paymentOptions) == 0 {
		return HTTPProcessResult{Type: ResultNoPaymentRequired}
	}

	// Check for payment header (V2 only)
	typedPayload, err := s.extractPaymentV2(reqCtx.Adapter)
	if err != nil {
		return HTTPProcessResult{
			Type:     ResultPaymentError,
			Response: &HTTPResponseInstructions{Status: 400, Body: map[string]string{"error": "Invalid payment"}},
		}
	}

	// Build requirements from all payment options (resolves dynamic values inline)
	requirements, err := s.BuildPaymentRequirementsFromOptions(ctx, paymentOptions, reqCtx)
	if err != nil {
		return HTTPProcessResult{
			Type: ResultPaymentError,
			Response: &HTTPResponseInstructions{
				Status:  500,
				Headers: map[string]string{"Content-Type": "application/json"},
				Body:    map[string]string{"error": err.Error()},
			},
		}
	}

	// Create resource info from route config
	resourceInfo := &types.ResourceInfo{
		URL:         reqCtx.Adapter.GetURL(),
		Description: routeConfig.Description,
		MimeType:    routeConfig.MimeType,
	}

	for i := range requirements {
		if requirements[i].Extra == nil {
			requirements[i].Extra = make(map[string]interface{})
		}
		requirements[i].Extra["resourceUrl"] = resourceInfo.URL
	}

	extensions := routeConfig.Extensions
	// TODO: Add EnrichExtensions method if needed
	// if extensions != nil && len(extensions) > 0 {
	// 	extensions = s.EnrichExtensions(extensions, reqCtx)
	// }

	if typedPayload == nil {
		paymentRequired := s.CreatePaymentRequiredResponse(
			requirements,
			resourceInfo,
			"Payment required",
			extensions,
		)

		// Call the UnpaidResponseBody callback if provided
		var unpaidResponse *UnpaidResponse
		if routeConfig.UnpaidResponseBody != nil {
			unpaidResp, err := routeConfig.UnpaidResponseBody(ctx, reqCtx)
			if err != nil {
				return HTTPProcessResult{
					Type: ResultPaymentError,
					Response: &HTTPResponseInstructions{
						Status:  500,
						Headers: map[string]string{"Content-Type": "application/json"},
						Body:    map[string]string{"error": fmt.Sprintf("Failed to generate unpaid response: %v", err)},
					},
				}
			}
			unpaidResponse = unpaidResp
		}

		return HTTPProcessResult{
			Type: ResultPaymentError,
			Response: s.createHTTPResponseV2(
				paymentRequired,
				s.isWebBrowser(reqCtx.Adapter),
				paywallConfig,
				routeConfig.CustomPaywallHTML,
				unpaidResponse,
			),
		}
	}

	// Find matching requirements (type-safe)
	matchingReqs := s.FindMatchingRequirements(requirements, *typedPayload)
	if matchingReqs == nil {
		paymentRequired := s.CreatePaymentRequiredResponse(
			requirements,
			resourceInfo,
			"No matching payment requirements",
			extensions,
		)

		return HTTPProcessResult{
			Type:     ResultPaymentError,
			Response: s.createHTTPResponseV2(paymentRequired, false, paywallConfig, "", nil),
		}
	}

	// Verify payment (type-safe)
	_, verifyErr := s.VerifyPayment(ctx, *typedPayload, *matchingReqs)
	if verifyErr != nil {
		err = verifyErr
		errorMsg := err.Error()

		paymentRequired := s.CreatePaymentRequiredResponse(
			requirements,
			resourceInfo,
			errorMsg,
			extensions,
		)

		return HTTPProcessResult{
			Type:     ResultPaymentError,
			Response: s.createHTTPResponseV2(paymentRequired, false, paywallConfig, "", nil),
		}
	}

	// Payment verified
	return HTTPProcessResult{
		Type:                ResultPaymentVerified,
		PaymentPayload:      typedPayload,
		PaymentRequirements: matchingReqs,
	}
}

// RequiresPayment checks if a request requires payment based on route configuration
func (s *x402HTTPResourceServer) RequiresPayment(reqCtx HTTPRequestContext) bool {
	routeConfig := s.getRouteConfig(reqCtx.Path, reqCtx.Method)
	return routeConfig != nil
}

// ProcessSettlement handles settlement after successful response
func (s *x402HTTPResourceServer) ProcessSettlement(ctx context.Context, payload types.PaymentPayload, requirements types.PaymentRequirements) *ProcessSettleResult {
	// Settle payment (type-safe, no marshal needed)
	settleResult, err := s.SettlePayment(ctx, payload, requirements)
	if err != nil {
		return &ProcessSettleResult{
			Success:     false,
			ErrorReason: err.Error(),
		}
	}

	if !settleResult.Success {
		return &ProcessSettleResult{
			Success:     false,
			ErrorReason: settleResult.ErrorReason,
		}
	}

	return &ProcessSettleResult{
		Success:     true,
		Headers:     s.createSettlementHeaders(settleResult),
		Transaction: settleResult.Transaction,
		Network:     settleResult.Network,
		Payer:       settleResult.Payer,
	}
}

// ============================================================================
// Helper Methods
// ============================================================================

// getRouteConfig finds matching route configuration
func (s *x402HTTPResourceServer) getRouteConfig(path, method string) *RouteConfig {
	normalizedPath := normalizePath(path)
	upperMethod := strings.ToUpper(method)

	for _, route := range s.compiledRoutes {
		if route.Regex.MatchString(normalizedPath) &&
			(route.Verb == "*" || route.Verb == upperMethod) {
			config := route.Config // Make a copy
			return &config
		}
	}

	return nil
}

// extractPaymentV2 extracts V2 payment from headers (V2 only)
func (s *x402HTTPResourceServer) extractPaymentV2(adapter HTTPAdapter) (*types.PaymentPayload, error) {
	// Check v2 header
	header := adapter.GetHeader("PAYMENT-SIGNATURE")
	if header == "" {
		header = adapter.GetHeader("payment-signature")
	}

	if header == "" {
		return nil, nil // No payment header
	}

	// Decode base64 header
	jsonBytes, err := decodeBase64Header(header)
	if err != nil {
		return nil, fmt.Errorf("failed to decode payment header: %w", err)
	}

	// Detect version
	version, err := types.DetectVersion(jsonBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to detect version: %w", err)
	}

	// V2 server only accepts V2 payments
	if version != 2 {
		return nil, fmt.Errorf("only V2 payments supported, got V%d", version)
	}

	// Unmarshal to V2 payload
	payload, err := types.ToPaymentPayload(jsonBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal V2 payload: %w", err)
	}

	return payload, nil
}

// extractPayment extracts payment from headers (legacy method, now calls extractPaymentV2)
//
//nolint:unused // Legacy method kept for API compatibility
func (s *x402HTTPResourceServer) extractPayment(adapter HTTPAdapter) *x402.PaymentPayload {
	payload, err := s.extractPaymentV2(adapter)
	if err != nil || payload == nil {
		return nil
	}

	// Convert V2 to generic PaymentPayload for compatibility
	return &x402.PaymentPayload{
		X402Version: payload.X402Version,
		Payload:     payload.Payload,
		Accepted:    x402.PaymentRequirements{}, // TODO: Convert
		Resource:    nil,
		Extensions:  payload.Extensions,
	}
}

// decodeBase64Header decodes a base64 header to JSON bytes
func decodeBase64Header(header string) ([]byte, error) {
	return base64.StdEncoding.DecodeString(header)
}

// isWebBrowser checks if request is from a web browser
func (s *x402HTTPResourceServer) isWebBrowser(adapter HTTPAdapter) bool {
	accept := adapter.GetAcceptHeader()
	userAgent := adapter.GetUserAgent()
	return strings.Contains(accept, "text/html") && strings.Contains(userAgent, "Mozilla")
}

// createHTTPResponseV2 creates response instructions for V2 PaymentRequired
//
// Args:
//
//	paymentRequired: The payment required response
//	isWebBrowser: Whether the request is from a web browser
//	paywallConfig: Optional paywall configuration
//	customHTML: Optional custom HTML for the paywall
//	unpaidResponse: Optional custom response for API clients (ignored for browser requests)
func (s *x402HTTPResourceServer) createHTTPResponseV2(paymentRequired types.PaymentRequired, isWebBrowser bool, paywallConfig *PaywallConfig, customHTML string, unpaidResponse *UnpaidResponse) *HTTPResponseInstructions {
	if isWebBrowser {
		html := s.generatePaywallHTMLV2(paymentRequired, paywallConfig, customHTML)
		return &HTTPResponseInstructions{
			Status: 402,
			Headers: map[string]string{
				"Content-Type": "text/html",
			},
			Body:   html,
			IsHTML: true,
		}
	}

	// Use custom unpaid response if provided, otherwise default to JSON with no body
	contentType := "application/json"
	var body interface{}

	if unpaidResponse != nil {
		contentType = unpaidResponse.ContentType
		body = unpaidResponse.Body
	}

	return &HTTPResponseInstructions{
		Status: 402,
		Headers: map[string]string{
			"Content-Type":     contentType,
			"PAYMENT-REQUIRED": encodePaymentRequiredHeader(paymentRequired),
		},
		Body: body,
	}
}

// createHTTPResponse creates response instructions (legacy method)
//
//nolint:unused // Legacy method kept for API compatibility
func (s *x402HTTPResourceServer) createHTTPResponse(paymentRequired x402.PaymentRequired, isWebBrowser bool, paywallConfig *PaywallConfig, customHTML string) *HTTPResponseInstructions {
	// Convert to V2 and call V2 method
	v2Required := types.PaymentRequired{
		X402Version: 2,
		Error:       paymentRequired.Error,
		Resource:    nil, // TODO: convert
		Extensions:  paymentRequired.Extensions,
	}
	return s.createHTTPResponseV2(v2Required, isWebBrowser, paywallConfig, customHTML, nil)
}

// createSettlementHeaders creates settlement response headers
func (s *x402HTTPResourceServer) createSettlementHeaders(response *x402.SettleResponse) map[string]string {
	return map[string]string{
		"PAYMENT-RESPONSE": encodePaymentResponseHeader(*response),
	}
}

// generatePaywallHTMLV2 generates HTML paywall for V2 PaymentRequired
func (s *x402HTTPResourceServer) generatePaywallHTMLV2(paymentRequired types.PaymentRequired, config *PaywallConfig, customHTML string) string {
	if customHTML != "" {
		return customHTML
	}

	// Convert V2 to generic format to reuse existing HTML generation
	genericRequired := x402.PaymentRequired{
		X402Version: paymentRequired.X402Version,
		Error:       paymentRequired.Error,
		Resource:    nil,                          // Will convert
		Accepts:     []x402.PaymentRequirements{}, // Will convert
		Extensions:  paymentRequired.Extensions,
	}

	// Convert resource
	if paymentRequired.Resource != nil {
		genericRequired.Resource = &x402.ResourceInfo{
			URL:         paymentRequired.Resource.URL,
			Description: paymentRequired.Resource.Description,
			MimeType:    paymentRequired.Resource.MimeType,
		}
	}

	// Convert accepts
	for _, reqV2 := range paymentRequired.Accepts {
		genericRequired.Accepts = append(genericRequired.Accepts, x402.PaymentRequirements{
			Scheme:  reqV2.Scheme,
			Network: reqV2.Network,
			Asset:   reqV2.Asset,
			Amount:  reqV2.Amount,
			PayTo:   reqV2.PayTo,
			Extra:   reqV2.Extra,
		})
	}

	// Reuse existing HTML generation
	return s.generatePaywallHTML(genericRequired, config, customHTML)
}

// generatePaywallHTML generates HTML paywall for browsers
func (s *x402HTTPResourceServer) generatePaywallHTML(paymentRequired x402.PaymentRequired, config *PaywallConfig, customHTML string) string {
	if customHTML != "" {
		return customHTML
	}

	// Calculate display amount (assuming USDC with 6 decimals)
	displayAmount := s.getDisplayAmount(paymentRequired)

	resourceDesc := ""
	if paymentRequired.Resource != nil {
		if paymentRequired.Resource.Description != "" {
			resourceDesc = paymentRequired.Resource.Description
		} else if paymentRequired.Resource.URL != "" {
			resourceDesc = paymentRequired.Resource.URL
		}
	}

	appLogo := ""
	appName := ""
	cdpClientKey := ""
	testnet := false

	if config != nil {
		if config.AppLogo != "" {
			appLogo = fmt.Sprintf(`<img src="%s" alt="%s" style="max-width: 200px; margin-bottom: 20px;">`,
				html.EscapeString(config.AppLogo),
				html.EscapeString(config.AppName))
		}
		appName = config.AppName
		cdpClientKey = config.CDPClientKey
		testnet = config.Testnet
	}

	requirementsJSON, _ := json.Marshal(paymentRequired)

	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
	<title>Payment Required</title>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<style>
		body { 
			font-family: system-ui, -apple-system, sans-serif;
			margin: 0;
			padding: 0;
			background: #f5f5f5;
		}
		.container { 
			max-width: 600px; 
			margin: 50px auto; 
			padding: 20px;
			background: white;
			border-radius: 8px;
			box-shadow: 0 2px 4px rgba(0,0,0,0.1);
		}
		.logo { margin-bottom: 20px; }
		h1 { color: #333; }
		.info { margin: 20px 0; }
		.info p { margin: 10px 0; }
		.amount { 
			font-size: 24px; 
			font-weight: bold; 
			color: #0066cc;
			margin: 20px 0;
		}
		#payment-widget {
			margin-top: 30px;
			padding: 20px;
			border: 1px dashed #ccc;
			border-radius: 4px;
			background: #fafafa;
			text-align: center;
			color: #666;
		}
	</style>
</head>
<body>
	<div class="container">
		%s
		<h1>Payment Required</h1>
		<div class="info">
			<p><strong>Resource:</strong> %s</p>
			<p class="amount">Amount: $%.2f USDC</p>
		</div>
		<div id="payment-widget" 
			data-requirements='%s'
			data-cdp-client-key="%s"
			data-app-name="%s"
			data-testnet="%t">
			<!-- CDP widget would be injected here -->
			<p>Loading payment widget...</p>
		</div>
	</div>
</body>
</html>`,
		appLogo,
		html.EscapeString(resourceDesc),
		displayAmount,
		html.EscapeString(string(requirementsJSON)),
		html.EscapeString(cdpClientKey),
		html.EscapeString(appName),
		testnet,
	)
}

// getDisplayAmount extracts display amount from payment requirements
func (s *x402HTTPResourceServer) getDisplayAmount(paymentRequired x402.PaymentRequired) float64 {
	if len(paymentRequired.Accepts) > 0 {
		firstReq := paymentRequired.Accepts[0]
		// Check if amount field exists
		if firstReq.Amount != "" {
			// V2 format - parse amount
			amount, err := strconv.ParseFloat(firstReq.Amount, 64)
			if err == nil {
				// Assuming USDC with 6 decimals
				return amount / 1000000
			}
		}
	}
	return 0.0
}

// ============================================================================
// Utility Functions
// ============================================================================

// parseRoutePattern parses a route pattern like "GET /api/*"
func parseRoutePattern(pattern string) (string, *regexp.Regexp) {
	parts := strings.Fields(pattern)

	var verb, path string
	if len(parts) == 2 {
		verb = strings.ToUpper(parts[0])
		path = parts[1]
	} else {
		verb = "*"
		path = pattern
	}

	// Convert pattern to regex
	regexPattern := "^" + regexp.QuoteMeta(path)
	regexPattern = strings.ReplaceAll(regexPattern, `\*`, `.*?`)
	// Handle parameters like [id]
	paramRegex := regexp.MustCompile(`\\\[([^\]]+)\\\]`)
	regexPattern = paramRegex.ReplaceAllString(regexPattern, `[^/]+`)
	regexPattern += "$"

	regex := regexp.MustCompile(regexPattern)

	return verb, regex
}

// normalizePath normalizes a URL path for matching
func normalizePath(path string) string {
	// Remove query string and fragment
	if idx := strings.IndexAny(path, "?#"); idx >= 0 {
		path = path[:idx]
	}

	// Decode URL encoding
	if decoded, err := url.PathUnescape(path); err == nil {
		path = decoded
	}

	// Normalize slashes
	path = strings.ReplaceAll(path, `\`, `/`)
	// Replace multiple slashes with single slash
	multiSlash := regexp.MustCompile(`/+`)
	path = multiSlash.ReplaceAllString(path, `/`)
	// Remove trailing slash
	path = strings.TrimSuffix(path, `/`)

	if path == "" {
		path = "/"
	}

	return path
}

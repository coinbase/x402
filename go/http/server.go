package http

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	x402 "github.com/coinbase/x402/go"
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

// RouteConfig defines payment configuration for an HTTP endpoint
// PayTo and Price can be static values or functions for dynamic resolution
type RouteConfig struct {
	// Payment configuration
	Scheme            string                 `json:"scheme"`
	PayTo             interface{}            `json:"payTo"` // string or DynamicPayToFunc
	Price             interface{}            `json:"price"` // x402.Price or DynamicPriceFunc
	Network           x402.Network           `json:"network"`
	MaxTimeoutSeconds int                    `json:"maxTimeoutSeconds,omitempty"`
	Extra             map[string]interface{} `json:"extra,omitempty"`

	// HTTP-specific metadata
	Resource          string                 `json:"resource,omitempty"`
	Description       string                 `json:"description,omitempty"`
	MimeType          string                 `json:"mimeType,omitempty"`
	CustomPaywallHTML string                 `json:"customPaywallHtml,omitempty"`
	Discoverable      bool                   `json:"discoverable,omitempty"`
	InputSchema       interface{}            `json:"inputSchema,omitempty"`
	OutputSchema      interface{}            `json:"outputSchema,omitempty"`
	Extensions        map[string]interface{} `json:"extensions,omitempty"`
}

// ResolvedRouteConfig is a RouteConfig with all dynamic values resolved to static values
type ResolvedRouteConfig struct {
	// Payment configuration (all resolved to static values)
	Scheme            string
	PayTo             string
	Price             x402.Price
	Network           x402.Network
	MaxTimeoutSeconds int
	Extra             map[string]interface{}

	// HTTP-specific metadata
	Resource          string
	Description       string
	MimeType          string
	CustomPaywallHTML string
	Discoverable      bool
	InputSchema       interface{}
	OutputSchema      interface{}
	Extensions        map[string]interface{}
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
	PaymentPayload      *x402.PaymentPayload
	PaymentRequirements *x402.PaymentRequirements
}

// Result type constants
const (
	ResultNoPaymentRequired = "no-payment-required"
	ResultPaymentVerified   = "payment-verified"
	ResultPaymentError      = "payment-error"
)

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
	server := &x402HTTPResourceServer{
		X402ResourceServer: x402.Newx402ResourceServer(opts...),
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

// resolveRouteConfig resolves dynamic route config values.
// Evaluates any function-based payTo or price values using the request context.
//
// Args:
//
//	ctx: Context for cancellation
//	routeConfig: The route configuration (may contain functions)
//	reqCtx: HTTP request context for dynamic resolution
//
// Returns:
//
//	Resolved route configuration with static values
func (s *x402HTTPResourceServer) resolveRouteConfig(ctx context.Context, routeConfig *RouteConfig, reqCtx HTTPRequestContext) (*ResolvedRouteConfig, error) {
	resolved := &ResolvedRouteConfig{
		Scheme:            routeConfig.Scheme,
		Network:           routeConfig.Network,
		MaxTimeoutSeconds: routeConfig.MaxTimeoutSeconds,
		Extra:             routeConfig.Extra,
		Resource:          routeConfig.Resource,
		Description:       routeConfig.Description,
		MimeType:          routeConfig.MimeType,
		CustomPaywallHTML: routeConfig.CustomPaywallHTML,
		Discoverable:      routeConfig.Discoverable,
		InputSchema:       routeConfig.InputSchema,
		OutputSchema:      routeConfig.OutputSchema,
		Extensions:        routeConfig.Extensions,
	}

	// Resolve PayTo (string or DynamicPayToFunc)
	if payToFunc, ok := routeConfig.PayTo.(DynamicPayToFunc); ok {
		// It's a function, call it
		payTo, err := payToFunc(ctx, reqCtx)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve dynamic payTo: %w", err)
		}
		resolved.PayTo = payTo
	} else if payToStr, ok := routeConfig.PayTo.(string); ok {
		// It's a static string
		resolved.PayTo = payToStr
	} else {
		return nil, fmt.Errorf("payTo must be string or DynamicPayToFunc, got %T", routeConfig.PayTo)
	}

	// Resolve Price (x402.Price or DynamicPriceFunc)
	if priceFunc, ok := routeConfig.Price.(DynamicPriceFunc); ok {
		// It's a function, call it
		price, err := priceFunc(ctx, reqCtx)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve dynamic price: %w", err)
		}
		resolved.Price = price
	} else {
		// It's a static value (string, number, or AssetAmount)
		resolved.Price = routeConfig.Price
	}

	return resolved, nil
}

// ProcessHTTPRequest handles an HTTP request and returns processing result
func (s *x402HTTPResourceServer) ProcessHTTPRequest(ctx context.Context, reqCtx HTTPRequestContext, paywallConfig *PaywallConfig) HTTPProcessResult {
	// Find matching route
	routeConfig := s.getRouteConfig(reqCtx.Path, reqCtx.Method)
	if routeConfig == nil {
		return HTTPProcessResult{Type: ResultNoPaymentRequired}
	}

	// Resolve dynamic payTo and price
	resolvedConfig, err := s.resolveRouteConfig(ctx, routeConfig, reqCtx)
	if err != nil {
		return HTTPProcessResult{
			Type: ResultPaymentError,
			Response: &HTTPResponseInstructions{
				Status:  500,
				Headers: map[string]string{"Content-Type": "application/json"},
				Body:    map[string]string{"error": fmt.Sprintf("Failed to resolve route config: %v", err)},
			},
		}
	}

	// Check for payment header
	paymentPayload := s.extractPayment(reqCtx.Adapter)

	// Build payment requirements from RESOLVED config
	requirements, err := s.BuildPaymentRequirements(ctx, x402.ResourceConfig{
		Scheme:            resolvedConfig.Scheme,
		PayTo:             resolvedConfig.PayTo,
		Price:             resolvedConfig.Price,
		Network:           resolvedConfig.Network,
		MaxTimeoutSeconds: resolvedConfig.MaxTimeoutSeconds,
	})

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

	// Create resource info from RESOLVED config
	resourceInfo := x402.ResourceInfo{
		URL:         reqCtx.Adapter.GetURL(),
		Description: resolvedConfig.Description,
		MimeType:    resolvedConfig.MimeType,
	}

	for i := range requirements {
		if requirements[i].Extra == nil {
			requirements[i].Extra = make(map[string]interface{})
		}
		requirements[i].Extra["resourceUrl"] = resourceInfo.URL
	}

	extensions := resolvedConfig.Extensions
	if extensions != nil && len(extensions) > 0 {
		extensions = s.EnrichExtensions(extensions, reqCtx)
	}

	if paymentPayload == nil {
		paymentRequired := s.CreatePaymentRequiredResponse(
			requirements,
			resourceInfo,
			"Payment required",
			extensions,
		)

		return HTTPProcessResult{
			Type: ResultPaymentError,
			Response: s.createHTTPResponse(
				paymentRequired,
				s.isWebBrowser(reqCtx.Adapter),
				paywallConfig,
				resolvedConfig.CustomPaywallHTML,
			),
		}
	}

	// Marshal payment payload to bytes for matching/verification
	payloadBytes, err := json.Marshal(paymentPayload)
	if err != nil {
		return HTTPProcessResult{
			Type:     ResultPaymentError,
			Response: &HTTPResponseInstructions{Status: 500},
		}
	}

	// Find matching requirements
	matchingReqs := s.FindMatchingRequirements(requirements, payloadBytes)
	if matchingReqs == nil {
		paymentRequired := s.CreatePaymentRequiredResponse(
			requirements,
			resourceInfo,
			"No matching payment requirements",
			extensions,
		)

		return HTTPProcessResult{
			Type:     ResultPaymentError,
			Response: s.createHTTPResponse(paymentRequired, false, paywallConfig, ""),
		}
	}

	// Marshal requirements to bytes for verification
	requirementsBytes, err := json.Marshal(matchingReqs)
	if err != nil {
		return HTTPProcessResult{
			Type:     ResultPaymentError,
			Response: &HTTPResponseInstructions{Status: 500},
		}
	}

	// Verify payment
	verifyResult, err := s.VerifyPayment(ctx, payloadBytes, requirementsBytes)
	if err != nil || !verifyResult.IsValid {
		errorMsg := "Payment verification failed"
		if err != nil {
			errorMsg = err.Error()
		} else if verifyResult.InvalidReason != "" {
			errorMsg = verifyResult.InvalidReason
		}

		paymentRequired := s.CreatePaymentRequiredResponse(
			requirements,
			resourceInfo,
			errorMsg,
			extensions,
		)

		return HTTPProcessResult{
			Type:     ResultPaymentError,
			Response: s.createHTTPResponse(paymentRequired, false, paywallConfig, ""),
		}
	}

	// Payment verified
	return HTTPProcessResult{
		Type:                ResultPaymentVerified,
		PaymentPayload:      paymentPayload,
		PaymentRequirements: matchingReqs,
	}
}

// ProcessSettlement handles settlement after successful response
func (s *x402HTTPResourceServer) ProcessSettlement(ctx context.Context, payload x402.PaymentPayload, requirements x402.PaymentRequirements, responseStatus int) (map[string]string, error) {
	// Don't settle if response failed
	if responseStatus >= 400 {
		return nil, nil
	}

	// Marshal to bytes for settlement
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	requirementsBytes, err := json.Marshal(requirements)
	if err != nil {
		return nil, err
	}

	settleResult, err := s.SettlePayment(ctx, payloadBytes, requirementsBytes)
	if err != nil {
		return nil, err
	}

	return s.createSettlementHeaders(settleResult), nil
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

// extractPayment extracts payment from headers
func (s *x402HTTPResourceServer) extractPayment(adapter HTTPAdapter) *x402.PaymentPayload {
	// Check v2 header
	header := adapter.GetHeader("PAYMENT-SIGNATURE")
	if header == "" {
		header = adapter.GetHeader("payment-signature")
	}

	if header != "" {
		payload, err := decodePaymentSignatureHeader(header)
		if err == nil {
			return &payload
		}
	}

	// Check v1 header
	header = adapter.GetHeader("X-PAYMENT")
	if header == "" {
		header = adapter.GetHeader("x-payment")
	}

	if header != "" {
		payload, err := decodePaymentSignatureHeader(header)
		if err == nil {
			return &payload
		}
	}

	return nil
}

// isWebBrowser checks if request is from a web browser
func (s *x402HTTPResourceServer) isWebBrowser(adapter HTTPAdapter) bool {
	accept := adapter.GetAcceptHeader()
	userAgent := adapter.GetUserAgent()
	return strings.Contains(accept, "text/html") && strings.Contains(userAgent, "Mozilla")
}

// createHTTPResponse creates response instructions
func (s *x402HTTPResourceServer) createHTTPResponse(paymentRequired x402.PaymentRequired, isWebBrowser bool, paywallConfig *PaywallConfig, customHTML string) *HTTPResponseInstructions {
	if isWebBrowser {
		html := s.generatePaywallHTML(paymentRequired, paywallConfig, customHTML)
		return &HTTPResponseInstructions{
			Status: 402,
			Headers: map[string]string{
				"Content-Type": "text/html",
			},
			Body:   html,
			IsHTML: true,
		}
	}

	return &HTTPResponseInstructions{
		Status: 402,
		Headers: map[string]string{
			"Content-Type":     "application/json",
			"PAYMENT-REQUIRED": encodePaymentRequiredHeader(paymentRequired),
		},
	}
}

// createSettlementHeaders creates settlement response headers
func (s *x402HTTPResourceServer) createSettlementHeaders(response x402.SettleResponse) map[string]string {
	return map[string]string{
		"PAYMENT-RESPONSE": encodePaymentResponseHeader(response),
	}
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

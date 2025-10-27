# GIN - Gin Framework Middleware for x402

This package provides Gin framework middleware for the x402 payment protocol, enabling easy integration with Gin-based APIs.

```go
package gin

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	
	"github.com/gin-gonic/gin"
	x402 "github.com/coinbase/x402-go/v2"
	x402http "github.com/coinbase/x402-go/v2/http"
)

// ============================================================================
// Gin Adapter Implementation
// ============================================================================

// GinAdapter implements HTTPAdapter for Gin framework
type GinAdapter struct {
	ctx *gin.Context
}

// NewGinAdapter creates a new Gin adapter
func NewGinAdapter(ctx *gin.Context) *GinAdapter {
	return &GinAdapter{ctx: ctx}
}

// GetHeader gets a request header
func (a *GinAdapter) GetHeader(name string) string {
	return a.ctx.GetHeader(name)
}

// GetMethod gets the HTTP method
func (a *GinAdapter) GetMethod() string {
	return a.ctx.Request.Method
}

// GetPath gets the request path
func (a *GinAdapter) GetPath() string {
	return a.ctx.Request.URL.Path
}

// GetURL gets the full request URL
func (a *GinAdapter) GetURL() string {
	scheme := "http"
	if a.ctx.Request.TLS != nil {
		scheme = "https"
	}
	host := a.ctx.Request.Host
	if host == "" {
		host = a.ctx.GetHeader("Host")
	}
	return fmt.Sprintf("%s://%s%s", scheme, host, a.ctx.Request.URL.Path)
}

// GetAcceptHeader gets the Accept header
func (a *GinAdapter) GetAcceptHeader() string {
	return a.ctx.GetHeader("Accept")
}

// GetUserAgent gets the User-Agent header
func (a *GinAdapter) GetUserAgent() string {
	return a.ctx.GetHeader("User-Agent")
}

// ============================================================================
// Middleware Configuration
// ============================================================================

// MiddlewareConfig configures the payment middleware
type MiddlewareConfig struct {
	// Routes configuration
	Routes x402http.RoutesConfig
	
	// Facilitator client(s)
	FacilitatorClients []x402.FacilitatorClient
	
	// Scheme registrations
	Schemes []SchemeRegistration
	
	// Paywall configuration
	PaywallConfig *x402http.PaywallConfig
	
	// Initialize on startup
	InitializeOnStart bool
	
	// Custom error handler
	ErrorHandler func(*gin.Context, error)
	
	// Custom settlement handler
	SettlementHandler func(*gin.Context, x402.SettleResponse)
	
	// Context timeout for payment operations
	Timeout time.Duration
}

// SchemeRegistration registers a scheme with the service
type SchemeRegistration struct {
	Network x402.Network
	Service x402.SchemeNetworkService
}

// MiddlewareOption configures the middleware
type MiddlewareOption func(*MiddlewareConfig)

// WithFacilitatorClient adds a facilitator client
func WithFacilitatorClient(client x402.FacilitatorClient) MiddlewareOption {
	return func(c *MiddlewareConfig) {
		c.FacilitatorClients = append(c.FacilitatorClients, client)
	}
}

// WithScheme registers a scheme service
func WithScheme(network x402.Network, service x402.SchemeNetworkService) MiddlewareOption {
	return func(c *MiddlewareConfig) {
		c.Schemes = append(c.Schemes, SchemeRegistration{
			Network: network,
			Service: service,
		})
	}
}

// WithPaywallConfig sets the paywall configuration
func WithPaywallConfig(config *x402http.PaywallConfig) MiddlewareOption {
	return func(c *MiddlewareConfig) {
		c.PaywallConfig = config
	}
}

// WithInitializeOnStart sets whether to initialize on startup
func WithInitializeOnStart(initialize bool) MiddlewareOption {
	return func(c *MiddlewareConfig) {
		c.InitializeOnStart = initialize
	}
}

// WithErrorHandler sets a custom error handler
func WithErrorHandler(handler func(*gin.Context, error)) MiddlewareOption {
	return func(c *MiddlewareConfig) {
		c.ErrorHandler = handler
	}
}

// WithSettlementHandler sets a custom settlement handler
func WithSettlementHandler(handler func(*gin.Context, x402.SettleResponse)) MiddlewareOption {
	return func(c *MiddlewareConfig) {
		c.SettlementHandler = handler
	}
}

// WithTimeout sets the context timeout for payment operations
func WithTimeout(timeout time.Duration) MiddlewareOption {
	return func(c *MiddlewareConfig) {
		c.Timeout = timeout
	}
}

// ============================================================================
// Payment Middleware
// ============================================================================

// PaymentMiddleware creates Gin middleware for x402 payment handling
func PaymentMiddleware(routes x402http.RoutesConfig, opts ...MiddlewareOption) gin.HandlerFunc {
	config := &MiddlewareConfig{
		Routes:            routes,
		FacilitatorClients: []x402.FacilitatorClient{},
		Schemes:           []SchemeRegistration{},
		InitializeOnStart: true,
		Timeout:           30 * time.Second,
	}
	
	// Apply options
	for _, opt := range opts {
		opt(config)
	}
	
	// Create service options
	serviceOpts := []x402.ResourceServiceOption{}
	for _, client := range config.FacilitatorClients {
		serviceOpts = append(serviceOpts, x402.WithFacilitatorClient(client))
	}
	
	// Create HTTP service
	service := x402http.NewHTTPResourceService(config.Routes, serviceOpts...)
	
	// Register schemes
	for _, scheme := range config.Schemes {
		service.RegisterScheme(scheme.Network, scheme.Service)
	}
	
	// Initialize if requested
	if config.InitializeOnStart {
		ctx, cancel := context.WithTimeout(context.Background(), config.Timeout)
		defer cancel()
		
		if err := service.Initialize(ctx); err != nil {
			// Log initialization error but don't fail - facilitator might come online later
			fmt.Printf("Warning: failed to initialize x402 service: %v\n", err)
		}
	}
	
	// Create middleware handler
	return func(c *gin.Context) {
		// Create context with timeout
		ctx, cancel := context.WithTimeout(c.Request.Context(), config.Timeout)
		defer cancel()
		
		// Create adapter and request context
		adapter := NewGinAdapter(c)
		reqCtx := x402http.HTTPRequestContext{
			Adapter: adapter,
			Path:    c.Request.URL.Path,
			Method:  c.Request.Method,
		}
		
		// Process HTTP request
		result := service.ProcessHTTPRequest(ctx, reqCtx, config.PaywallConfig)
		
		// Handle result
		switch result.Type {
		case x402http.ResultNoPaymentRequired:
			// No payment required, continue to next handler
			c.Next()
			
		case x402http.ResultPaymentError:
			// Payment required but not provided or invalid
			handlePaymentError(c, result.Response, config)
			
		case x402http.ResultPaymentVerified:
			// Payment verified, continue with settlement handling
			handlePaymentVerified(c, service, ctx, result, config)
		}
	}
}

// handlePaymentError handles payment error responses
func handlePaymentError(c *gin.Context, response *x402http.HTTPResponseInstructions, config *MiddlewareConfig) {
	// Set status
	c.Status(response.Status)
	
	// Set headers
	for key, value := range response.Headers {
		c.Header(key, value)
	}
	
	// Send response body
	if response.IsHTML {
		c.Data(response.Status, "text/html; charset=utf-8", []byte(response.Body.(string)))
	} else {
		c.JSON(response.Status, response.Body)
	}
	
	// Abort to prevent further handlers
	c.Abort()
}

// handlePaymentVerified handles verified payments with settlement
func handlePaymentVerified(c *gin.Context, service *x402http.HTTPResourceService, ctx context.Context, result x402http.HTTPProcessResult, config *MiddlewareConfig) {
	// Capture response for settlement
	writer := &responseCapture{
		ResponseWriter: c.Writer,
		body:           &bytes.Buffer{},
		statusCode:     http.StatusOK,
	}
	c.Writer = writer
	
	// Continue to protected handler
	c.Next()
	
	// Check if aborted
	if c.IsAborted() {
		return
	}
	
	// Restore original writer
	c.Writer = writer.ResponseWriter
	
	// Don't settle if response failed
	if writer.statusCode >= 400 {
		// Write captured response
		c.Writer.WriteHeader(writer.statusCode)
		c.Writer.Write(writer.body.Bytes())
		return
	}
	
	// Process settlement
	settlementHeaders, err := service.ProcessSettlement(
		ctx,
		*result.PaymentPayload,
		*result.PaymentRequirements,
		writer.statusCode,
	)
	
	if err != nil {
		// Settlement failed
		if config.ErrorHandler != nil {
			config.ErrorHandler(c, fmt.Errorf("settlement failed: %w", err))
		} else {
			// Default error handling
			c.JSON(http.StatusInternalServerError, gin.H{
				"error":   "Settlement failed",
				"details": err.Error(),
			})
		}
		return
	}
	
	// Add settlement headers
	if settlementHeaders != nil {
		for key, value := range settlementHeaders {
			c.Header(key, value)
		}
		
		// Call settlement handler if configured
		if config.SettlementHandler != nil && settlementHeaders["PAYMENT-RESPONSE"] != "" {
			// Decode settlement response
			settleResponse, _ := x402http.DecodePaymentResponseHeader(settlementHeaders["PAYMENT-RESPONSE"])
			config.SettlementHandler(c, settleResponse)
		}
	}
	
	// Write captured response
	c.Writer.WriteHeader(writer.statusCode)
	c.Writer.Write(writer.body.Bytes())
}

// ============================================================================
// Response Capture
// ============================================================================

// responseCapture captures the response for settlement processing
type responseCapture struct {
	gin.ResponseWriter
	body       *bytes.Buffer
	statusCode int
	written    bool
	mu         sync.Mutex
}

// WriteHeader captures the status code
func (w *responseCapture) WriteHeader(code int) {
	w.mu.Lock()
	defer w.mu.Unlock()
	
	if !w.written {
		w.statusCode = code
		w.written = true
	}
}

// Write captures the response body
func (w *responseCapture) Write(data []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	
	if !w.written {
		w.WriteHeader(http.StatusOK)
	}
	return w.body.Write(data)
}

// WriteString captures string responses
func (w *responseCapture) WriteString(s string) (int, error) {
	return w.Write([]byte(s))
}

// ============================================================================
// Convenience Functions
// ============================================================================

// SimplePaymentMiddleware creates middleware with common defaults
func SimplePaymentMiddleware(payTo string, price string, network x402.Network, facilitatorURL string) gin.HandlerFunc {
	// Create facilitator client
	facilitator := x402http.NewHTTPFacilitatorClient(&x402http.FacilitatorConfig{
		URL: facilitatorURL,
	})
	
	// Create routes for all endpoints
	routes := x402http.RoutesConfig{
		"*": x402http.RouteConfig{
			Scheme:  "exact",
			PayTo:   payTo,
			Price:   price,
			Network: network,
		},
	}
	
	return PaymentMiddleware(routes,
		WithFacilitatorClient(facilitator),
		WithInitializeOnStart(true),
	)
}

// RouteSpecificMiddleware creates middleware with per-route configuration
func RouteSpecificMiddleware(facilitatorURL string) gin.HandlerFunc {
	facilitator := x402http.NewHTTPFacilitatorClient(&x402http.FacilitatorConfig{
		URL: facilitatorURL,
	})
	
	routes := x402http.RoutesConfig{
		"GET /api/data": {
			Scheme:      "exact",
			PayTo:       "0x...",
			Price:       "$0.10",
			Network:     "eip155:8453",
			Description: "API data access",
		},
		"POST /api/compute": {
			Scheme:      "exact",
			PayTo:       "0x...",
			Price:       "$1.00",
			Network:     "eip155:8453",
			Description: "Compute operation",
		},
	}
	
	return PaymentMiddleware(routes,
		WithFacilitatorClient(facilitator),
	)
}
```

## Usage Examples

### Basic Setup
```go
package main

import (
    "github.com/gin-gonic/gin"
    x402gin "github.com/coinbase/x402-go/v2/http/gin"
    "github.com/coinbase/x402-go/v2/mechanisms/evm"
)

func main() {
    r := gin.Default()
    
    // Simple middleware for all routes
    r.Use(x402gin.SimplePaymentMiddleware(
        "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb9", // payTo
        "$0.10",                                        // price
        "eip155:8453",                                  // network (Base)
        "https://facilitator.x402.org",                // facilitator URL
    ))
    
    // Protected endpoint
    r.GET("/api/data", func(c *gin.Context) {
        c.JSON(200, gin.H{
            "data": "This is protected data",
        })
    })
    
    r.Run(":8080")
}
```

### Advanced Configuration
```go
func main() {
    r := gin.Default()
    
    // Configure routes
    routes := x402http.RoutesConfig{
        "GET /api/premium": {
            Scheme:      "exact",
            PayTo:       "0x...",
            Price:       "$1.00",
            Network:     "eip155:8453",
            Description: "Premium API access",
            MimeType:    "application/json",
        },
        "POST /api/compute": {
            Scheme:  "exact",
            PayTo:   "0x...",
            Price:   "$5.00",
            Network: "eip155:8453",
        },
    }
    
    // Create facilitator client
    facilitator := x402http.NewHTTPFacilitatorClient(&x402http.FacilitatorConfig{
        URL: "https://facilitator.example.com",
        AuthProvider: x402http.NewStaticAuthProvider("api-key"),
    })
    
    // Configure paywall
    paywallConfig := &x402http.PaywallConfig{
        AppName:      "My API",
        AppLogo:      "/static/logo.png",
        CDPClientKey: "your-cdp-key",
        Testnet:      false,
    }
    
    // Add middleware
    r.Use(x402gin.PaymentMiddleware(routes,
        x402gin.WithFacilitatorClient(facilitator),
        x402gin.WithScheme("eip155:8453", evm.NewExactService()),
        x402gin.WithPaywallConfig(paywallConfig),
        x402gin.WithErrorHandler(func(c *gin.Context, err error) {
            // Custom error handling
            c.JSON(500, gin.H{"error": err.Error()})
        }),
        x402gin.WithSettlementHandler(func(c *gin.Context, response x402.SettleResponse) {
            // Log successful settlements
            log.Printf("Payment settled: tx=%s payer=%s", response.Transaction, response.Payer)
        }),
    ))
    
    // Protected routes
    r.GET("/api/premium", premiumHandler)
    r.POST("/api/compute", computeHandler)
    
    r.Run(":8080")
}
```

### Group-Specific Middleware
```go
func main() {
    r := gin.Default()
    
    // Public routes (no payment)
    public := r.Group("/public")
    public.GET("/info", infoHandler)
    
    // Paid API routes
    api := r.Group("/api")
    api.Use(x402gin.PaymentMiddleware(
        x402http.RoutesConfig{
            "*": {
                Scheme:  "exact",
                PayTo:   "0x...",
                Price:   "$0.01",
                Network: "eip155:8453",
            },
        },
        x402gin.WithFacilitatorClient(facilitator),
    ))
    
    api.GET("/data", dataHandler)
    api.POST("/action", actionHandler)
    
    // Premium routes with higher prices
    premium := r.Group("/premium")
    premium.Use(x402gin.PaymentMiddleware(
        x402http.RoutesConfig{
            "*": {
                Scheme:  "exact",
                PayTo:   "0x...",
                Price:   "$1.00",
                Network: "eip155:8453",
            },
        },
        x402gin.WithFacilitatorClient(facilitator),
    ))
    
    premium.GET("/exclusive", exclusiveHandler)
    
    r.Run(":8080")
}
```

### Testing with Local Facilitator
```go
func main() {
    // Create local facilitator for testing
    facilitator := x402.NewFacilitator()
    facilitator.RegisterScheme("eip155:8453", evm.NewExactFacilitator(signer))
    
    localClient := x402.NewLocalFacilitatorClient(facilitator)
    
    r := gin.Default()
    r.Use(x402gin.PaymentMiddleware(routes,
        x402gin.WithFacilitatorClient(localClient),
    ))
    
    r.Run(":8080")
}
```

## Key Features

1. **Route Pattern Matching**: Supports wildcards and specific route patterns
2. **Response Capture**: Intercepts responses for settlement processing
3. **Browser Support**: Automatic paywall HTML for browser requests
4. **Error Handling**: Customizable error handlers
5. **Settlement Callbacks**: Optional callbacks for successful settlements
6. **Multiple Facilitators**: Support for fallback facilitators
7. **Scheme Registration**: Register custom payment schemes
8. **Context Timeouts**: Configurable timeouts for payment operations

## Migration from Legacy Middleware

| Legacy | New |
|--------|-----|
| `PaymentMiddleware(amount, address, opts...)` | `PaymentMiddleware(routes, opts...)` |
| `WithDescription()` | Part of `RouteConfig` |
| `WithTestnet()` | Network specified in route (e.g., "eip155:84532") |
| `WithFacilitatorConfig()` | `WithFacilitatorClient()` |
| Fixed to v1 | Supports v1 and v2 |
| Single price for all routes | Per-route pricing |

package main

import (
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/extensions/bazaar"
	"github.com/coinbase/x402/go/extensions/types"
	x402http "github.com/coinbase/x402/go/http"
	"github.com/coinbase/x402/go/http/gin"
	"github.com/coinbase/x402/go/mechanisms/evm"
	ginfw "github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

var shutdownRequested bool

/**
 * Gin E2E Test Server with x402 v2 Payment Middleware
 *
 * This server demonstrates how to integrate x402 v2 payment middleware
 * with a Gin application for end-to-end testing.
 */

func main() {
	// Load .env file if it exists
	if err := godotenv.Load(); err != nil {
		fmt.Println("Warning: .env file not found. Using environment variables.")
	}

	// Get configuration from environment
	port := os.Getenv("PORT")
	if port == "" {
		port = "4021"
	}

	payeeAddress := os.Getenv("EVM_PAYEE_ADDRESS")
	if payeeAddress == "" {
		fmt.Println("❌ EVM_PAYEE_ADDRESS environment variable is required")
		os.Exit(1)
	}

	facilitatorURL := os.Getenv("FACILITATOR_URL")
	if facilitatorURL == "" {
		fmt.Println("❌ FACILITATOR_URL environment variable is required")
		os.Exit(1)
	}

	// Network configuration
	network := x402.Network("eip155:84532") // Base Sepolia

	fmt.Printf("Facilitator account: %s\n", maskPrivateKey(os.Getenv("EVM_PRIVATE_KEY")))
	fmt.Printf("Using remote facilitator at: %s\n", facilitatorURL)

	// Set Gin to release mode to reduce logs
	ginfw.SetMode(ginfw.ReleaseMode)
	r := ginfw.New()
	r.Use(ginfw.Recovery())

	// Create HTTP facilitator client
	facilitatorClient := x402http.NewHTTPFacilitatorClient(&x402http.FacilitatorConfig{
		URL: facilitatorURL,
	})

	/**
	 * Configure x402 payment middleware
	 *
	 * This middleware protects the /protected endpoint with a $0.001 USDC payment requirement
	 * on the Base Sepolia testnet with bazaar discovery extension.
	 */
	// Declare bazaar discovery extension for the GET endpoint
	discoveryExtension, err := bazaar.DeclareDiscoveryExtension(
		bazaar.MethodGET,
		nil, // No query params
		nil, // No input schema
		"",  // No body type (GET method)
		&types.OutputConfig{
			Example: map[string]interface{}{
				"message":   "Protected endpoint accessed successfully",
				"timestamp": "2024-01-01T00:00:00Z",
			},
			Schema: types.JSONSchema{
				"properties": map[string]interface{}{
					"message":   map[string]interface{}{"type": "string"},
					"timestamp": map[string]interface{}{"type": "string"},
				},
				"required": []string{"message", "timestamp"},
			},
		},
	)
	if err != nil {
		fmt.Printf("Warning: Failed to create bazaar extension: %v\n", err)
	}

	routes := x402http.RoutesConfig{
		"GET /protected": {
			Scheme:  "exact",
			PayTo:   payeeAddress,
			Price:   "$0.001",
			Network: network,
			Extensions: map[string]interface{}{
				types.BAZAAR: discoveryExtension,
			},
		},
	}

	// Create EVM service for handling exact payments
	evmService := evm.NewExactEvmService()

	// Apply payment middleware
	r.Use(gin.PaymentMiddleware(
		routes,
		gin.WithFacilitatorClient(facilitatorClient),
		gin.WithScheme(network, evmService),
		gin.WithInitializeOnStart(true),
		gin.WithTimeout(30*time.Second),
	))

	/**
	 * Protected endpoint - requires payment to access
	 *
	 * This endpoint demonstrates a resource protected by x402 payment middleware.
	 * Clients must provide a valid payment signature to access this endpoint.
	 */
	r.GET("/protected", func(c *ginfw.Context) {
		if shutdownRequested {
			c.JSON(http.StatusServiceUnavailable, ginfw.H{
				"error": "Server shutting down",
			})
			return
		}

		c.JSON(http.StatusOK, ginfw.H{
			"message":   "Protected endpoint accessed successfully",
			"timestamp": time.Now().Format(time.RFC3339),
		})
	})

	/**
	 * Health check endpoint - no payment required
	 *
	 * Used to verify the server is running and responsive.
	 */
	r.GET("/health", func(c *ginfw.Context) {
		c.JSON(http.StatusOK, ginfw.H{
			"status":  "ok",
			"network": string(network),
			"payee":   payeeAddress,
			"version": "2.0.0",
		})
	})

	/**
	 * Shutdown endpoint - used by e2e tests
	 *
	 * Allows graceful shutdown of the server during testing.
	 */
	r.POST("/close", func(c *ginfw.Context) {
		shutdownRequested = true

		c.JSON(http.StatusOK, ginfw.H{
			"message": "Server shutting down gracefully",
		})
		fmt.Println("Received shutdown request")

		// Schedule server shutdown after response
		go func() {
			time.Sleep(100 * time.Millisecond)
			os.Exit(0)
		}()
	})

	// Set up graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-quit
		fmt.Println("Received shutdown signal, exiting...")
		os.Exit(0)
	}()

	// Print startup banner
	fmt.Printf(`
╔════════════════════════════════════════════════════════╗
║           x402 Gin E2E Test Server                     ║
╠════════════════════════════════════════════════════════╣
║  Server:     http://localhost:%s                      ║
║  Network:    %s                       ║
║  Payee:      %s     ║
║                                                        ║
║  Endpoints:                                            ║
║  • GET  /protected  (requires $0.001 USDC payment)    ║
║  • GET  /health     (no payment required)             ║
║  • POST /close      (shutdown server)                 ║
╚════════════════════════════════════════════════════════╝
`, port, network, payeeAddress)

	server := &http.Server{
		Addr:    ":" + port,
		Handler: r,
	}

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		fmt.Printf("Error starting server: %v\n", err)
		os.Exit(1)
	}
}

func maskPrivateKey(key string) string {
	if key == "" {
		return "not configured"
	}
	if len(key) > 10 {
		return key[:10] + "..."
	}
	return key
}

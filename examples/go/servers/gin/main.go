package main

import (
	"fmt"
	"net/http"
	"os"
	"time"

	x402 "github.com/coinbase/x402/go"
	x402http "github.com/coinbase/x402/go/http"
	ginmw "github.com/coinbase/x402/go/http/gin"
	evm "github.com/coinbase/x402/go/mechanisms/evm/exact/server"
	ginfw "github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

/**
 * Simple Gin Server with x402 Payment Middleware
 *
 * This example demonstrates how to integrate x402 payment middleware
 * with a Gin application to protect API endpoints with micropayments.
 */

func main() {
	// Load .env file if it exists
	if err := godotenv.Load(); err != nil {
		fmt.Println("No .env file found, using environment variables")
	}

	// Get configuration from environment
	port := os.Getenv("PORT")
	if port == "" {
		port = "4021"
	}

	evmPayeeAddress := os.Getenv("EVM_PAYEE_ADDRESS")
	if evmPayeeAddress == "" {
		fmt.Println("❌ EVM_PAYEE_ADDRESS environment variable is required")
		fmt.Println("   Set your Ethereum address to receive payments")
		os.Exit(1)
	}

	facilitatorURL := os.Getenv("FACILITATOR_URL")
	if facilitatorURL == "" {
		fmt.Println("❌ FACILITATOR_URL environment variable is required")
		fmt.Println("   Example: https://facilitator.x402.org")
		os.Exit(1)
	}

	// Network configuration - Base Sepolia testnet
	evmNetwork := x402.Network("eip155:84532")

	fmt.Printf("🚀 Starting Gin x402 server...\n")
	fmt.Printf("   Payee address: %s\n", evmPayeeAddress)
	fmt.Printf("   Facilitator: %s\n", facilitatorURL)
	fmt.Printf("   Network: %s\n", evmNetwork)

	// Create Gin router
	r := ginfw.Default()

	// Create HTTP facilitator client
	facilitatorClient := x402http.NewHTTPFacilitatorClient(&x402http.FacilitatorConfig{
		URL: facilitatorURL,
	})

	/**
	 * Configure x402 payment middleware
	 *
	 * This middleware protects specific routes with payment requirements.
	 * When a client accesses a protected route without payment, they receive
	 * a 402 Payment Required response with payment details.
	 */
	routes := x402http.RoutesConfig{
		"GET /weather": {
			Scheme:      "exact",
			PayTo:       evmPayeeAddress,
			Price:       "$0.001", // 0.1 cents in USDC
			Network:     evmNetwork,
			Description: "Get weather data for a city",
			MimeType:    "application/json",
		},
	}

	// Apply x402 payment middleware
	r.Use(ginmw.X402Payment(ginmw.Config{
		Routes:      routes,
		Facilitator: facilitatorClient,
		Schemes: []ginmw.SchemeConfig{
			{Network: evmNetwork, Server: evm.NewExactEvmScheme()},
		},
		Initialize: true,
		Timeout:    30 * time.Second,
	}))

	/**
	 * Protected endpoint - requires $0.001 USDC payment
	 *
	 * Clients must provide a valid x402 payment to access this endpoint.
	 * The payment is verified and settled before the endpoint handler runs.
	 */
	r.GET("/weather", func(c *ginfw.Context) {
		city := c.DefaultQuery("city", "San Francisco")

		weatherData := map[string]map[string]interface{}{
			"San Francisco": {"weather": "foggy", "temperature": 60},
			"New York":      {"weather": "cloudy", "temperature": 55},
			"London":        {"weather": "rainy", "temperature": 50},
			"Tokyo":         {"weather": "clear", "temperature": 65},
		}

		data, exists := weatherData[city]
		if !exists {
			data = map[string]interface{}{"weather": "sunny", "temperature": 70}
		}

		c.JSON(http.StatusOK, ginfw.H{
			"city":        city,
			"weather":     data["weather"],
			"temperature": data["temperature"],
			"timestamp":   time.Now().Format(time.RFC3339),
		})
	})

	/**
	 * Health check endpoint - no payment required
	 *
	 * This endpoint is not protected by x402 middleware.
	 */
	r.GET("/health", func(c *ginfw.Context) {
		c.JSON(http.StatusOK, ginfw.H{
			"status":  "ok",
			"version": "2.0.0",
		})
	})

	// Print startup information
	fmt.Printf(`
╔════════════════════════════════════════════════════════╗
║        x402 Gin Server Example                         ║
╠════════════════════════════════════════════════════════╣
║  Server:     http://localhost:%-24s ║
║  Network:    %-41s ║
║  Payee:      %-41s ║
║                                                        ║
║  Endpoints:                                            ║
║  • GET  /weather    (requires $0.001 USDC payment)    ║
║  • GET  /health     (no payment required)             ║
╚════════════════════════════════════════════════════════╝
`, port, evmNetwork, evmPayeeAddress)

	// Start server
	if err := r.Run(":" + port); err != nil {
		fmt.Printf("Error starting server: %v\n", err)
		os.Exit(1)
	}
}


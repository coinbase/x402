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
	"github.com/coinbase/x402/go/extensions/eip2612gassponsor"
	"github.com/coinbase/x402/go/extensions/erc20approvalgassponsor"
	"github.com/coinbase/x402/go/extensions/types"
	x402http "github.com/coinbase/x402/go/http"
	echomw "github.com/coinbase/x402/go/http/echo"
	evm "github.com/coinbase/x402/go/mechanisms/evm/exact/server"
	svm "github.com/coinbase/x402/go/mechanisms/svm/exact/server"
	"github.com/joho/godotenv"
	"github.com/labstack/echo/v4"
)

var shutdownRequested bool

/**
 * Echo E2E Test Server with x402 v2 Payment Middleware
 *
 * This server demonstrates how to integrate x402 v2 payment middleware
 * with an Echo application for end-to-end testing.
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

	evmPayeeAddress := os.Getenv("EVM_PAYEE_ADDRESS")
	if evmPayeeAddress == "" {
		fmt.Println("❌ EVM_PAYEE_ADDRESS environment variable is required")
		os.Exit(1)
	}

	svmPayeeAddress := os.Getenv("SVM_PAYEE_ADDRESS")
	if svmPayeeAddress == "" {
		fmt.Println("❌ SVM_PAYEE_ADDRESS environment variable is required")
		os.Exit(1)
	}

	facilitatorURL := os.Getenv("FACILITATOR_URL")
	if facilitatorURL == "" {
		fmt.Println("❌ FACILITATOR_URL environment variable is required")
		os.Exit(1)
	}

	// Network configurations (from env or defaults)
	evmNetworkStr := os.Getenv("EVM_NETWORK")
	if evmNetworkStr == "" {
		evmNetworkStr = "eip155:84532" // Default: Base Sepolia
	}
	svmNetworkStr := os.Getenv("SVM_NETWORK")
	if svmNetworkStr == "" {
		svmNetworkStr = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" // Default: Solana Devnet
	}
	evmNetwork := x402.Network(evmNetworkStr)
	svmNetwork := x402.Network(svmNetworkStr)

	fmt.Printf("EVM Payee address: %s\n", evmPayeeAddress)
	fmt.Printf("SVM Payee address: %s\n", svmPayeeAddress)
	fmt.Printf("Using remote facilitator at: %s\n", facilitatorURL)

	// Create Echo instance
	e := echo.New()
	e.HideBanner = true

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
	// Declare bazaar discovery extension for GET endpoints
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
			Accepts: x402http.PaymentOptions{
				{
					Scheme:  "exact",
					PayTo:   evmPayeeAddress,
					Price:   "$0.001",
					Network: evmNetwork,
				},
			},
			Extensions: map[string]interface{}{
				types.BAZAAR.Key(): discoveryExtension,
			},
		},
		"GET /protected-svm": {
			Accepts: x402http.PaymentOptions{
				{
					Scheme:  "exact",
					PayTo:   svmPayeeAddress,
					Price:   "$0.001",
					Network: svmNetwork,
				},
			},
			Extensions: map[string]interface{}{
				types.BAZAAR.Key(): discoveryExtension,
			},
		},
		// Permit2 endpoint - explicitly requires Permit2 flow instead of EIP-3009
		"GET /protected-permit2": {
			Accepts: x402http.PaymentOptions{
				{
					Scheme:  "exact",
					PayTo:   evmPayeeAddress,
					Network: evmNetwork,
					// Use pre-parsed price with assetTransferMethod to force Permit2
					Price: map[string]interface{}{
						"amount": "1000", // 0.001 USDC (6 decimals)
						"asset":  "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
						"extra": map[string]interface{}{
							"assetTransferMethod": "permit2",
						},
					},
				},
			},
			Extensions: func() map[string]interface{} {
				ext := map[string]interface{}{
					types.BAZAAR.Key(): discoveryExtension,
				}
				// Add EIP-2612 gas sponsoring extension
				for k, v := range eip2612gassponsor.DeclareEip2612GasSponsoringExtension() {
					ext[k] = v
				}
				return ext
			}(),
		},
		// Permit2 ERC-20 approval endpoint - requires Permit2 flow with a generic ERC-20 token (no EIP-2612)
		"GET /protected-permit2-erc20": {
			Accepts: x402http.PaymentOptions{
				{
					Scheme:  "exact",
					PayTo:   evmPayeeAddress,
					Network: evmNetwork,
					// Use MockGenericERC20 token that does NOT implement EIP-2612
					Price: map[string]interface{}{
						"amount": "1000", // smallest unit
						"asset":  "0xeED520980fC7C7B4eB379B96d61CEdea2423005a", // MockGenericERC20 on Base Sepolia
						"extra": map[string]interface{}{
							"assetTransferMethod": "permit2",
						},
					},
				},
			},
			Extensions: func() map[string]interface{} {
				ext := map[string]interface{}{
					types.BAZAAR.Key(): discoveryExtension,
				}
				// Advertise ERC-20 approval gas sponsoring (for tokens without EIP-2612)
				for k, v := range erc20approvalgassponsor.DeclareExtension() {
					ext[k] = v
				}
				return ext
			}(),
		},
	}

	// Apply payment middleware with detailed error logging
	e.Use(echomw.X402Payment(echomw.Config{
		Routes:      routes,
		Facilitator: facilitatorClient,
		Schemes: []echomw.SchemeConfig{
			{Network: evmNetwork, Server: evm.NewExactEvmScheme()},
			{Network: svmNetwork, Server: svm.NewExactSvmScheme()},
		},
		SyncFacilitatorOnStart: true,
		Timeout:                30 * time.Second,
		ErrorHandler: func(c echo.Context, err error) {
			// Log detailed error information for debugging
			fmt.Printf("❌ [E2E SERVER ERROR] Payment error occurred\n")
			fmt.Printf("   Path: %s\n", c.Request().URL.Path)
			fmt.Printf("   Method: %s\n", c.Request().Method)
			fmt.Printf("   Error: %v\n", err)
			fmt.Printf("   Headers: %v\n", c.Request().Header)

			// Default error response
			c.JSON(http.StatusPaymentRequired, map[string]interface{}{
				"error": err.Error(),
			})
		},
		SettlementHandler: func(c echo.Context, settleResp *x402.SettleResponse) {
			// Log successful settlement
			fmt.Printf("✅ [E2E SERVER SUCCESS] Payment settled\n")
			fmt.Printf("   Path: %s\n", c.Request().URL.Path)
			fmt.Printf("   Transaction: %s\n", settleResp.Transaction)
			fmt.Printf("   Network: %s\n", settleResp.Network)
			fmt.Printf("   Payer: %s\n", settleResp.Payer)
		},
	}))

	/**
	 * Protected endpoint - requires payment to access
	 */
	e.GET("/protected", func(c echo.Context) error {
		if shutdownRequested {
			return c.JSON(http.StatusServiceUnavailable, map[string]interface{}{
				"error": "Server shutting down",
			})
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"message":   "Protected endpoint accessed successfully (EVM)",
			"timestamp": time.Now().Format(time.RFC3339),
			"network":   "eip155:84532",
		})
	})

	/**
	 * Protected SVM endpoint - requires payment to access
	 */
	e.GET("/protected-svm", func(c echo.Context) error {
		if shutdownRequested {
			return c.JSON(http.StatusServiceUnavailable, map[string]interface{}{
				"error": "Server shutting down",
			})
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"message":   "Protected endpoint accessed successfully (SVM)",
			"timestamp": time.Now().Format(time.RFC3339),
			"network":   "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
		})
	})

	/**
	 * Protected Permit2 endpoint - requires payment via Permit2 flow
	 */
	e.GET("/protected-permit2", func(c echo.Context) error {
		if shutdownRequested {
			return c.JSON(http.StatusServiceUnavailable, map[string]interface{}{
				"error": "Server shutting down",
			})
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"message":   "Permit2 endpoint accessed successfully",
			"timestamp": time.Now().Format(time.RFC3339),
			"method":    "permit2",
		})
	})

	/**
	 * Protected Permit2 ERC-20 approval endpoint
	 */
	e.GET("/protected-permit2-erc20", func(c echo.Context) error {
		if shutdownRequested {
			return c.JSON(http.StatusServiceUnavailable, map[string]interface{}{
				"error": "Server shutting down",
			})
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"message":   "Permit2 ERC-20 approval endpoint accessed successfully",
			"timestamp": time.Now().Format(time.RFC3339),
			"method":    "permit2-erc20-approval",
		})
	})

	/**
	 * Health check endpoint - no payment required
	 */
	e.GET("/health", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]interface{}{
			"status":      "ok",
			"version":     "2.0.0",
			"evm_network": string(evmNetwork),
			"evm_payee":   evmPayeeAddress,
			"svm_network": string(svmNetwork),
			"svm_payee":   svmPayeeAddress,
		})
	})

	/**
	 * Shutdown endpoint - used by e2e tests
	 */
	e.POST("/close", func(c echo.Context) error {
		shutdownRequested = true

		fmt.Println("Received shutdown request")

		// Schedule server shutdown after response
		go func() {
			time.Sleep(100 * time.Millisecond)
			os.Exit(0)
		}()

		return c.JSON(http.StatusOK, map[string]interface{}{
			"message": "Server shutting down gracefully",
		})
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
║           x402 Echo E2E Test Server                    ║
╠════════════════════════════════════════════════════════╣
║  Server:     http://localhost:%-29s ║
║  EVM Network: %-40s ║
║  EVM Payee:   %-40s ║
║  SVM Network: %-40s ║
║  SVM Payee:   %-40s ║
║                                                        ║
║  Endpoints:                                            ║
║  • GET  /protected              (EIP-3009 payment)    ║
║  • GET  /protected-svm          (SVM payment)         ║
║  • GET  /protected-permit2      (Permit2 payment)     ║
║  • GET  /protected-permit2-erc20 (Permit2 ERC-20)     ║
║  • GET  /health                 (no payment required)  ║
║  • POST /close                  (shutdown server)      ║
╚════════════════════════════════════════════════════════╝
`, port, evmNetwork, evmPayeeAddress, svmNetwork, svmPayeeAddress)

	if err := e.Start(":" + port); err != nil && err != http.ErrServerClosed {
		fmt.Printf("Error starting server: %v\n", err)
		os.Exit(1)
	}
}

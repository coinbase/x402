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
 * Lifecycle Hooks Example
 *
 * This example demonstrates how to register hooks at different stages
 * of the payment verification and settlement lifecycle. Hooks are useful
 * for logging, custom validation, error recovery, and side effects.
 */

func main() {
	// Load .env file if it exists
	if err := godotenv.Load(); err != nil {
		fmt.Println("No .env file found, using environment variables")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "4021"
	}

	evmPayeeAddress := os.Getenv("EVM_PAYEE_ADDRESS")
	if evmPayeeAddress == "" {
		fmt.Println("❌ EVM_PAYEE_ADDRESS environment variable is required")
		os.Exit(1)
	}

	facilitatorURL := os.Getenv("FACILITATOR_URL")
	if facilitatorURL == "" {
		fmt.Println("❌ FACILITATOR_URL environment variable is required")
		os.Exit(1)
	}

	evmNetwork := x402.Network("eip155:84532") // Base Sepolia

	r := ginfw.Default()

	facilitatorClient := x402http.NewHTTPFacilitatorClient(&x402http.FacilitatorConfig{
		URL: facilitatorURL,
	})

	/**
	 * Create Resource Server with Lifecycle Hooks
	 *
	 * Hooks allow you to run custom code at different stages:
	 * - BeforeVerify: Run before payment verification (can abort)
	 * - AfterVerify: Run after successful verification (for side effects)
	 * - OnVerifyFailure: Run when verification fails (can recover)
	 * - BeforeSettle: Run before payment settlement (can abort)
	 * - AfterSettle: Run after successful settlement (for side effects)
	 * - OnSettleFailure: Run when settlement fails (can recover)
	 */
	resourceServer := x402.Newx402ResourceServer(
		x402.WithFacilitatorClient(facilitatorClient),
		x402.WithSchemeServer(evmNetwork, evm.NewExactEvmScheme()),
	)

	// BeforeVerify: Called before payment verification starts
	resourceServer.OnBeforeVerify(func(ctx x402.VerifyContext) (*x402.BeforeHookResult, error) {
		fmt.Printf("🔍 [BeforeVerify] Verifying payment on %s\n", ctx.Requirements.Network)
		
		// You could abort verification here if needed:
		// return &x402.BeforeHookResult{
		//     Abort: true,
		//     Reason: "Custom validation failed",
		// }, nil
		
		return nil, nil // Continue with verification
	})

	// AfterVerify: Called after successful payment verification
	resourceServer.OnAfterVerify(func(ctx x402.VerifyResultContext) error {
		fmt.Printf("✅ [AfterVerify] Payment verified successfully\n")
		
		// Perform side effects like logging to database, metrics, etc.
		// Note: Errors here are logged but don't fail the request
		
		return nil
	})

	// OnVerifyFailure: Called when payment verification fails
	resourceServer.OnVerifyFailure(func(ctx x402.VerifyFailureContext) (*x402.VerifyFailureHookResult, error) {
		fmt.Printf("❌ [OnVerifyFailure] Verification failed: %v\n", ctx.Error)
		
		// You could attempt to recover from the failure:
		// return &x402.VerifyFailureHookResult{
		//     Recovered: true,
		//     Result: x402.VerifyResponse{
		//         IsValid: true,
		//         InvalidReason: "Recovered by custom logic",
		//     },
		// }, nil
		
		return nil, nil // Don't recover, let it fail
	})

	// BeforeSettle: Called before payment settlement starts
	resourceServer.OnBeforeSettle(func(ctx x402.SettleContext) (*x402.BeforeHookResult, error) {
		fmt.Printf("💰 [BeforeSettle] Settling payment on %s\n", ctx.Requirements.Network)
		
		// You could abort settlement here if needed:
		// return &x402.BeforeHookResult{
		//     Abort: true,
		//     Reason: "Settlement conditions not met",
		// }, nil
		
		return nil, nil // Continue with settlement
	})

	// AfterSettle: Called after successful payment settlement
	resourceServer.OnAfterSettle(func(ctx x402.SettleResultContext) error {
		fmt.Printf("🎉 [AfterSettle] Payment settled! Transaction: %s\n", ctx.Result.Transaction)
		
		// Perform side effects like updating database, sending notifications, etc.
		
		return nil
	})

	// OnSettleFailure: Called when payment settlement fails
	resourceServer.OnSettleFailure(func(ctx x402.SettleFailureContext) (*x402.SettleFailureHookResult, error) {
		fmt.Printf("❌ [OnSettleFailure] Settlement failed: %v\n", ctx.Error)
		
		// You could attempt to recover from the failure:
		// return &x402.SettleFailureHookResult{
		//     Recovered: true,
		//     Result: x402.SettleResponse{
		//         Transaction: "0x123...",
		//         Network: string(ctx.Requirements.Network),
		//         Payer: "recovered-payer",
		//     },
		// }, nil
		
		return nil, nil // Don't recover, let it fail
	})

	routes := x402http.RoutesConfig{
		"GET /weather": {
			Scheme:      "exact",
			PayTo:       evmPayeeAddress,
			Price:       "$0.001",
			Network:     evmNetwork,
			Description: "Weather data",
			MimeType:    "application/json",
		},
	}

	r.Use(ginmw.X402Payment(ginmw.Config{
		Routes:         routes,
		ResourceServer: resourceServer, // Use custom resource server with hooks
		Initialize:     true,
		Timeout:        30 * time.Second,
	}))

	r.GET("/weather", func(c *ginfw.Context) {
		c.JSON(http.StatusOK, ginfw.H{
			"report": ginfw.H{
				"weather":     "sunny",
				"temperature": 70,
			},
		})
	})

	r.GET("/health", func(c *ginfw.Context) {
		c.JSON(http.StatusOK, ginfw.H{"status": "ok"})
	})

	fmt.Printf("🚀 Lifecycle Hooks example running on http://localhost:%s\n", port)
	fmt.Printf("   Watch the console for hook execution logs\n")

	if err := r.Run(":" + port); err != nil {
		fmt.Printf("Error starting server: %v\n", err)
		os.Exit(1)
	}
}


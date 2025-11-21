package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	x402 "github.com/coinbase/x402/go"
	evm "github.com/coinbase/x402/go/mechanisms/evm/exact/facilitator"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

/**
 * Simple x402 Facilitator Example
 *
 * This example demonstrates how to build a basic x402 facilitator that:
 * - Verifies payment signatures from clients
 * - Settles payments on-chain
 * - Uses hooks for logging operations
 * - Supports EVM chains (Base Sepolia)
 *
 * A facilitator acts as a payment processor that:
 * 1. Verifies that payment signatures are valid
 * 2. Submits transactions to the blockchain
 * 3. Returns settlement confirmation to clients
 */

func main() {
	// Load .env file if it exists
	if err := godotenv.Load(); err != nil {
		fmt.Println("No .env file found, using environment variables")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "4022"
	}

	// Facilitator needs a private key to sign and submit transactions
	evmPrivateKey := os.Getenv("EVM_PRIVATE_KEY")
	if evmPrivateKey == "" {
		fmt.Println("❌ EVM_PRIVATE_KEY environment variable is required")
		os.Exit(1)
	}

	// RPC endpoint for blockchain interaction
	rpcURL := os.Getenv("RPC_URL")
	if rpcURL == "" {
		rpcURL = "https://sepolia.base.org" // Base Sepolia default
	}

	// Network to support
	network := x402.Network("eip155:84532") // Base Sepolia

	fmt.Printf("🚀 Starting x402 Facilitator...\n")
	fmt.Printf("   Network: %s\n", network)
	fmt.Printf("   RPC: %s\n\n", rpcURL)

	// ========================================================================
	// Create Facilitator with Logging Hooks
	// ========================================================================

	// NOTE: Facilitator signers require RPC integration and blockchain interaction.
	// The signer implementation is not shown here to keep the example focused,
	// but you can see the full implementation in e2e/facilitators/go/main.go
	//
	// For now, this example demonstrates the facilitator API structure.
	// In production, you would create a facilitator signer that implements:
	// - VerifyTypedData() - Verify EIP-712 signatures
	// - SendTransaction() - Submit transactions to blockchain
	// - GetAddress() - Return facilitator address
	// - GetChainID() - Return chain ID
	//
	// See: go/mechanisms/evm/exact/facilitator for the interface

	fmt.Println("⚠️  NOTE: This example requires a facilitator signer implementation")
	fmt.Println("   See e2e/facilitators/go/main.go for the complete implementation")
	fmt.Println("   Facilitator signers helpers are planned for a future release\n")
	
	// For now, exit with instructions
	fmt.Println("To run a full facilitator:")
	fmt.Println("   cd ../../../e2e/facilitators/go")
	fmt.Println("   go run .")
	os.Exit(0)

	// This would be the API once facilitator signers are available:
	/*
	evmSigner, err := evmsigners.NewFacilitatorSignerFromPrivateKey(evmPrivateKey, rpcURL)
	if err != nil {
		fmt.Printf("❌ Failed to create facilitator signer: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("   Facilitator address: %s\n\n", evmSigner.GetAddress())
	*/

	// Create facilitator instance
	facilitator := x402.Newx402Facilitator()

	// Register EVM exact scheme for Base Sepolia
	evmScheme := evm.NewExactEvmScheme(evmSigner)
	facilitator.Register(network, evmScheme)

	// ========================================================================
	// Register Logging Hooks
	// ========================================================================

	// Before verify hook - log incoming verification requests
	facilitator.OnBeforeVerify(func(ctx x402.FacilitatorVerifyContext) (*x402.BeforeHookResult, error) {
		fmt.Printf("📋 [BeforeVerify] Verifying payment...\n")
		fmt.Printf("   Scheme: %s\n", ctx.Requirements.GetScheme())
		fmt.Printf("   Network: %s\n", ctx.Requirements.GetNetwork())
		return nil, nil // Continue with verification
	})

	// After verify hook - log successful verifications
	facilitator.OnAfterVerify(func(ctx x402.FacilitatorVerifyResultContext) error {
		if ctx.Result.IsValid {
			fmt.Printf("✅ [AfterVerify] Payment verified successfully\n")
		} else {
			fmt.Printf("❌ [AfterVerify] Payment verification failed: %s\n", ctx.Result.InvalidReason)
		}
		return nil
	})

	// On verify failure hook - log verification errors
	facilitator.OnVerifyFailure(func(ctx x402.FacilitatorVerifyFailureContext) (*x402.VerifyFailureHookResult, error) {
		fmt.Printf("⚠️  [VerifyFailure] Verification error: %v\n", ctx.Error)
		return nil, nil // Don't recover, let it fail
	})

	// Before settle hook - log incoming settlement requests
	facilitator.OnBeforeSettle(func(ctx x402.FacilitatorSettleContext) (*x402.BeforeHookResult, error) {
		fmt.Printf("💰 [BeforeSettle] Settling payment...\n")
		fmt.Printf("   Scheme: %s\n", ctx.Requirements.GetScheme())
		fmt.Printf("   Network: %s\n", ctx.Requirements.GetNetwork())
		return nil, nil // Continue with settlement
	})

	// After settle hook - log successful settlements
	facilitator.OnAfterSettle(func(ctx x402.FacilitatorSettleResultContext) error {
		if ctx.Result.Success {
			fmt.Printf("🎉 [AfterSettle] Payment settled successfully\n")
			fmt.Printf("   Transaction: %s\n", ctx.Result.Transaction)
			fmt.Printf("   Payer: %s\n", ctx.Result.Payer)
		} else {
			fmt.Printf("❌ [AfterSettle] Settlement failed: %s\n", ctx.Result.ErrorReason)
		}
		return nil
	})

	// On settle failure hook - log settlement errors
	facilitator.OnSettleFailure(func(ctx x402.FacilitatorSettleFailureContext) (*x402.SettleFailureHookResult, error) {
		fmt.Printf("⚠️  [SettleFailure] Settlement error: %v\n", ctx.Error)
		return nil, nil // Don't recover, let it fail
	})

	// ========================================================================
	// Create HTTP Server
	// ========================================================================

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())

	// Health check endpoint
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "ok",
			"version": "2.0.0",
			"network": string(network),
		})
	})

	// Supported endpoint - returns supported networks and schemes
	r.GET("/supported", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		supported, err := facilitator.Supported(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, supported)
	})

	// Verify endpoint - verifies payment signatures
	r.POST("/verify", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()

		// Read request body
		var reqBody struct {
			PaymentPayload      json.RawMessage `json:"paymentPayload"`
			PaymentRequirements json.RawMessage `json:"paymentRequirements"`
		}

		if err := c.BindJSON(&reqBody); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
			return
		}

		// Verify payment
		result, err := facilitator.Verify(ctx, reqBody.PaymentPayload, reqBody.PaymentRequirements)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, result)
	})

	// Settle endpoint - settles payments on-chain
	r.POST("/settle", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
		defer cancel()

		// Read request body
		var reqBody struct {
			PaymentPayload      json.RawMessage `json:"paymentPayload"`
			PaymentRequirements json.RawMessage `json:"paymentRequirements"`
		}

		if err := c.BindJSON(&reqBody); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
			return
		}

		// Settle payment
		result, err := facilitator.Settle(ctx, reqBody.PaymentPayload, reqBody.PaymentRequirements)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, result)
	})

	// Print startup information
	fmt.Printf(`
╔════════════════════════════════════════════════════════╗
║        x402 Facilitator Example                        ║
╠════════════════════════════════════════════════════════╣
║  Server:     http://localhost:%-24s ║
║  Network:    %-41s ║
║  Facilitator: %-40s ║
║                                                        ║
║  Endpoints:                                            ║
║  • GET  /health       - Health check                  ║
║  • GET  /supported    - Supported networks/schemes    ║
║  • POST /verify       - Verify payment signature      ║
║  • POST /settle       - Settle payment on-chain       ║
╚════════════════════════════════════════════════════════╝

`, port, network, evmSigner.GetAddress())

	// Start server
	if err := r.Run(":" + port); err != nil {
		fmt.Printf("Error starting server: %v\n", err)
		os.Exit(1)
	}
}


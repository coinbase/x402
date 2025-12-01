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
	svm "github.com/coinbase/x402/go/mechanisms/svm/exact/facilitator"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

const (
	DefaultPort = "4022"
)

func main() {
	godotenv.Load()

	evmPrivateKey := os.Getenv("EVM_PRIVATE_KEY")
	if evmPrivateKey == "" {
		fmt.Println("❌ EVM_PRIVATE_KEY environment variable is required")
		os.Exit(1)
	}

	svmPrivateKey := os.Getenv("SVM_PRIVATE_KEY")
	network := x402.Network("eip155:84532")

	evmSigner, err := newFacilitatorEvmSigner(evmPrivateKey, DefaultEvmRPC)
	if err != nil {
		fmt.Printf("❌ Failed to create EVM signer: %v\n", err)
		os.Exit(1)
	}

	var svmSigner *facilitatorSvmSigner
	if svmPrivateKey != "" {
		svmSigner, _ = newFacilitatorSvmSigner(svmPrivateKey, DefaultSvmRPC)
	}

	facilitator := x402.Newx402Facilitator()
	facilitator.Register([]x402.Network{network}, evm.NewExactEvmScheme(evmSigner))

	if svmSigner != nil {
		svmNetwork := x402.Network("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1")
		facilitator.Register([]x402.Network{svmNetwork}, svm.NewExactSvmScheme(svmSigner))
	}

	facilitator.OnAfterVerify(func(ctx x402.FacilitatorVerifyResultContext) error {
		fmt.Printf("✅ Payment verified\n")
		return nil
	})

	facilitator.OnAfterSettle(func(ctx x402.FacilitatorSettleResultContext) error {
		fmt.Printf("🎉 Payment settled: %s\n", ctx.Result.Transaction)
		return nil
	})

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())

	// Supported endpoint - returns supported networks and schemes
	r.GET("/supported", func(c *gin.Context) {
		// Get supported kinds - networks already registered
		supported := facilitator.GetSupported()
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
			// All failures (business logic and system errors) are returned as errors
			// You can extract structured information from VerifyError if needed:
			// if ve, ok := err.(*x402.VerifyError); ok {
			//     log.Printf("Verification failed: reason=%s, payer=%s, network=%s",
			//                ve.Reason, ve.Payer, ve.Network)
			// }
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Success! result.IsValid is guaranteed to be true
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
			// All failures (business logic and system errors) are returned as errors
			// You can extract structured information from SettleError if needed:
			// if se, ok := err.(*x402.SettleError); ok {
			//     log.Printf("Settlement failed: reason=%s, payer=%s, network=%s, tx=%s",
			//                se.Reason, se.Payer, se.Network, se.Transaction)
			// }
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Success! result.Success is guaranteed to be true
		c.JSON(http.StatusOK, result)
	})

	fmt.Printf("🚀 Facilitator: %s on %s\n", evmSigner.Address(), network)
	fmt.Printf("   Listening on http://localhost:%s\n\n", DefaultPort)

	if err := r.Run(":" + DefaultPort); err != nil {
		fmt.Printf("Error starting server: %v\n", err)
		os.Exit(1)
	}
}


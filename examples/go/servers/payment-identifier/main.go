package main

import (
	"fmt"
	"net/http"
	"os"
	"time"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/extensions/paymentidentifier"
	x402http "github.com/coinbase/x402/go/http"
	ginmw "github.com/coinbase/x402/go/http/gin"
	evm "github.com/coinbase/x402/go/mechanisms/evm/exact/server"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

const DefaultPort = "4021"

/**
 * Payment Identifier Extension Example
 *
 * This example demonstrates how to use the payment-identifier extension
 * to enable idempotency for payment requests. The extension allows clients
 * to provide a unique identifier that servers can use for deduplication.
 *
 * Key concepts:
 * - Server declares support with DeclarePaymentIdentifierExtension(required bool)
 * - When required=true, clients MUST provide an ID or receive 400 Bad Request
 * - When required=false, clients MAY provide an ID for optional deduplication
 */

func main() {
	godotenv.Load()

	evmPayeeAddress := os.Getenv("EVM_PAYEE_ADDRESS")
	if evmPayeeAddress == "" {
		fmt.Println("EVM_PAYEE_ADDRESS environment variable is required")
		os.Exit(1)
	}

	facilitatorURL := os.Getenv("FACILITATOR_URL")
	if facilitatorURL == "" {
		fmt.Println("FACILITATOR_URL environment variable is required")
		os.Exit(1)
	}

	evmNetwork := x402.Network("eip155:84532") // Base Sepolia

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())

	facilitatorClient := x402http.NewHTTPFacilitatorClient(&x402http.FacilitatorConfig{
		URL: facilitatorURL,
	})

	/**
	 * Declare Payment Identifier Extension
	 *
	 * DeclarePaymentIdentifierExtension(required bool) creates the extension declaration.
	 * - required=true: Clients MUST provide a payment identifier
	 * - required=false: Clients MAY provide a payment identifier (optional)
	 */
	paymentIdExtension := paymentidentifier.DeclarePaymentIdentifierExtension(true)

	routes := x402http.RoutesConfig{
		"POST /order": {
			Accepts: x402http.PaymentOptions{
				{
					Scheme:  "exact",
					PayTo:   evmPayeeAddress,
					Price:   "$0.01",
					Network: evmNetwork,
				},
			},
			Description: "Create an order (requires payment identifier for idempotency)",
			MimeType:    "application/json",
			Extensions: map[string]interface{}{
				paymentidentifier.PAYMENT_IDENTIFIER: paymentIdExtension,
			},
		},
	}

	r.Use(ginmw.X402Payment(ginmw.Config{
		Routes:                 routes,
		Facilitator:           facilitatorClient,
		Schemes:               []ginmw.SchemeConfig{
			{Network: evmNetwork, Server: evm.NewExactEvmScheme()},
		},
		SyncFacilitatorOnStart: true,
		Timeout:                30 * time.Second,
	}))

	// In-memory store for processed payment IDs (use Redis/DB in production)
	processedPayments := make(map[string]string)

	r.POST("/order", func(c *gin.Context) {
		// Get the payment payload from context (set by middleware)
		payloadInterface, exists := c.Get("x402_payload")
		if !exists {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "payment payload not found"})
			return
		}

		payload, ok := payloadInterface.(x402.PaymentPayload)
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid payload type"})
			return
		}

		// Extract payment identifier from the payload
		paymentID, err := paymentidentifier.ExtractPaymentIdentifier(payload, true)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("invalid payment identifier: %v", err)})
			return
		}

		// Check for required payment identifier
		if paymentID == "" {
			// This shouldn't happen if extension is properly validated by facilitator
			c.JSON(http.StatusBadRequest, gin.H{"error": "payment identifier is required"})
			return
		}

		// Check for duplicate payment (idempotency)
		if existingOrderID, found := processedPayments[paymentID]; found {
			fmt.Printf("Duplicate payment detected: %s -> returning existing order: %s\n", paymentID, existingOrderID)
			c.JSON(http.StatusOK, gin.H{
				"orderId":   existingOrderID,
				"status":    "already_processed",
				"paymentId": paymentID,
				"message":   "This payment was already processed",
			})
			return
		}

		// Process the order (your business logic here)
		orderID := fmt.Sprintf("order_%d", time.Now().UnixNano())

		// Store the payment ID for future deduplication
		processedPayments[paymentID] = orderID

		fmt.Printf("New order created: %s with payment ID: %s\n", orderID, paymentID)

		c.JSON(http.StatusOK, gin.H{
			"orderId":   orderID,
			"status":    "created",
			"paymentId": paymentID,
			"message":   "Order created successfully",
		})
	})

	fmt.Printf("Payment Identifier example running on http://localhost:%s\n", DefaultPort)
	fmt.Printf("POST /order - requires payment identifier for idempotency\n")

	if err := r.Run(":" + DefaultPort); err != nil {
		fmt.Printf("Error starting server: %v\n", err)
		os.Exit(1)
	}
}

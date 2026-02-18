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

type processedPayment struct {
	orderID     string
	fingerprint string
}

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
 * - Use OnBeforeSettle + OnAfterSettle + OnSettleFailure hooks to skip duplicate settlements
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

	// Two separate stores (use Redis/DB in production):
	// - settledPayments: IDs that have been settled on-chain, checked before settlement
	// - processedPayments: order ID cache for returning idempotent responses
	settledPayments := make(map[string]bool)
	processedPayments := make(map[string]processedPayment)

	/**
	 * Create x402 resource server with settlement deduplication.
	 *
	 * The middleware calls c.Next() (handler) BEFORE ProcessSettlement, so the
	 * handler populates processedPayments before settlement hooks run. We use a
	 * separate settledPayments store — populated in OnAfterSettle — so that
	 * OnBeforeSettle only skips settlement for IDs that have actually been
	 * settled on-chain.
	 *
	 * Flow for first request:
	 *   handler stores order → OnBeforeSettle: not in settledPayments → settle →
	 *   OnAfterSettle: add to settledPayments
	 *
	 * Flow for duplicate request:
	 *   handler returns cached order → OnBeforeSettle: found in settledPayments →
	 *   abort → OnSettleFailure: recover with success
	 */
	server := x402.Newx402ResourceServer(
		x402.WithFacilitatorClient(facilitatorClient),
	).
		Register(evmNetwork, evm.NewExactEvmScheme()).
		OnBeforeSettle(func(ctx x402.SettleContext) (*x402.BeforeHookResult, error) {
			id, err := paymentidentifier.ExtractPaymentIdentifierFromBytes(ctx.PayloadBytes, false)
			if err != nil || id == "" {
				return nil, nil // No payment ID, proceed normally
			}

			if settledPayments[id] {
				fmt.Printf("Duplicate settlement skipped for payment ID: %s\n", id)
				return &x402.BeforeHookResult{
					Abort:  true,
					Reason: "duplicate_payment_id",
				}, nil
			}

			return nil, nil
		}).
		OnAfterSettle(func(ctx x402.SettleResultContext) error {
			id, err := paymentidentifier.ExtractPaymentIdentifierFromBytes(ctx.PayloadBytes, false)
			if err != nil || id == "" {
				return nil
			}
			settledPayments[id] = true
			fmt.Printf("Payment ID settled: %s\n", id)
			return nil
		}).
		OnSettleFailure(func(ctx x402.SettleFailureContext) (*x402.SettleFailureHookResult, error) {
			// Recover from the abort we triggered for duplicate payment IDs.
			// Return a success response so the middleware doesn't return a 402.
			if settleErr, ok := ctx.Error.(*x402.SettleError); ok && settleErr.ErrorReason == "duplicate_payment_id" {
				return &x402.SettleFailureHookResult{
					Recovered: true,
					Result:    &x402.SettleResponse{Success: true},
				}, nil
			}
			return nil, nil
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

	r.Use(ginmw.PaymentMiddleware(routes, server,
		ginmw.WithTimeout(30*time.Second),
	))

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

		// Compute payload fingerprint for idempotency comparison
		fingerprint, err := paymentidentifier.PayloadFingerprint(payload)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to compute payload fingerprint: %v", err)})
			return
		}

		// Check for duplicate payment (idempotency)
		if existing, found := processedPayments[paymentID]; found {
			if existing.fingerprint != fingerprint {
				fmt.Printf("Conflict: payment ID %s reused with different payload\n", paymentID)
				c.JSON(http.StatusConflict, gin.H{
					"error":     "payment identifier already used with different payload",
					"paymentId": paymentID,
				})
				return
			}

			fmt.Printf("Duplicate payment detected: %s -> returning existing order: %s\n", paymentID, existing.orderID)
			c.JSON(http.StatusOK, gin.H{
				"orderId":   existing.orderID,
				"status":    "already_processed",
				"paymentId": paymentID,
				"message":   "This payment was already processed",
			})
			return
		}

		// Process the order (your business logic here)
		orderID := fmt.Sprintf("order_%d", time.Now().UnixNano())

		// Store the payment ID and fingerprint for future deduplication
		processedPayments[paymentID] = processedPayment{
			orderID:     orderID,
			fingerprint: fingerprint,
		}

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

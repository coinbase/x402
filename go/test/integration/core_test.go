package integration_test

import (
	"context"
	"encoding/json"
	"testing"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/test/mocks/cash"
)

// TestCoreIntegration tests the integration between x402Client, x402ResourceServer, and x402Facilitator
func TestCoreIntegration(t *testing.T) {
	t.Run("Cash Flow - x402Client / x402ResourceServer / x402Facilitator", func(t *testing.T) {
		ctx := context.Background()

		// Setup client with cash scheme
		client := x402.Newx402Client()
		client.RegisterScheme("x402:cash", cash.NewSchemeNetworkClient("John"))

		// Setup facilitator with cash scheme
		facilitator := x402.Newx402Facilitator()
		facilitator.RegisterScheme("x402:cash", cash.NewSchemeNetworkFacilitator())

		// Create facilitator client wrapper
		facilitatorClient := cash.NewFacilitatorClient(facilitator)

		// Setup resource server
		server := x402.Newx402ResourceServer(
			x402.WithFacilitatorClient(facilitatorClient),
		)
		server.RegisterScheme("x402:cash", cash.NewSchemeNetworkServer())

		// Initialize server to fetch supported kinds
		err := server.Initialize(ctx)
		if err != nil {
			t.Fatalf("Failed to initialize server: %v", err)
		}

		// Server - builds PaymentRequired response
		accepts := []x402.PaymentRequirements{
			cash.BuildPaymentRequirements("Company Co.", "USD", "1"),
		}
		resource := x402.ResourceInfo{
			URL:         "https://company.co",
			Description: "Company Co. resource",
			MimeType:    "application/json",
		}
		paymentRequiredResponse := server.CreatePaymentRequiredResponse(accepts, resource, "", nil)

		// Client - responds with PaymentPayload response
		selected, err := client.SelectPaymentRequirements(paymentRequiredResponse.X402Version, accepts)
		if err != nil {
			t.Fatalf("Failed to select payment requirements: %v", err)
		}

		// Marshal selected requirements to bytes
		selectedBytes, err := json.Marshal(selected)
		if err != nil {
			t.Fatalf("Failed to marshal requirements: %v", err)
		}

		payloadBytes, err := client.CreatePaymentPayload(ctx, paymentRequiredResponse.X402Version, selectedBytes, nil, nil)
		if err != nil {
			t.Fatalf("Failed to create payment payload: %v", err)
		}

		// Server - maps payment payload to payment requirements
		accepted := server.FindMatchingRequirements(accepts, payloadBytes)
		if accepted == nil {
			t.Fatal("No matching payment requirements found")
		}

		// Marshal accepted requirements to bytes
		acceptedBytes, err := json.Marshal(accepted)
		if err != nil {
			t.Fatalf("Failed to marshal accepted requirements: %v", err)
		}

		// Server - verifies payment
		verifyResponse, err := server.VerifyPayment(ctx, payloadBytes, acceptedBytes)
		if err != nil {
			t.Fatalf("Failed to verify payment: %v", err)
		}

		if !verifyResponse.IsValid {
			t.Fatalf("Payment verification failed: %s", verifyResponse.InvalidReason)
		}

		// Server does work here...

		// Server - settles payment
		settleResponse, err := server.SettlePayment(ctx, payloadBytes, acceptedBytes)
		if err != nil {
			t.Fatalf("Failed to settle payment: %v", err)
		}

		if !settleResponse.Success {
			t.Fatalf("Payment settlement failed: %s", settleResponse.ErrorReason)
		}

		// Verify the transaction message
		expectedTransaction := "John transferred 1 USD to Company Co."
		if settleResponse.Transaction != expectedTransaction {
			t.Errorf("Expected transaction '%s', got '%s'", expectedTransaction, settleResponse.Transaction)
		}
	})
}

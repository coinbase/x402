package integration_test

import (
	"context"
	"testing"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/test/mocks/cash"
)

// TestCoreIntegration tests the integration between x402Client, x402ResourceService, and x402Facilitator
func TestCoreIntegration(t *testing.T) {
	t.Run("Cash Flow - x402Client / x402ResourceService / x402Facilitator", func(t *testing.T) {
		ctx := context.Background()

		// Setup client with cash scheme
		client := x402.Newx402Client()
		client.RegisterScheme("x402:cash", cash.NewSchemeNetworkClient("John"))

		// Setup facilitator with cash scheme
		facilitator := x402.Newx402Facilitator()
		facilitator.RegisterScheme("x402:cash", cash.NewSchemeNetworkFacilitator())

		// Create facilitator client wrapper
		facilitatorClient := cash.NewFacilitatorClient(facilitator)

		// Setup resource service
		service := x402.Newx402ResourceService(
			x402.WithFacilitatorClient(facilitatorClient),
		)
		service.RegisterScheme("x402:cash", cash.NewSchemeNetworkService())

		// Initialize service to fetch supported kinds
		err := service.Initialize(ctx)
		if err != nil {
			t.Fatalf("Failed to initialize service: %v", err)
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
		paymentRequiredResponse := service.CreatePaymentRequiredResponse(accepts, resource, "", nil)

		// Client - responds with PaymentPayload response
		selected, err := client.SelectPaymentRequirements(paymentRequiredResponse.X402Version, accepts)
		if err != nil {
			t.Fatalf("Failed to select payment requirements: %v", err)
		}

		paymentPayload, err := client.CreatePaymentPayload(ctx, paymentRequiredResponse.X402Version, selected, paymentRequiredResponse.Resource, paymentRequiredResponse.Extensions)
		if err != nil {
			t.Fatalf("Failed to create payment payload: %v", err)
		}

		// Server - maps payment payload to payment requirements
		accepted := service.FindMatchingRequirements(accepts, paymentPayload)
		if accepted == nil {
			t.Fatal("No matching payment requirements found")
		}

		// Server - verifies payment
		verifyResponse, err := service.VerifyPayment(ctx, paymentPayload, *accepted)
		if err != nil {
			t.Fatalf("Failed to verify payment: %v", err)
		}

		if !verifyResponse.IsValid {
			t.Fatalf("Payment verification failed: %s", verifyResponse.InvalidReason)
		}

		// Server does work here...

		// Server - settles payment
		settleResponse, err := service.SettlePayment(ctx, paymentPayload, *accepted)
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

package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/extensions/paymentidentifier"
	x402http "github.com/coinbase/x402/go/http"
	evm "github.com/coinbase/x402/go/mechanisms/evm/exact/client"
	evmsigners "github.com/coinbase/x402/go/signers/evm"
	"github.com/joho/godotenv"
)

/**
 * Payment Identifier Client Example
 *
 * This demonstrates how to use the payment-identifier extension on the client side.
 * The extension allows clients to provide a unique idempotency key for payment requests.
 *
 * Key concepts:
 * - Check if server requires payment identifier from PaymentRequired response
 * - Append a payment identifier using AppendPaymentIdentifierToExtensions()
 * - Use GeneratePaymentID() for automatic ID generation or provide custom IDs
 *
 * Use cases:
 * - Retry failed requests without duplicate charges
 * - Ensure exactly-once processing semantics
 * - Track payments across multiple request attempts
 */

func main() {
	godotenv.Load()

	evmPrivateKey := os.Getenv("EVM_PRIVATE_KEY")
	if evmPrivateKey == "" {
		fmt.Println("EVM_PRIVATE_KEY environment variable is required")
		os.Exit(1)
	}

	serverURL := os.Getenv("SERVER_URL")
	if serverURL == "" {
		serverURL = "http://localhost:4021/order"
	}

	ctx := context.Background()

	// Create signer from private key
	evmSigner, err := evmsigners.NewClientSignerFromPrivateKey(evmPrivateKey)
	if err != nil {
		fmt.Printf("Failed to create signer: %v\n", err)
		os.Exit(1)
	}

	// Create client with scheme registration
	client := x402.Newx402Client().
		Register("eip155:*", evm.NewExactEvmScheme(evmSigner))

	// Generate a unique payment ID for this session
	paymentID := paymentidentifier.GeneratePaymentID("")
	fmt.Printf("Generated Payment ID: %s\n\n", paymentID)

	// Register hook to add payment identifier to extensions
	client.OnBeforePaymentCreation(func(ctx x402.PaymentCreationContext) (*x402.BeforePaymentCreationHookResult, error) {
		fmt.Println("[BeforePaymentCreation] Checking for payment-identifier extension...")

		// Check if extensions exist
		if ctx.Extensions == nil {
			fmt.Println("  No extensions declared by server")
			return nil, nil
		}

		// Check if payment identifier is declared by server
		ext := ctx.Extensions[paymentidentifier.PAYMENT_IDENTIFIER]
		if ext == nil {
			fmt.Println("  Server does not support payment-identifier extension")
			return nil, nil
		}

		required := paymentidentifier.IsPaymentIdentifierRequired(ext)
		fmt.Printf("  Payment identifier required: %v\n", required)

		// Append payment identifier to extensions
		err := paymentidentifier.AppendPaymentIdentifierToExtensions(ctx.Extensions, paymentID)
		if err != nil {
			return nil, fmt.Errorf("failed to append payment identifier: %w", err)
		}

		fmt.Printf("  Added payment ID: %s\n\n", paymentID)
		return nil, nil
	})

	// Create HTTP client wrapper
	httpClient := x402http.Newx402HTTPClient(client)
	wrappedClient := x402http.WrapHTTPClientWithPayment(http.DefaultClient, httpClient)

	// First request - will process payment
	fmt.Println("First Request (with payment ID)")
	fmt.Printf("Making request to: %s\n\n", serverURL)

	startTime1 := time.Now()
	resp1, err := makeRequest(ctx, wrappedClient, serverURL)
	duration1 := time.Since(startTime1)
	if err != nil {
		fmt.Printf("Request failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Response (%v): %s\n\n", duration1, resp1)

	// Second request - same payment ID, should return from cache
	fmt.Println("Second Request (SAME payment ID)")
	fmt.Printf("Making request to: %s\n", serverURL)
	fmt.Println("Expected: Server returns cached response without payment processing\n")

	startTime2 := time.Now()
	resp2, err := makeRequest(ctx, wrappedClient, serverURL)
	duration2 := time.Since(startTime2)
	if err != nil {
		fmt.Printf("Request failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Response (%v): %s\n\n", duration2, resp2)

	// Summary
	fmt.Println("Summary")
	fmt.Printf("  Payment ID: %s\n", paymentID)
	fmt.Printf("  First request:  %v\n", duration1)
	fmt.Printf("  Second request: %v\n", duration2)
}

func makeRequest(ctx context.Context, client *http.Client, url string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "POST", url, strings.NewReader(`{"item": "widget"}`))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	return string(body), nil
}

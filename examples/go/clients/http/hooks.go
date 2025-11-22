package main

import (
	"fmt"

	x402 "github.com/coinbase/x402/go"
	evm "github.com/coinbase/x402/go/mechanisms/evm/exact/client"
	evmsigners "github.com/coinbase/x402/go/signers/evm"
)

/**
 * Hooks Client
 *
 * This demonstrates how to register hooks for payment creation lifecycle events.
 * Hooks allow you to add custom logic at different stages:
 * - OnBeforePaymentCreation: Called before payment creation starts, can abort
 * - OnAfterPaymentCreation: Called after successful payment creation
 * - OnPaymentCreationFailure: Called when payment creation fails, can recover
 */

func createHooksClient(evmPrivateKey string) (*x402.X402Client, error) {
	// Create signer from private key
	evmSigner, err := evmsigners.NewClientSignerFromPrivateKey(evmPrivateKey)
	if err != nil {
		return nil, err
	}

	// Create client with scheme registration
	client := x402.Newx402Client().
		Register("eip155:*", evm.NewExactEvmScheme(evmSigner))

	// Register lifecycle hooks

	// OnBeforePaymentCreation: Called before payment is created
	// Use this for logging, validation, or aborting payment creation
	client.OnBeforePaymentCreation(func(ctx x402.PaymentCreationContext) (*x402.BeforePaymentCreationResult, error) {
		fmt.Printf("🔍 [BeforePaymentCreation] Creating payment for:\n")
		fmt.Printf("   Network: %s\n", ctx.Requirements.Network)
		fmt.Printf("   Scheme: %s\n", ctx.Requirements.Scheme)

		// You can abort payment creation by returning:
		// return &x402.BeforePaymentCreationResult{
		//     Abort: true,
		//     Reason: "Payment not allowed for this resource",
		// }, nil

		return nil, nil // Continue with payment creation
	})

	// OnAfterPaymentCreation: Called after payment is successfully created
	// Use this for logging, metrics, or other side effects
	client.OnAfterPaymentCreation(func(ctx x402.PaymentCreationResultContext) error {
		fmt.Printf("✅ [AfterPaymentCreation] Payment created successfully\n")
		fmt.Printf("   Payload size: %d bytes\n", len(ctx.PayloadBytes))

		// Perform side effects like logging to database, sending metrics, etc.
		// Errors here are logged but don't fail the payment

		return nil
	})

	// OnPaymentCreationFailure: Called when payment creation fails
	// Use this for error recovery or alternative payment methods
	client.OnPaymentCreationFailure(func(ctx x402.PaymentCreationFailureContext) (*x402.PaymentCreationFailureResult, error) {
		fmt.Printf("❌ [OnPaymentCreationFailure] Payment creation failed: %v\n", ctx.Error)

		// You could attempt to recover by providing an alternative payload:
		// return &x402.PaymentCreationFailureResult{
		//     Recovered: true,
		//     Payload: alternativePayload,
		// }, nil

		return nil, nil // Don't recover, let it fail
	})

	return client, nil
}


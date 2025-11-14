package main

import (
	"context"
	"fmt"
	"log"

	x402 "github.com/coinbase/x402/go"
)

// Example demonstrating lifecycle hooks in x402 Resource Service
func main() {
	// Create service with hooks registered at construction
	service := x402.Newx402ResourceService(
		// Register a beforeVerify hook at construction
		x402.WithBeforeVerifyHook(func(ctx x402.VerifyContext) (*x402.BeforeHookResult, error) {
			log.Printf("[HOOK] Before Verify - checking security rules")
			
			// Example: Check if metadata indicates suspicious activity
			if ctx.RequestMetadata != nil {
				if suspicious, ok := ctx.RequestMetadata["suspicious"].(bool); ok && suspicious {
					log.Printf("[HOOK] Suspicious activity detected - aborting verification")
					return &x402.BeforeHookResult{
						Abort:  true,
						Reason: "Suspicious activity detected",
					}, nil
				}
			}
			
			log.Printf("[HOOK] Security check passed - proceeding with verification")
			return nil, nil
		}),
	)
	
	// Register hooks using chainable methods after construction
	service.
		OnAfterVerify(logAfterVerify).
		OnVerifyFailure(handleVerifyFailure).
		OnBeforeSettle(checkBalance).
		OnAfterSettle(recordTransaction).
		OnSettleFailure(handleSettleFailure)
	
	// Example 1: Normal verification flow
	fmt.Println("\n=== Example 1: Normal Verification ===")
	demonstrateNormalFlow(service)
	
	// Example 2: Verification aborted by hook
	fmt.Println("\n=== Example 2: Verification Aborted by Hook ===")
	demonstrateAbortedFlow(service)
	
	// Example 3: Verification failure with recovery
	fmt.Println("\n=== Example 3: Verification Failure with Recovery ===")
	demonstrateRecoveryFlow(service)
	
	// Example 4: Settlement flow
	fmt.Println("\n=== Example 4: Settlement Flow ===")
	demonstrateSettlementFlow(service)
}

// logAfterVerify logs successful verification
func logAfterVerify(ctx x402.VerifyResultContext) error {
	log.Printf("[HOOK] After Verify - Payment verified successfully")
	log.Printf("       Valid: %v, Duration: %v", ctx.Result.IsValid, ctx.Duration)
	if ctx.RequestMetadata != nil {
		log.Printf("       Metadata: %+v", ctx.RequestMetadata)
	}
	return nil
}

// handleVerifyFailure handles verification failures and optionally recovers
func handleVerifyFailure(ctx x402.VerifyFailureContext) (*x402.VerifyFailureHookResult, error) {
	log.Printf("[HOOK] Verify Failure - Error: %v", ctx.Error)
	log.Printf("       Duration: %v", ctx.Duration)
	
	// Example: Could implement retry logic, alerting, etc.
	// For demonstration, we'll just log
	
	// Don't recover - let the error propagate
	return nil, nil
}

// checkBalance checks if user has sufficient balance before settlement
func checkBalance(ctx x402.SettleContext) (*x402.BeforeHookResult, error) {
	log.Printf("[HOOK] Before Settle - checking balance")
	
	// Example: Check if user has sufficient balance
	// In production, this would query a database or blockchain
	if ctx.RequestMetadata != nil {
		if insufficient, ok := ctx.RequestMetadata["insufficientBalance"].(bool); ok && insufficient {
			log.Printf("[HOOK] Insufficient balance - aborting settlement")
			return &x402.BeforeHookResult{
				Abort:  true,
				Reason: "Insufficient balance",
			}, nil
		}
	}
	
	log.Printf("[HOOK] Balance check passed - proceeding with settlement")
	return nil, nil
}

// recordTransaction records the transaction after successful settlement
func recordTransaction(ctx x402.SettleResultContext) error {
	log.Printf("[HOOK] After Settle - recording transaction")
	log.Printf("       Success: %v, Transaction: %s", ctx.Result.Success, ctx.Result.Transaction)
	log.Printf("       Duration: %v", ctx.Duration)
	
	// Example: Store transaction in database
	// db.RecordTransaction(ctx.Result.Transaction, ctx.Result.Amount, ...)
	
	return nil
}

// handleSettleFailure handles settlement failures
func handleSettleFailure(ctx x402.SettleFailureContext) (*x402.SettleFailureHookResult, error) {
	log.Printf("[HOOK] Settle Failure - Error: %v", ctx.Error)
	log.Printf("       Duration: %v", ctx.Duration)
	
	// Example: Could trigger alerts, initiate refunds, etc.
	// For demonstration, we'll just log
	
	// Don't recover - let the error propagate
	return nil, nil
}

// demonstrateNormalFlow shows a normal verification flow
func demonstrateNormalFlow(service *x402.X402ResourceService) {
	ctx := context.Background()
	metadata := map[string]interface{}{
		"userId": "user123",
		"source": "web",
	}
	
	payloadBytes := []byte(`{"x402Version":2}`)
	requirementsBytes := []byte(`{"scheme":"exact","network":"eip155:8453"}`)
	
	result, err := service.VerifyPayment(ctx, payloadBytes, requirementsBytes, metadata)
	
	fmt.Printf("Result: IsValid=%v, Error=%v\n", result.IsValid, err)
}

// demonstrateAbortedFlow shows verification being aborted by a hook
func demonstrateAbortedFlow(service *x402.X402ResourceService) {
	ctx := context.Background()
	metadata := map[string]interface{}{
		"userId":     "user456",
		"suspicious": true, // This will trigger abort
	}
	
	payloadBytes := []byte(`{"x402Version":2}`)
	requirementsBytes := []byte(`{"scheme":"exact","network":"eip155:8453"}`)
	
	result, err := service.VerifyPayment(ctx, payloadBytes, requirementsBytes, metadata)
	
	fmt.Printf("Result: IsValid=%v, Reason=%s, Error=%v\n", result.IsValid, result.InvalidReason, err)
}

// demonstrateRecoveryFlow shows a failure hook recovering from an error
func demonstrateRecoveryFlow(service *x402.X402ResourceService) {
	// Create a service with recovery hook
	recoveryService := x402.Newx402ResourceService()
	
	recoveryService.OnVerifyFailure(func(ctx x402.VerifyFailureContext) (*x402.VerifyFailureHookResult, error) {
		log.Printf("[HOOK] Attempting to recover from failure: %v", ctx.Error)
		
		// Simulate recovery (e.g., using cached verification result)
		return &x402.VerifyFailureHookResult{
			Recovered: true,
			Result: x402.VerifyResponse{
				IsValid: true,
				Payer:   "0xRecovered",
			},
		}, nil
	})
	
	ctx := context.Background()
	payloadBytes := []byte(`{"x402Version":2}`)
	requirementsBytes := []byte(`{"scheme":"exact","network":"eip155:8453"}`)
	
	result, err := recoveryService.VerifyPayment(ctx, payloadBytes, requirementsBytes)
	
	fmt.Printf("Result: IsValid=%v (recovered), Error=%v\n", result.IsValid, err)
}

// demonstrateSettlementFlow shows the settlement lifecycle hooks
func demonstrateSettlementFlow(service *x402.X402ResourceService) {
	ctx := context.Background()
	metadata := map[string]interface{}{
		"userId": "user789",
		"amount": "1000000", // 1 USDC
	}
	
	payloadBytes := []byte(`{"x402Version":2}`)
	requirementsBytes := []byte(`{"scheme":"exact","network":"eip155:8453"}`)
	
	result, err := service.SettlePayment(ctx, payloadBytes, requirementsBytes, metadata)
	
	fmt.Printf("Result: Success=%v, Error=%v\n", result.Success, err)
}


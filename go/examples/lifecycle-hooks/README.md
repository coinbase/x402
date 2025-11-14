# Lifecycle Hooks Example

This example demonstrates how to use lifecycle hooks in the x402 Resource Service for implementing custom logic at various stages of payment verification and settlement.

## Overview

Lifecycle hooks allow you to inject custom logic at critical points in the payment flow:

### Verify Hooks

1. **BeforeVerify** - Called before payment verification begins
   - Can abort verification
   - Useful for security checks, rate limiting, validation

2. **AfterVerify** - Called after successful verification
   - Useful for logging, analytics, notifications

3. **OnVerifyFailure** - Called when verification fails
   - Can recover from failures
   - Useful for error handling, retry logic, alerting

### Settle Hooks

4. **BeforeSettle** - Called before payment settlement begins
   - Can abort settlement
   - Useful for balance checks, business rules validation

5. **AfterSettle** - Called after successful settlement
   - Useful for recording transactions, updating databases, notifications

6. **OnSettleFailure** - Called when settlement fails
   - Can recover from failures
   - Useful for error handling, refund initiation, alerting

## Hook Capabilities

### Aborting Operations

BeforeVerify and BeforeSettle hooks can abort the operation:

```go
service.OnBeforeVerify(func(ctx x402.VerifyContext) (*x402.BeforeHookResult, error) {
    if isSuspicious(ctx.RequestMetadata) {
        return &x402.BeforeHookResult{
            Abort:  true,
            Reason: "Suspicious activity detected",
        }, nil
    }
    return nil, nil // Continue normally
})
```

### Recovering from Failures

OnVerifyFailure and OnSettleFailure hooks can recover from errors:

```go
service.OnVerifyFailure(func(ctx x402.VerifyFailureContext) (*x402.VerifyFailureHookResult, error) {
    // Try to recover using cached result
    cachedResult := checkCache(ctx.PayloadBytes)
    if cachedResult != nil {
        return &x402.VerifyFailureHookResult{
            Recovered: true,
            Result:    *cachedResult,
        }, nil
    }
    return nil, nil // Don't recover, propagate error
})
```

### Accessing Context

All hooks receive rich context information:

```go
type VerifyContext struct {
    Ctx              context.Context              // Request context
    PayloadBytes     []byte                       // Payment payload
    RequirementsBytes []byte                      // Payment requirements
    Timestamp        time.Time                    // When operation started
    RequestMetadata  map[string]interface{}       // Custom metadata
}

type VerifyResultContext struct {
    VerifyContext                                 // Embedded context
    Result           VerifyResponse               // Verification result
    Duration         time.Duration                // How long it took
}

type VerifyFailureContext struct {
    VerifyContext                                 // Embedded context
    Error            error                        // The error that occurred
    Duration         time.Duration                // How long before failure
}
```

## Registration Methods

### Option-Based (at Construction)

```go
service := x402.Newx402ResourceService(
    x402.WithBeforeVerifyHook(myHook),
    x402.WithAfterVerifyHook(myOtherHook),
)
```

### Chainable Methods (after Construction)

```go
service.
    OnBeforeVerify(securityCheck).
    OnAfterVerify(logPayment).
    OnVerifyFailure(handleError).
    OnBeforeSettle(checkBalance).
    OnAfterSettle(recordTransaction).
    OnSettleFailure(initiateRefund)
```

## Use Cases

### 1. Security & Fraud Detection

```go
service.OnBeforeVerify(func(ctx x402.VerifyContext) (*x402.BeforeHookResult, error) {
    score := fraudDetection.CheckPayment(ctx.PayloadBytes)
    if score > 0.8 {
        alert.Security("High fraud score: %f", score)
        return &x402.BeforeHookResult{
            Abort:  true,
            Reason: "Failed fraud check",
        }, nil
    }
    return nil, nil
})
```

### 2. Rate Limiting

```go
service.OnBeforeVerify(func(ctx x402.VerifyContext) (*x402.BeforeHookResult, error) {
    userId := ctx.RequestMetadata["userId"].(string)
    if rateLimiter.Exceeded(userId) {
        return &x402.BeforeHookResult{
            Abort:  true,
            Reason: "Rate limit exceeded",
        }, nil
    }
    return nil, nil
})
```

### 3. Logging & Analytics

```go
service.OnAfterVerify(func(ctx x402.VerifyResultContext) error {
    analytics.Track("payment_verified", map[string]interface{}{
        "duration": ctx.Duration.Milliseconds(),
        "valid":    ctx.Result.IsValid,
        "userId":   ctx.RequestMetadata["userId"],
    })
    return nil
})
```

### 4. Database Recording

```go
service.OnAfterSettle(func(ctx x402.SettleResultContext) error {
    return database.RecordTransaction(Transaction{
        Hash:      ctx.Result.Transaction,
        Network:   ctx.Result.Network,
        Timestamp: ctx.Timestamp,
        Amount:    extractAmount(ctx.RequirementsBytes),
    })
})
```

### 5. Error Handling & Alerting

```go
service.OnVerifyFailure(func(ctx x402.VerifyFailureContext) (*x402.VerifyFailureHookResult, error) {
    if ctx.Duration > 5*time.Second {
        alert.Performance("Slow verification: %v", ctx.Duration)
    }
    
    logger.Error("Verification failed", 
        "error", ctx.Error,
        "duration", ctx.Duration,
        "payload", string(ctx.PayloadBytes),
    )
    
    return nil, nil // Don't recover
})
```

### 6. Retry Logic with Backoff

```go
service.OnVerifyFailure(func(ctx x402.VerifyFailureContext) (*x402.VerifyFailureHookResult, error) {
    // Retry on transient errors
    if isTransientError(ctx.Error) {
        time.Sleep(100 * time.Millisecond)
        
        // Retry verification
        result, err := retryVerification(ctx.Ctx, ctx.PayloadBytes, ctx.RequirementsBytes)
        if err == nil {
            return &x402.VerifyFailureHookResult{
                Recovered: true,
                Result:    result,
            }, nil
        }
    }
    return nil, nil
})
```

### 7. Business Rules Validation

```go
service.OnBeforeSettle(func(ctx x402.SettleContext) (*x402.BeforeHookResult, error) {
    // Check business rules
    userId := ctx.RequestMetadata["userId"].(string)
    user := database.GetUser(userId)
    
    if !user.CanMakePayments() {
        return &x402.BeforeHookResult{
            Abort:  true,
            Reason: "User account restricted",
        }, nil
    }
    
    if user.DailyLimitExceeded() {
        return &x402.BeforeHookResult{
            Abort:  true,
            Reason: "Daily payment limit exceeded",
        }, nil
    }
    
    return nil, nil
})
```

## Running the Example

```bash
cd go/examples/lifecycle-hooks
go run main.go
```

## Output

The example demonstrates various scenarios:

1. **Normal Flow** - All hooks execute successfully
2. **Aborted Flow** - BeforeVerify hook aborts the operation
3. **Recovery Flow** - OnVerifyFailure hook recovers from an error
4. **Settlement Flow** - Shows settlement lifecycle hooks

## Key Takeaways

- Hooks execute in the order they are registered
- Multiple hooks of the same type can be registered
- Before hooks can abort operations
- Failure hooks can recover from errors
- All hooks receive rich context with metadata
- Hooks are optional - register only what you need
- Use metadata to pass custom data to hooks

## Best Practices

1. **Keep hooks fast** - They're in the critical path
2. **Use async operations** - Leverage goroutines for slow operations
3. **Handle errors gracefully** - Don't panic in hooks
4. **Log appropriately** - Use structured logging
5. **Use metadata** - Pass custom data via metadata parameter
6. **Test thoroughly** - Test both success and failure paths
7. **Document behavior** - Make hook behavior clear to team

## Integration with Middleware

Hooks work seamlessly with HTTP middleware:

```go
// In Gin middleware
service := x402.Newx402ResourceService(facilitatorClient)

service.
    OnBeforeVerify(func(ctx x402.VerifyContext) (*x402.BeforeHookResult, error) {
        // Access HTTP context from metadata
        ginCtx := ctx.RequestMetadata["ginContext"].(*gin.Context)
        userId := ginCtx.GetString("userId")
        // ... security checks
        return nil, nil
    }).
    OnAfterSettle(func(ctx x402.SettleResultContext) error {
        // Notify user of successful payment
        userId := ctx.RequestMetadata["userId"].(string)
        notifications.Send(userId, "Payment completed")
        return nil
    })
```

## Related Examples

- [Quick Start](../quick-start/) - Basic x402 usage
- [Middleware Server](../middleware-server/) - HTTP middleware integration
- [Fluent API](../fluent-api/) - Builder patterns

## Further Reading

- [Go SDK Documentation](../../README.md)
- [TypeScript Hooks Reference](../../../typescript/packages/core/src/server/x402ResourceService.ts)
- [x402 Protocol Specification](../../../specs/x402-specification.md)


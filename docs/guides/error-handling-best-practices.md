# Error Handling Best Practices

This guide covers best practices for handling errors in x402 applications, with patterns that ensure reliability, maintainability, and great user experience.

## Overview

x402 payments introduce additional complexity to your application's error handling. Network issues, payment failures, facilitator problems, and wallet errors all need to be handled gracefully to provide a robust user experience.

This guide demonstrates proven patterns for error handling across different programming languages and use cases.

## Error Categories

### Payment-Specific Errors

| Error Type | Should Retry? | Typical Cause | Best Practice |
|------------|---------------|---------------|---------------|
| **Payment Invalid** | ❌ No | Malformed payment data, incorrect format | Log for debugging, return clear error to user |
| **Payment Expired** | ✅ Yes, fast | Payment window expired, slow networks | Generate new payment, shorter backoff |
| **Payment Verification Failed** | ✅ Limited retry | Facilitator issues, network problems | Exponential backoff, alert monitoring |
| **Settlement Failed** | ✅ Limited retry | Blockchain congestion, RPC issues | Moderate backoff, check transaction status |
| **Insufficient Balance** | ❌ No | Not enough USDC in wallet | Guide user to fund wallet |

### Infrastructure Errors

| Error Type | Should Retry? | Typical Cause | Best Practice |
|------------|---------------|---------------|---------------|
| **Network Error** | ✅ Yes | DNS issues, connection timeouts | Exponential backoff with jitter |
| **Server Error (5xx)** | ✅ Limited retry | Server overload, temporary issues | Conservative retry, circuit breaker |
| **Client Error (4xx)** | ❌ No | Bad request, authentication issues | Fix request, don't retry |
| **Timeout** | ✅ Yes | Slow networks, overloaded services | Retry with longer timeout |

## Core Principles

### 1. Fail Fast for User Errors

Don't retry errors caused by user mistakes or configuration issues:

```typescript
// ✅ Good: Immediate feedback for user errors
if (error.message.includes('invalid payment data')) {
  throw new UserError('Payment data is malformed. Please check your wallet configuration.');
}

// ❌ Bad: Retrying user errors wastes time
await retry(() => processInvalidPayment(), { maxAttempts: 5 });
```

### 2. Use Exponential Backoff

For transient errors, use exponential backoff to avoid overwhelming services:

```typescript
// ✅ Good: Exponential backoff with jitter
const delay = Math.min(
  initialDelay * Math.pow(2, attempt - 1), 
  maxDelay
) * (0.5 + Math.random()); // Add jitter

await new Promise(resolve => setTimeout(resolve, delay));
```

### 3. Provide Context in Error Messages

Include relevant context to help with debugging:

```typescript
// ✅ Good: Rich context for debugging
throw new PaymentError(
  `Payment verification failed for amount ${amount} USDC to ${recipient}`,
  {
    transactionId: txId,
    facilitatorUrl: facilitator.url,
    networkId: 'eip155:8453',
    attempt: currentAttempt,
  }
);

// ❌ Bad: Generic error with no context
throw new Error('Payment failed');
```

### 4. Isolate Errors in Batch Operations

Don't let individual failures affect the entire batch:

```typescript
// ✅ Good: Error isolation
const results = await Promise.allSettled(
  paymentRequests.map(async (request) => {
    try {
      return await processPayment(request);
    } catch (error) {
      logError(error, { requestId: request.id });
      return { success: false, error: error.message };
    }
  })
);

// ❌ Bad: One failure kills the batch
const results = await Promise.all(
  paymentRequests.map(request => processPayment(request))
);
```

## Language-Specific Patterns

### TypeScript

TypeScript's type system enables powerful error handling patterns:

```typescript
// Discriminated union for type-safe error handling
type PaymentError =
  | { kind: 'network'; retryable: true; backoffMs: number }
  | { kind: 'invalid'; retryable: false; userMessage: string }
  | { kind: 'expired'; retryable: true; renewPayment: boolean };

function classifyError(error: unknown): PaymentError {
  if (error instanceof NetworkError) {
    return { kind: 'network', retryable: true, backoffMs: 2000 };
  }
  // ... other classifications
}

// Usage with full type safety
const errorType = classifyError(caught);
if (errorType.retryable) {
  await delay(errorType.backoffMs);
  // TypeScript knows this is safe
}
```

**See:** [TypeScript Error Handling Example](../../examples/typescript/clients/error-handling/)

### Python

Python's exception system works well with context managers:

```python
import asyncio
from contextlib import asynccontextmanager
from enum import Enum

class ErrorType(Enum):
    NETWORK = "network"
    PAYMENT_INVALID = "payment_invalid"
    PAYMENT_EXPIRED = "payment_expired"

@asynccontextmanager
async def with_retry(max_attempts: int = 3):
    attempt = 0
    while attempt < max_attempts:
        attempt += 1
        try:
            yield attempt
            break  # Success
        except NetworkError as e:
            if attempt < max_attempts:
                delay = min(1.0 * (2 ** (attempt - 1)), 30.0)
                await asyncio.sleep(delay)
                continue
            raise
        except PaymentInvalidError:
            raise  # Don't retry user errors

# Usage
async with with_retry(max_attempts=3) as attempt:
    response = await make_x402_request(url)
```

**See:** [Python Error Handling Example](../../examples/python/clients/error-handling/)

### Go

Go's explicit error handling enables clear error flow:

```go
package main

import (
    "context"
    "fmt"
    "time"
)

type ErrorType int

const (
    ErrorNetwork ErrorType = iota
    ErrorPaymentInvalid
    ErrorPaymentExpired
)

type RetryableError struct {
    Type     ErrorType
    Message  string
    Retryable bool
    BackoffMs int
}

func (e RetryableError) Error() string {
    return e.Message
}

func classifyError(err error) RetryableError {
    switch {
    case isNetworkError(err):
        return RetryableError{
            Type:      ErrorNetwork,
            Message:   err.Error(),
            Retryable: true,
            BackoffMs: 2000,
        }
    case isPaymentInvalid(err):
        return RetryableError{
            Type:      ErrorPaymentInvalid,
            Message:   "Invalid payment data",
            Retryable: false,
        }
    default:
        return RetryableError{
            Type:      ErrorNetwork,
            Message:   err.Error(),
            Retryable: true,
            BackoffMs: 3000,
        }
    }
}

func withRetry(ctx context.Context, maxAttempts int, operation func() error) error {
    for attempt := 1; attempt <= maxAttempts; attempt++ {
        err := operation()
        if err == nil {
            return nil // Success
        }

        retryErr := classifyError(err)
        if !retryErr.Retryable || attempt == maxAttempts {
            return err
        }

        select {
        case <-time.After(time.Duration(retryErr.BackoffMs) * time.Millisecond):
            continue
        case <-ctx.Done():
            return ctx.Err()
        }
    }
    return fmt.Errorf("max attempts exceeded")
}
```

**See:** [Go Error Recovery Example](../../examples/go/clients/advanced/error_recovery.go)

## Monitoring and Observability

### Error Metrics

Track key error metrics to understand system health:

```typescript
// Essential error metrics
const errorMetrics = {
  totalErrors: counter('x402_errors_total'),
  errorsByType: counter('x402_errors_by_type'),
  retryAttempts: counter('x402_retry_attempts_total'),
  errorRate: gauge('x402_error_rate'),
  
  // Business metrics
  failedPayments: counter('x402_failed_payments_total'),
  paymentLatency: histogram('x402_payment_duration_seconds'),
};

function reportError(error: PaymentError, context: ErrorContext) {
  errorMetrics.totalErrors.inc();
  errorMetrics.errorsByType.inc({ type: error.type });
  
  if (context.attempt > 1) {
    errorMetrics.retryAttempts.inc();
  }
}
```

### Structured Logging

Use structured logging for better error analysis:

```json
{
  "timestamp": "2026-02-20T23:00:00Z",
  "level": "error",
  "message": "Payment verification failed",
  "context": {
    "requestId": "req_abc123",
    "userId": "user_456", 
    "amount": "0.01",
    "currency": "USDC",
    "network": "eip155:8453",
    "facilitator": "api.cdp.coinbase.com",
    "attempt": 2,
    "totalAttempts": 3,
    "errorType": "verification_failed",
    "retryAfterMs": 4000
  },
  "error": {
    "name": "PaymentVerificationError",
    "message": "Facilitator returned 503 Service Unavailable",
    "stack": "..."
  }
}
```

## Framework Integration Patterns

### Express.js Middleware

```typescript
import { Request, Response, NextFunction } from 'express';

export function x402ErrorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const errorType = classifyError(error);
  
  // Log with request context
  logger.error('x402 payment error', {
    requestId: req.id,
    url: req.url,
    method: req.method,
    userAgent: req.get('User-Agent'),
    errorType: errorType.kind,
    error: error.message,
  });
  
  // Return appropriate response
  if (errorType.kind === 'payment_expired') {
    res.status(402).json({
      error: 'Payment expired',
      retryable: true,
      newPaymentRequired: true,
    });
  } else if (errorType.kind === 'payment_invalid') {
    res.status(400).json({
      error: 'Invalid payment data',
      retryable: false,
    });
  } else {
    res.status(502).json({
      error: 'Payment processing temporarily unavailable',
      retryable: errorType.retryable,
    });
  }
}
```

### Next.js API Routes

```typescript
// pages/api/protected-endpoint.ts
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const errorHandler = new X402ErrorHandler();
  
  try {
    const result = await errorHandler.withRetry('payment-processing', async () => {
      return await processX402Payment(req);
    });
    
    res.status(200).json(result);
  } catch (error) {
    const errorType = errorHandler.classifyError(error);
    
    res.status(errorType.retryable ? 502 : 400).json({
      error: error.message,
      type: errorType.kind,
      retryable: errorType.retryable,
      requestId: req.headers['x-request-id'],
    });
  }
}
```

### React Error Boundaries

```typescript
import React, { Component, ReactNode } from 'react';

interface State {
  hasError: boolean;
  error?: Error;
  errorType?: PaymentErrorType;
}

export class X402ErrorBoundary extends Component<
  { children: ReactNode; onRetry?: () => void },
  State
> {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    const errorType = classifyError(error);
    return {
      hasError: true,
      error,
      errorType,
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorDisplay 
          error={this.state.error}
          errorType={this.state.errorType}
          onRetry={this.props.onRetry}
        />
      );
    }

    return this.props.children;
  }
}
```

## Testing Error Scenarios

### Unit Testing

```typescript
describe('X402ErrorHandler', () => {
  it('should retry network errors with exponential backoff', async () => {
    const mockOperation = vi.fn()
      .mockRejectedValueOnce(new NetworkError('Connection failed'))
      .mockRejectedValueOnce(new NetworkError('Connection failed'))
      .mockResolvedValue('success');

    const result = await errorHandler.withRetry('test', mockOperation);
    
    expect(result).toBe('success');
    expect(mockOperation).toHaveBeenCalledTimes(3);
  });

  it('should not retry payment invalid errors', async () => {
    const mockOperation = vi.fn()
      .mockRejectedValue(new PaymentInvalidError('Invalid signature'));

    await expect(errorHandler.withRetry('test', mockOperation))
      .rejects.toThrow('Invalid signature');
    
    expect(mockOperation).toHaveBeenCalledTimes(1);
  });
});
```

### Integration Testing

```typescript
describe('x402 Payment Flow', () => {
  it('should handle facilitator timeout gracefully', async () => {
    // Mock facilitator to timeout
    nock('https://facilitator.example.com')
      .post('/verify')
      .delayConnection(5000)
      .reply(200);

    const client = new x402Client({ timeout: 1000 });
    
    await expect(client.makePayment(paymentData))
      .rejects.toThrow(/timeout/i);
    
    // Should have logged the timeout
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        errorType: 'timeout',
        facilitator: 'facilitator.example.com',
      })
    );
  });
});
```

## Performance Considerations

### Circuit Breaker Pattern

Prevent cascade failures with circuit breakers:

```typescript
class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime?: Date;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private shouldAttemptReset(): boolean {
    return this.lastFailureTime && 
           Date.now() - this.lastFailureTime.getTime() > 60000;
  }
}
```

### Request Deduplication

Avoid duplicate requests during retries:

```typescript
class RequestDeduplicator {
  private pending = new Map<string, Promise<any>>();

  async execute<T>(key: string, operation: () => Promise<T>): Promise<T> {
    if (this.pending.has(key)) {
      return this.pending.get(key)!;
    }

    const promise = operation().finally(() => {
      this.pending.delete(key);
    });

    this.pending.set(key, promise);
    return promise;
  }
}
```

## Security Considerations

### Rate Limiting Retry Attempts

Prevent abuse with rate limiting:

```typescript
class RateLimitedRetry {
  private attempts = new Map<string, number[]>();

  canRetry(identifier: string, windowMs = 60000, maxAttempts = 10): boolean {
    const now = Date.now();
    const userAttempts = this.attempts.get(identifier) || [];
    
    // Remove old attempts outside the window
    const recentAttempts = userAttempts.filter(time => now - time < windowMs);
    
    if (recentAttempts.length >= maxAttempts) {
      return false;
    }
    
    recentAttempts.push(now);
    this.attempts.set(identifier, recentAttempts);
    return true;
  }
}
```

### Sanitize Error Messages

Don't leak sensitive information:

```typescript
function sanitizeError(error: Error, context: { userId?: string }): string {
  // Remove sensitive data from error messages
  const sanitized = error.message
    .replace(/0x[a-fA-F0-9]{40}/g, '0x***')  // Ethereum addresses
    .replace(/[a-zA-Z0-9]{64}/g, '***')      // Potential private keys
    .replace(/Bearer [^\s]+/g, 'Bearer ***'); // Auth tokens

  // Log full error internally
  logger.error('Internal error details', {
    userId: context.userId,
    originalError: error.message,
    stack: error.stack,
  });

  return sanitized;
}
```

## Best Practices Summary

### ✅ Do

- **Classify errors** appropriately and handle each type differently
- **Use exponential backoff** with jitter for retryable errors
- **Provide rich context** in error messages and logs
- **Implement circuit breakers** for external service calls
- **Test error scenarios** thoroughly with unit and integration tests
- **Monitor error rates** and set up alerting
- **Document error responses** in your API specifications

### ❌ Don't

- **Retry user errors** like invalid payment data or insufficient balance
- **Use fixed delays** for retries (causes thundering herd)
- **Leak sensitive information** in error messages
- **Let individual failures** crash batch operations
- **Ignore context** when handling errors
- **Assume external services** are always available
- **Forget to clean up resources** when errors occur

## Conclusion

Robust error handling is critical for production x402 applications. By following these patterns and leveraging the comprehensive examples provided, you can build resilient applications that gracefully handle the complexity of distributed payments.

The key is to understand your error categories, apply appropriate retry strategies, provide meaningful feedback to users, and maintain excellent observability into your application's health.

For complete implementations, see the language-specific error handling examples:

- [TypeScript Error Handling Example](../../examples/typescript/clients/error-handling/)
- [Python Error Handling Example](../../examples/python/clients/error-handling/)
- [Go Error Recovery Example](../../examples/go/clients/advanced/error_recovery.go)

These examples provide production-ready code you can adapt for your specific use cases.
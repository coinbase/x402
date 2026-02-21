# TypeScript Error Handling Example

Comprehensive demonstration of production-ready error handling patterns for x402 TypeScript applications, leveraging TypeScript's type system for robust error management.

## Overview

This example shows how to build resilient x402 applications with:

- **Type-safe error classification** using discriminated unions
- **Exponential backoff retry logic** with configurable jitter
- **Batch operations** with error isolation and concurrency control
- **Configuration validation** using Zod schemas
- **Generic error handling** that works across HTTP clients
- **Structured error logging** with context and stack traces
- **Graceful shutdown** handling with cleanup

## Features Demonstrated

### 🔍 Type-Safe Error Classification

```typescript
export type X402ErrorType =
  | { kind: "network"; retryable: true; backoffMultiplier: 2 }
  | { kind: "payment_invalid"; retryable: false }
  | { kind: "payment_expired"; retryable: true; backoffMultiplier: 1.5 }
  | { kind: "verification_failed"; retryable: true; backoffMultiplier: 3 }
  | { kind: "settlement_failed"; retryable: true; backoffMultiplier: 2.5 }
  | { kind: "resource_error"; retryable: false }
  | { kind: "configuration_error"; retryable: false }
  | { kind: "timeout"; retryable: true; backoffMultiplier: 1.8 }
  | { kind: "unknown"; retryable: true; backoffMultiplier: 3 };
```

### 🚀 Smart Retry Logic

```typescript
// Automatically handles different error types with appropriate strategies
const result = await errorHandler.withRetry(url, async () => {
  return await fetchWithPayment(url);
});
```

### 🛡️ Batch Error Isolation

```typescript
const batchResult = await batchRequests(
  urls,
  async (url) => await makeSingleRequest(fetchWithPayment, url, errorHandler, timeout),
  concurrency,
  errorHandler
);

console.log(`Success rate: ${(batchResult.successRate * 100).toFixed(1)}%`);
```

### ✅ Configuration Validation

```typescript
const ConfigSchema = z.object({
  evmPrivateKey: z.string().startsWith("0x").optional(),
  svmPrivateKey: z.string().optional(),
  resourceServerUrl: z.string().url(),
  // ... with runtime validation
});

const config = loadConfig(); // Validates and provides type safety
```

## Error Handling Strategies

| Error Type | Retry Strategy | Backoff Multiplier | Use Case |
|------------|----------------|-------------------|----------|
| **Network Error** | ✅ Exponential backoff | 2.0x | Connectivity issues, DNS failures |
| **Payment Invalid** | ❌ No retry | - | Malformed payment data |
| **Payment Expired** | ✅ Fast retry | 1.5x | Payment window expired |
| **Verification Failed** | ✅ Aggressive backoff | 3.0x | Facilitator verification issues |
| **Settlement Failed** | ✅ Moderate backoff | 2.5x | Payment processing problems |
| **Resource Error** | ❌ No retry | - | Server 4xx/5xx errors |
| **Configuration** | ❌ No retry | - | Invalid setup |
| **Timeout** | ✅ Conservative retry | 1.8x | Request timeouts |
| **Unknown Error** | ✅ Cautious retry | 3.0x | Unclassified errors |

## Setup

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Configure environment** (copy from `.env.example`):
   ```bash
   # Required
   RESOURCE_SERVER_URL=https://your-server.com
   
   # At least one payment method required
   EVM_PRIVATE_KEY=0x1234567890abcdef...
   SVM_PRIVATE_KEY=base64_private_key_here
   
   # Optional configuration
   ENDPOINT_PATH=/api/data
   FACILITATOR_URL=https://facilitator.com
   REQUEST_TIMEOUT_MS=30000
   MAX_RETRIES=3
   CONCURRENCY=5
   ```

3. **Run the example:**
   ```bash
   pnpm dev
   ```

4. **Build for production:**
   ```bash
   pnpm build
   pnpm start
   ```

## Example Output

```
🚀 Starting TypeScript x402 error handling demonstration...
🔧 Setting up x402 client...
✅ EVM client registered: 0x742d35...
🎯 Target URL: https://api.example.com/api/data

📡 Making single request with error handling...
✅ Single request successful:
   Status: 200
   Payment made: Yes
   Body: {"data": "success", "timestamp": "2026-02-20T23:00:00Z"}

🧪 Demonstrating error scenarios and recovery...
🔄 Processing 4 items with concurrency limit of 5...
✅ Success: "https://api.example.com/api/data"
❌ Failed: "https://api.example.com/api/nonexistent" - resource_error
[2026-02-20T23:00:15.123Z] Error 1/3: network - DNS lookup failed (retrying in 1250ms)
[2026-02-20T23:00:17.456Z] Error 2/3: network - DNS lookup failed (retrying in 2847ms)
[2026-02-20T23:00:21.789Z] Error 3/3: network - DNS lookup failed (not retrying)
❌ Failed: "https://invalid-domain.com/api/data" - network

📈 Batch Results:
  - Success rate: 25.0%
  - Successful: 1
  - Failed: 3

📊 Error Summary (3 total errors):
  - resource_error: 1
  - network: 2

🔍 Recent errors:
  - [23:00:15] resource_error: Server error (status: 404): Not Found (not retried)
  - [23:00:17] network: DNS lookup failed (retried)
  - [23:00:21] network: DNS lookup failed (not retried)

🏁 Demonstration completed
```

## Advanced Patterns

### Custom Error Classification

```typescript
class CustomErrorHandler extends X402ErrorHandler {
  classifyError(error: unknown): X402ErrorType {
    // Add custom error classification logic
    if (error instanceof MyCustomError) {
      return { kind: "payment_expired", retryable: true, backoffMultiplier: 1.2 };
    }
    return super.classifyError(error);
  }
}
```

### Integration with Different HTTP Clients

```typescript
// Works with fetch (default)
const fetchWithPayment = wrapFetchWithPayment(fetch, client);

// Can be adapted for axios
import axios from 'axios';
const axiosWithPayment = wrapAxiosWithPayment(axios, client);

// Generic approach
async function makeRequest<T>(client: HttpClient, url: string): Promise<T> {
  return errorHandler.withRetry(url, () => client.get(url));
}
```

### Metrics and Observability

```typescript
// Error handler provides structured stats
const stats = errorHandler.getStats();
console.log(`Error rate: ${(stats.totalErrors / totalRequests * 100).toFixed(2)}%`);

// Send to monitoring system
await metricsClient.increment('x402.errors.total', stats.totalErrors, {
  error_types: Object.keys(stats.errorsByType)
});
```

### Circuit Breaker Pattern

```typescript
class CircuitBreakerErrorHandler extends X402ErrorHandler {
  private failureCount = 0;
  private lastFailureTime?: Date;
  private circuitOpen = false;

  async withRetry<T>(url: string, operation: () => Promise<T>): Promise<T> {
    if (this.circuitOpen && this.shouldStayOpen()) {
      throw new Error("Circuit breaker is open");
    }

    try {
      const result = await super.withRetry(url, operation);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.circuitOpen = false;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();
    if (this.failureCount >= 5) {
      this.circuitOpen = true;
    }
  }

  private shouldStayOpen(): boolean {
    if (!this.lastFailureTime) return false;
    const timeSinceFailure = Date.now() - this.lastFailureTime.getTime();
    return timeSinceFailure < 60000; // Stay open for 1 minute
  }
}
```

## Testing Patterns

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('X402ErrorHandler', () => {
  it('should retry network errors with exponential backoff', async () => {
    const errorHandler = new X402ErrorHandler({ 
      maxAttempts: 3, 
      initialDelayMs: 100,
      maxDelayMs: 1000,
      jitter: false 
    });

    let attempts = 0;
    const operation = vi.fn().mockImplementation(() => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Network connection failed');
      }
      return Promise.resolve('success');
    });

    const result = await errorHandler.withRetry('test-url', operation);
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('should not retry payment invalid errors', async () => {
    const errorHandler = new X402ErrorHandler({ maxAttempts: 3, initialDelayMs: 100, maxDelayMs: 1000, jitter: false });

    const operation = vi.fn().mockRejectedValue(new Error('Payment invalid'));

    await expect(errorHandler.withRetry('test-url', operation)).rejects.toThrow('Payment invalid');
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
```

## Integration Examples

### Express.js Middleware

```typescript
import express from 'express';

export function x402ErrorMiddleware(errorHandler: X402ErrorHandler) {
  return (err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    const errorType = errorHandler.classifyError(err);
    
    if (errorType.kind === 'payment_invalid') {
      res.status(400).json({ error: 'Invalid payment data' });
    } else if (errorType.kind === 'payment_expired') {
      res.status(402).json({ error: 'Payment expired, please retry' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
```

### Next.js API Routes

```typescript
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const errorHandler = new X402ErrorHandler({ /* config */ });
  
  try {
    const result = await errorHandler.withRetry('payment-processing', async () => {
      return await processX402Payment(req);
    });
    
    res.status(200).json(result);
  } catch (error) {
    const errorType = errorHandler.classifyError(error);
    res.status(errorType.retryable ? 502 : 400).json({ 
      error: error.message,
      retryable: errorType.retryable 
    });
  }
}
```

### React Hook

```typescript
import { useState, useCallback } from 'react';

export function useX402WithErrorHandling() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<X402ErrorType | null>(null);
  
  const errorHandler = new X402ErrorHandler({ /* config */ });
  
  const makePayment = useCallback(async (url: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await errorHandler.withRetry(url, async () => {
        return await fetchWithPayment(url);
      });
      return result;
    } catch (err) {
      const errorType = errorHandler.classifyError(err);
      setError(errorType);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  return { makePayment, isLoading, error };
}
```

## Best Practices

1. **Use TypeScript's type system** for error classification and configuration
2. **Fail fast for user errors** - don't retry invalid payments or bad configuration
3. **Apply jitter** to prevent thundering herd effects in distributed systems  
4. **Log with context** - include URL, attempt number, and error classification
5. **Handle graceful shutdown** - complete in-flight requests before terminating
6. **Monitor error patterns** - track error rates and types for system health
7. **Test error scenarios** - unit test retry logic and error classification
8. **Use circuit breakers** for high-volume applications to prevent cascade failures

## Related Documentation

- [x402 TypeScript SDK](../../../../typescript/README.md)
- [Python Error Handling Example](../../python/clients/error-handling/)
- [Go Error Recovery Example](../../go/clients/advanced/error_recovery.go)
- [x402 Protocol Documentation](https://x402.org)

This example provides a solid foundation for building resilient x402 TypeScript applications that handle errors gracefully while maintaining excellent developer experience through strong typing.
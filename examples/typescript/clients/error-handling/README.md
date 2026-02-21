# x402 Error Handling Example

This example demonstrates comprehensive error handling patterns when working with x402 payments. Understanding and properly handling different error scenarios is crucial for building robust x402-enabled applications.

## What You'll Learn

- **Error Classification** — How to identify different types of x402 and HTTP errors
- **Payment-Specific Errors** — Handling insufficient funds, wallet issues, and payment validation failures
- **Network Resilience** — Implementing retry logic with exponential backoff
- **User Experience** — Providing meaningful error messages and recovery suggestions
- **Observability** — Using lifecycle hooks for error monitoring and debugging

## Error Types Covered

### 1. Network Errors
- Server unreachable
- DNS resolution failures
- Connection timeouts

### 2. HTTP Status Errors
- `400 Bad Request` — Invalid request format
- `401 Unauthorized` — Authentication required
- `402 Payment Required` — x402 payment needed
- `403 Forbidden` — Access denied
- `404 Not Found` — Resource doesn't exist
- `429 Too Many Requests` — Rate limiting
- `500 Internal Server Error` — Server problems
- `502 Bad Gateway` — Upstream server error
- `503 Service Unavailable` — Server temporarily down

### 3. Payment-Specific Errors
- Invalid payment requirements from server
- Insufficient funds in wallet
- Wallet connection failures
- Payment validation errors
- Signature verification failures

### 4. Client-Side Errors
- Request timeouts
- Malformed payment headers
- Network interruptions

## Key Patterns Demonstrated

### Error Classification
```typescript
function classifyError(error: any): string {
  // Network/Connection errors
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return "Network Error - Server unreachable";
  }
  
  // x402-specific errors
  if (error.name?.includes('Payment')) {
    return `Payment Error - ${error.message}`;
  }
  
  // HTTP status-based errors
  if (error.status === 402) {
    return "Payment Required - x402 payment needed";
  }
}
```

### Retry Logic with Exponential Backoff
```typescript
async function retryWithBackoff(url: string, maxRetries: number = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await client.fetch(url);
    } catch (error) {
      // Don't retry permanent failures (4xx errors)
      if (error.status && [400, 401, 403, 404].includes(error.status)) {
        throw error;
      }
      
      // Exponential backoff for transient failures
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
}
```

### Lifecycle Hook Error Handling
```typescript
const client = x402.create({
  onPaymentFailed: (error, requirements) => {
    console.error("Payment failed:", error.message);
    // Log to monitoring service
    // Show user-friendly error message
    // Suggest recovery actions
  },
  
  onError: (error) => {
    console.error("x402 Client Error:", error.message);
    // Global error handling
  }
});
```

## Running the Example

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Run the example:**
   ```bash
   pnpm dev
   ```

3. **Watch the output** to see different error scenarios and how they're handled.

## Best Practices

### ✅ DO

- **Classify errors appropriately** — Different errors need different handling
- **Use lifecycle hooks** — For observability and centralized error handling  
- **Implement retry logic** — For transient network failures
- **Provide helpful messages** — Give users actionable error information
- **Log errors properly** — Include context for debugging
- **Handle payment errors gracefully** — Don't retry payment-specific failures
- **Set appropriate timeouts** — Prevent hanging requests
- **Use exponential backoff** — Avoid overwhelming servers during retries

### ❌ DON'T

- **Retry payment errors** — These are usually permanent failures
- **Ignore error context** — Status codes and error names matter
- **Use generic error messages** — Be specific about what went wrong
- **Retry indefinitely** — Set maximum retry limits
- **Log sensitive data** — Avoid logging payment details or private keys
- **Block the UI** — Handle errors asynchronously when possible

## Error Monitoring

For production applications, consider integrating with error monitoring services:

```typescript
const client = x402.create({
  onError: (error) => {
    // Log to your monitoring service
    errorMonitoring.captureException(error, {
      tags: {
        component: 'x402-client',
        error_type: classifyError(error)
      }
    });
  }
});
```

## User Experience Considerations

When displaying errors to users:

1. **Be specific but not technical** — "Payment failed due to insufficient funds" vs "InsufficientFundsError"
2. **Suggest recovery actions** — "Please top up your wallet" or "Try again in a few minutes"
3. **Provide support options** — Contact information or help documentation
4. **Show progress indicators** — For retry attempts or payment processing
5. **Handle errors gracefully** — Don't crash the application

## Production Checklist

- [ ] Implement proper error classification
- [ ] Add retry logic for transient failures
- [ ] Set up error monitoring and alerting
- [ ] Create user-friendly error messages
- [ ] Test all error scenarios
- [ ] Add circuit breaker pattern for repeated failures
- [ ] Configure appropriate timeouts
- [ ] Log errors with sufficient context
- [ ] Handle payment errors without retrying
- [ ] Provide recovery guidance to users

## Related Examples

- [`custom/`](../custom/) — Manual error handling without interceptors
- [`advanced/`](../advanced/) — Advanced patterns and lifecycle hooks
- [Server examples](../../servers/) — Setting up test servers with different error conditions

## Further Reading

- [x402 Error Handling Best Practices](../../../../docs/error-handling.md)
- [HTTP Status Codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
- [Exponential Backoff](https://en.wikipedia.org/wiki/Exponential_backoff)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
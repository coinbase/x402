# Error Handling Client Example

This example demonstrates comprehensive error handling when making requests to x402-protected endpoints.

## What You'll Learn

- How to handle different types of x402 payment errors
- Implementing retry logic for transient failures
- Distinguishing between client and server errors
- Graceful degradation strategies
- Custom error types and error recovery patterns

## Files

| File | Description |
| --- | --- |
| [`basic-error-handling.ts`](./basic-error-handling.ts) | Basic error handling patterns with try/catch |
| [`advanced-error-handling.ts`](./advanced-error-handling.ts) | Advanced patterns: custom errors, retry logic, circuit breaker |
| [`error-types.ts`](./error-types.ts) | Custom error types for different x402 scenarios |
| [`retry-with-backoff.ts`](./retry-with-backoff.ts) | Exponential backoff retry implementation |
| [`error-monitoring.ts`](./error-monitoring.ts) | Error logging and monitoring integration |

## Error Scenarios Covered

1. **Network Errors** — Connection failures, timeouts
2. **Payment Errors** — Insufficient funds, invalid payment scheme
3. **Server Errors** — 5xx responses, resource unavailable
4. **Authentication Errors** — Invalid keys, malformed signatures
5. **Rate Limiting** — 429 responses, quota exceeded
6. **Malformed Responses** — Invalid payment requirements, corrupted data

## Running Examples

Set up your environment:

```bash
# Copy .env.example to .env and fill in your values
cp .env.example .env
```

Required environment variables:
- `EVM_PRIVATE_KEY` — Your EVM wallet private key
- `SVM_PRIVATE_KEY` — Your Solana wallet private key  
- `RESOURCE_SERVER_URL` — x402 server to test against (default: http://localhost:4021)

Run specific examples:

```bash
# Basic error handling
npx tsx basic-error-handling.ts

# Advanced patterns with retry logic
npx tsx advanced-error-handling.ts

# Monitoring and logging integration
npx tsx error-monitoring.ts
```

## Best Practices

1. **Always handle payment errors gracefully** — Don't crash on insufficient funds
2. **Implement exponential backoff** — For transient network errors
3. **Log payment attempts** — For debugging and analytics
4. **Validate payment requirements** — Before attempting payment
5. **Use circuit breaker pattern** — To avoid cascading failures
6. **Provide fallback options** — When payment fails
7. **Monitor error rates** — Set up alerts for high error rates

## Production Considerations

- Set appropriate timeouts for payment operations
- Implement comprehensive logging for audit trails
- Use structured error responses for better debugging
- Consider rate limiting your own requests to avoid 429s
- Cache successful payment schemes to reduce latency
- Monitor payment success rates and costs
# x402 Client Error Handling Examples

This example demonstrates comprehensive error handling patterns for x402 clients, covering common failure scenarios and production-ready resilience patterns.

## What You'll Learn

- Basic x402 error handling with try/catch
- Advanced retry logic with exponential backoff  
- Circuit breaker pattern for failure protection
- Error categorization and monitoring
- Production-ready resilience patterns

## Quick Start

```bash
npm install
npm run start
```

## Error Handling Patterns

### 1. Basic Error Handling

```typescript
try {
  const response = await client.fetch(url);
  const data = await response.json();
} catch (error) {
  if (error instanceof Error) {
    if (error.message.includes("payment required")) {
      // Handle payment failure
    } else if (error.message.includes("insufficient funds")) {
      // Handle insufficient funds
    }
  }
}
```

### 2. Resilient Client with Retry Logic

```typescript
const resilientClient = new ResilientX402Client(facilitatorUrl, {
  maxRetries: 3,
  retryDelay: 1000,
  circuitBreakerThreshold: 5
});

const response = await resilientClient.fetch(url);
```

### 3. Error Tracking and Monitoring

```typescript
const errorTracker = new X402ErrorTracker();

try {
  await client.fetch(url);
} catch (error) {
  errorTracker.trackError(error, url);
}

const report = errorTracker.getErrorReport();
```

## Common Error Types

### Payment Errors

| Error | Cause | Retry? | Action |
|-------|-------|--------|--------|
| `payment required` | No payment provided | ❌ | Implement x402 client |
| `insufficient funds` | Wallet balance too low | ❌ | Fund wallet or reduce request frequency |
| `unsupported scheme` | Wrong payment method | ❌ | Check supported schemes |

### Network Errors

| Error | Cause | Retry? | Action |
|-------|-------|--------|--------|
| `timeout` | Slow network/server | ✅ | Retry with backoff |
| `network error` | Connectivity issues | ✅ | Retry with backoff |
| `500 server error` | Server problems | ✅ | Retry with backoff |

### Client Errors

| Error | Cause | Retry? | Action |
|-------|-------|--------|--------|
| `unauthorized` | Invalid credentials | ❌ | Check API keys |
| `forbidden` | Access denied | ❌ | Check permissions |
| `bad request` | Malformed request | ❌ | Fix request format |

## Production Best Practices

### 1. Exponential Backoff

```typescript
const delay = baseDelay * Math.pow(2, attempt);
await new Promise(resolve => setTimeout(resolve, delay));
```

### 2. Circuit Breaker Pattern

```typescript
if (failureCount >= threshold && timeSinceLastFailure < timeout) {
  throw new Error("Circuit breaker is open");
}
```

### 3. Error Categorization

```typescript
private categorizeError(error: Error): string {
  const message = error.message.toLowerCase();
  
  if (message.includes("payment required")) {
    return "PAYMENT_REQUIRED";
  }
  // ... more categories
}
```

### 4. Monitoring and Alerting

```typescript
const report = errorTracker.getErrorReport();
if (report.errorCounts.PAYMENT_REQUIRED > 10) {
  // Alert on high payment failures
}
```

## Classes

### `ResilientX402Client`

A production-ready x402 client with:
- Automatic retry with exponential backoff
- Circuit breaker protection
- Error categorization
- Configurable retry policies

### `X402ErrorTracker`

Error monitoring and analytics:
- Real-time error categorization
- Historical error tracking
- Error rate monitoring
- Detailed error reports

## Configuration Options

### ResilientX402Client Options

```typescript
interface ClientOptions {
  maxRetries?: number;              // Default: 3
  retryDelay?: number;              // Default: 1000ms
  circuitBreakerThreshold?: number; // Default: 5
}
```

### Error Categories

- `PAYMENT_REQUIRED` - x402 payment needed
- `INSUFFICIENT_FUNDS` - Wallet balance too low
- `TIMEOUT` - Request timeout
- `NETWORK_ERROR` - Network connectivity issues
- `AUTH_ERROR` - Authentication/authorization failed
- `SERVER_ERROR` - Server-side errors (5xx)
- `UNKNOWN_ERROR` - Unclassified errors

## Real-World Usage

### E-commerce Integration

```typescript
const client = new ResilientX402Client(facilitatorUrl, {
  maxRetries: 3,
  circuitBreakerThreshold: 10 // Higher threshold for production
});

try {
  const productData = await client.fetch('/api/product-details');
  // Handle success
} catch (error) {
  // Graceful degradation - show cached data or basic info
}
```

### Analytics Dashboard

```typescript
const errorTracker = new X402ErrorTracker();

setInterval(() => {
  const report = errorTracker.getErrorReport();
  
  // Send metrics to monitoring system
  metrics.gauge('x402.errors.total', report.totalErrors);
  
  Object.entries(report.errorCounts).forEach(([type, count]) => {
    metrics.gauge(`x402.errors.${type.toLowerCase()}`, count);
  });
}, 60000); // Every minute
```

## Testing Error Scenarios

Run individual error scenarios:

```bash
# Test basic error handling
npm run start

# Test with different endpoints
API_ENDPOINT=https://httpbin.org/status/500 npm run start
```

## Further Reading

- [x402 Core Documentation](../../README.md)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Exponential Backoff](https://cloud.google.com/storage/docs/retry-strategy)
- [Error Monitoring Best Practices](https://sre.google/sre-book/monitoring-distributed-systems/)

## Contributing

Found a missing error scenario? Please contribute additional examples!
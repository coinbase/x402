# Advanced Go Client Examples

This directory contains advanced, production-ready patterns for x402 Go clients. These examples go beyond the basics to demonstrate sophisticated techniques for building robust, scalable payment-enabled applications.

## What This Shows

Advanced patterns for production environments:
- **Custom HTTP Transports**: Retry logic, circuit breakers, timeouts
- **Error Recovery**: Sophisticated error handling and recovery strategies
- **Multi-Network Priority**: Network-specific configuration with fallbacks
- **Request Middleware**: Custom interceptors for logging, headers, validation

## Examples

### 1. Custom Transport (`custom-transport`)

**Production Pattern**: Build resilient clients with retry logic and circuit breakers

```bash
go run . custom-transport
```

**Demonstrates:**
- Exponential backoff retry logic
- Request timing and instrumentation
- Custom transport stacking
- Connection pooling configuration

**Use When:**
- Building production services
- Need automatic retry on transient failures
- Want detailed request metrics
- Require custom timeout strategies

### 2. Error Recovery (`error-recovery`)

**Production Pattern**: Implement comprehensive error handling with automatic recovery

```bash
go run . error-recovery
```

**Demonstrates:**
- Error classification and categorization
- Automatic recovery from payment failures
- Fallback payment methods
- Detailed error logging and metrics

**Use When:**
- Need robust error handling
- Want automatic recovery from failures
- Require detailed error diagnostics
- Building fault-tolerant systems

### 3. Multi-Network Priority (`multi-network-priority`)

**Production Pattern**: Configure network-specific signers with priority fallback

```bash
go run . multi-network-priority
```

**Demonstrates:**
- Network-specific signer registration
- Wildcard fallback configuration
- Registration precedence rules
- Fine-grained network control

**Use When:**
- Managing multiple networks
- Need different signers per network
- Want mainnet/testnet separation
- Building multi-chain applications

### 4. Request Middleware (`request-middleware`)

**Production Pattern**: Add custom processing layers to HTTP requests

```bash
go run . request-middleware
```

**Demonstrates:**
- Request/response logging
- Custom header injection
- Response validation
- Middleware stacking patterns

**Use When:**
- Need request/response logging
- Want to add authentication headers
- Require response validation
- Building observable systems

## Prerequisites

- Go 1.21 or higher
- An Ethereum private key (testnet recommended)
- A running x402 server (see [server examples](../../servers/))
- Understanding of [basic HTTP client](../http/)

## Setup

1. **Install dependencies:**

```bash
go mod download
```

2. **Configure environment variables:**

Create a `.env` file:

```bash
# Required
EVM_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Optional
SERVER_URL=http://localhost:4021
```

## Running Examples

```bash
# Run specific advanced example
go run . custom-transport
go run . error-recovery
go run . multi-network-priority
go run . request-middleware
```

## Architecture Patterns

### Custom Transport Stack

Build layered transport architecture:

```go
baseTransport := &http.Transport{
    MaxIdleConns: 100,
    IdleConnTimeout: 90 * time.Second,
}

// Layer stack (innermost to outermost)
retryTransport := &RetryTransport{Transport: baseTransport}
timingTransport := &TimingTransport{Transport: retryTransport}
paymentTransport := &PaymentRoundTripper{Transport: timingTransport}

client := &http.Client{Transport: paymentTransport}
```

### Error Recovery Strategy

Implement intelligent error handling:

```go
client.OnPaymentCreationFailure(func(ctx PaymentCreationFailureContext) (*PaymentCreationFailureResult, error) {
    // Classify error
    errorType := classifyError(ctx.Error)
    
    switch errorType {
    case "network":
        return nil, nil // Retry
    case "insufficient_balance":
        return nil, ctx.Error // Fail
    case "signing_error":
        // Attempt recovery with alternative method
        return &PaymentCreationFailureResult{
            Recovered: true,
            Payload: alternativePayload,
        }, nil
    }
})
```

### Concurrent Request Pattern

Safe parallel execution:

```go
var wg sync.WaitGroup
results := make([]Result, len(urls))

for i, url := range urls {
    wg.Add(1)
    go func(index int, u string) {
        defer wg.Done()
        resp, err := client.Get(u)
        results[index] = processResponse(resp, err)
    }(i, url)
}

wg.Wait()
// All requests completed, process results
```

### Network Priority Configuration

Register networks with precedence:

```go
client := x402.Newx402Client().
    // Specific networks (highest priority)
    Register("eip155:1", evm.NewExactEvmScheme(mainnetSigner)).
    Register("eip155:8453", evm.NewExactEvmScheme(baseSigner)).
    // Wildcard fallback (lowest priority)
    Register("eip155:*", evm.NewExactEvmScheme(defaultSigner))
```

## Production Considerations

### Retry Configuration

```go
retryTransport := &RetryTransport{
    MaxRetries: 3,
    RetryDelay: 100 * time.Millisecond,  // Base delay
    // Implements exponential backoff: 100ms, 200ms, 400ms
}
```

### Connection Pooling

```go
transport := &http.Transport{
    MaxIdleConns:        100,              // Total idle connections
    MaxIdleConnsPerHost: 10,               // Per host
    IdleConnTimeout:     90 * time.Second, // Connection reuse timeout
    DisableCompression:  false,            // Enable compression
}
```

### Timeout Strategy

```go
client := &http.Client{
    Timeout: 30 * time.Second,  // Total request timeout
    Transport: transport,
}

// Per-request context timeout
ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
defer cancel()
req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
```

### Error Classification

Implement smart error categorization:

- **Network errors**: Retry automatically
- **Balance errors**: Fail fast, notify user
- **Signing errors**: Attempt recovery
- **Validation errors**: Log and fail
- **Unknown errors**: Safe default behavior

## Performance Optimization

### Memory Management

- Use connection pooling to reduce allocation overhead
- Close response bodies promptly to free connections
- Reuse HTTP clients across requests

## Testing Against Local Server

1. Start server:
```bash
cd ../../servers/gin
go run main.go
```

2. Run advanced examples:
```bash
cd ../../clients/advanced
go run . custom-transport
```

## Comparison: Basic vs Advanced

| Feature | Basic Client | Advanced Client |
|---------|-------------|-----------------|
| Retry Logic | ❌ | ✅ Exponential backoff |
| Error Recovery | Basic | ✅ Intelligent classification |
| Concurrency | Manual | ✅ Safe patterns provided |
| Network Priority | Simple | ✅ Fine-grained control |
| Middleware | None | ✅ Composable layers |
| Observability | Minimal | ✅ Comprehensive logging |
| Production Ready | Basic | ✅ Battle-tested patterns |

## Next Steps

- **[Basic HTTP Client](../http/)**: Start here if you haven't already
- **[Custom Client](../custom/)**: Learn the internals
- **[Server Examples](../../servers/)**: Build complementary servers

## Related Resources

- [x402 HTTP Package](../../../../go/http/)
- [Production Deployment Guide](../../../../docs/production.md)
- [Performance Tuning](../../../../docs/performance.md)


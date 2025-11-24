# Custom Middleware Example

This example demonstrates how to implement x402 payment handling **without** using the pre-built middleware. It shows you how to integrate x402 directly with the core package, giving you complete control over the payment flow.

## What This Example Shows

- **Custom HTTP Adapter**: How to implement the `HTTPAdapter` interface for your web framework
- **Direct Core Package Usage**: Using `x402http.HTTPServer` and related types directly
- **Payment Processing Flow**: The complete flow from request → verification → handler → settlement
- **Response Capture**: How to capture responses for settlement processing
- **Error Handling**: Custom error handling for payment failures

## Why Use Custom Middleware?

You should implement custom middleware when you need to:

1. **Integrate with unsupported frameworks**: x402 provides adapters for common frameworks (Gin, Echo, etc.), but you can support any framework
2. **Customize payment flow**: Add custom logging, metrics, or business logic at each step
3. **Fine-grained control**: Control exactly how payments are verified and settled
4. **Learn the internals**: Understand how x402 middleware works under the hood

## Architecture

The custom middleware demonstrates these key components:

### Key Components

1. **HTTP Adapter**: Translates Gin-specific HTTP operations to the x402 HTTP interface
2. **Response Capture**: Captures the response before sending to client for settlement processing
3. **Middleware Logic**: Processes payment verification and settlement

See `main.go` for complete implementations of all components.

## Payment Flow

1. **Request Arrives**: Middleware intercepts the request
2. **Adapter Creation**: Framework-specific adapter translates request to x402 interface
3. **Payment Check**: `ProcessHTTPRequest()` checks if payment is required and valid
4. **Decision Point**:
   - **No Payment Required**: Pass through to handler
   - **Payment Error**: Return 402 Payment Required with payment details
   - **Payment Verified**: Continue to handler with response capture
5. **Handler Execution**: Your protected endpoint runs
6. **Settlement**: If handler succeeds (2xx status), settle the payment on-chain
7. **Response**: Send response to client with settlement headers

## Prerequisites

- Go 1.21 or higher
- An Ethereum address to receive payments (testnet recommended)
- Access to an x402 facilitator

## Setup

1. **Install dependencies:**

```bash
go mod download
```

2. **Configure environment variables:**

Create a `.env` file:

```bash
EVM_PAYEE_ADDRESS=0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
FACILITATOR_URL=https://facilitator.x402.org
```

## Running the Example

```bash
go run main.go
```

## Testing the Endpoints

### Debug Requirements (Public)

See the payment requirements structure:

```bash
curl http://localhost:4021/debug/requirements
```

### Weather Endpoint (Payment Required)

Without payment:

```bash
curl http://localhost:4021/weather
```

You'll receive a 402 Payment Required response with payment details in headers.

With payment (requires x402 client):

See the [client examples](../../clients/) for how to make paid requests.

## Key Differences from Pre-built Middleware

| Aspect | Pre-built Middleware | Custom Implementation |
|--------|---------------------|----------------------|
| Code Complexity | Single line: `r.Use(ginmw.X402Payment(config))` | ~300 lines of custom code |
| Flexibility | Limited to provided options | Complete control |
| Framework Support | Gin, Echo, net/http | Any framework |
| Customization | Callbacks and options | Direct code modification |
| Maintenance | Maintained by x402 team | You maintain |

## Customization Examples

With custom middleware, you can add:
- **Custom Logging**: Log at each payment processing step
- **Custom Metrics**: Track verification/settlement timing and success rates
- **Custom Validation**: Add business logic before processing payments
- **Custom Error Handling**: Implement retry logic or alternative flows

See `main.go` for the complete implementation that can be modified for your needs.

## Adapting to Other Frameworks

To use this with other frameworks (Echo, chi, net/http, etc.):

1. Implement the `x402http.HTTPAdapter` interface for your framework
2. Create a middleware function that uses `server.ProcessHTTPRequest()`
3. Handle the three result types: `NoPaymentRequired`, `PaymentError`, `PaymentVerified`

The pattern in `main.go` can be adapted to any Go web framework.

## Next Steps

- **[Basic Gin Example](../gin/)**: See the simple way using pre-built middleware
- **[Advanced Examples](../advanced/)**: Explore dynamic pricing, hooks, and extensions
- **[Client Examples](../../clients/)**: Build clients to test this server

## Related Resources

- [x402 Go Package Documentation](../../../../go/)
- [Gin Framework Documentation](https://gin-gonic.com/docs/)


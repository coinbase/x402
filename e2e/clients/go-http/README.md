# x402 Go HTTP Client

This is an example Go client that demonstrates how to use the x402 Go SDK's HTTP client to make requests to endpoints protected by the x402 payment protocol.

## Prerequisites

- Go 1.21+
- A running x402 server (you can use the example express server)
- A valid Ethereum private key for making payments

## Features

- Supports both x402 v1 and v2 protocols
- Automatic payment handling for 402 responses
- EVM support with EIP-3009 TransferWithAuthorization
- Compatible with both v1 (legacy) and v2 payment requirements

## Setup

1. Install dependencies:
```bash
go mod tidy
```

2. Set environment variables:
```bash
export EVM_PRIVATE_KEY="your_private_key_here"
export RESOURCE_SERVER_URL="http://localhost:4021"
export ENDPOINT_PATH="/protected"
```

3. Run the client:
```bash
go run main.go
```

## How It Works

The client:
1. Creates an x402 HTTP client with EVM support
2. Registers both v1 and v2 EVM implementations for backward compatibility
3. Wraps the standard Go HTTP client with payment handling
4. Makes a request to the protected endpoint
5. Automatically handles 402 Payment Required responses
6. Creates and submits the appropriate payment
7. Retries the request with the payment signature
8. Outputs the result as JSON for the e2e test framework

## Example Output

Success:
```json
{
  "success": true,
  "data": {
    "message": "Protected endpoint accessed successfully",
    "timestamp": "2024-01-01T00:00:00Z"
  },
  "status_code": 200,
  "payment_response": {
    "success": true,
    "transaction": "0x...",
    "network": "eip155:84532",
    "payer": "0x..."
  }
}
```

Error:
```json
{
  "success": false,
  "error": "Request failed: payment retry limit exceeded"
}
```

## Implementation Details

### EVM Signer

The client uses a real EVM signer that:
- Derives the address from the private key
- Implements proper EIP-712 (typed data) signing
- Uses go-ethereum's apitypes for structured data signing
- Generates valid Ethereum signatures with recovery ID

### Payment Handling

The HTTP client wrapper:
- Intercepts 402 responses
- Extracts payment requirements from headers (v2) or body (v1)
- Creates appropriate payment payloads
- Retries requests with payment signatures
- Prevents infinite retry loops

### Version Support

The client registers handlers for both:
- **v2 (default)**: Modern x402 protocol with header-based communication
- **v1 (legacy)**: Backward compatibility with body-based requirements

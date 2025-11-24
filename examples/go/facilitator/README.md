# x402 Facilitator Example

This example demonstrates how to build a simple x402 facilitator that verifies and settles payments on behalf of clients.

## What is a Facilitator?

A **facilitator** is a service that acts as a payment processor in the x402 protocol:

1. **Verifies** payment signatures from clients
2. **Settles** payments by submitting transactions to the blockchain
3. **Returns** confirmation to clients

Facilitators allow clients to create payments without needing to interact with the blockchain directly, making it easier to build payment-enabled applications.

## What This Example Shows

- **Basic Facilitator Setup**: Creating and configuring a facilitator
- **Payment Verification**: Verifying client payment signatures with idiomatic error handling
- **On-chain Settlement**: Submitting transactions to the blockchain (EVM + SVM)
- **Facilitator Signer Implementation**: See `signer.go` for EVM and SVM signer examples
- **Lifecycle Hooks**: Logging verification and settlement operations
- **HTTP Endpoints**: Exposing /verify, /settle, and /supported APIs

## Files in This Example

- **`main.go`** - Main facilitator server with hooks and endpoints
- **`signer.go`** - Facilitator signer implementations for EVM and SVM
- **`README.md`** - This file

## Architecture

```
Client → Resource Server → Facilitator → Blockchain
   │           │                │            │
   │           │                │            │
   │    1. Request resource     │            │
   │    2. Return 402 Payment Required       │
   │                            │            │
   │    3. Create payment       │            │
   │    4. Request w/ payment   │            │
   │           │                │            │
   │           │    5. Verify   →            │
   │           │    ← Valid     │            │
   │           │                │            │
   │    6. Return resource      │            │
   │           │                │            │
   │           │    7. Settle   →    8. Submit tx →
   │           │    ← Success   ←    ← Confirmed
```

## Signer Implementation

The `signer.go` file contains reference implementations for EVM and SVM facilitator signers that handle:
- EIP-712 signature verification
- Transaction submission and confirmation
- Balance checking
- RPC client management

For production deployments with additional features (Bazaar discovery, multiple networks), see `e2e/facilitators/go/main.go`.

## Prerequisites

- Go 1.21 or higher
- Understanding of x402 protocol
- Familiarity with blockchain RPC interaction

## Setup

1. **Install dependencies:**

```bash
go mod download
```

2. **Configure environment variables:**

Create a `.env` file:

```bash
EVM_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
SVM_PRIVATE_KEY=your_base58_private_key_here
```

**⚠️ Security Note:** The facilitator private key needs ETH for gas fees to submit transactions. Use a dedicated testnet account with limited funds.

## Running

```bash
go run .
```

## Error Handling

The facilitator SDK uses **idiomatic Go error handling** with custom error types:

**Success Pattern:**
```go
result, err := facilitator.Verify(ctx, payload, requirements)
if err != nil {
    return err  // Any failure (business logic or system)
}
// result.IsValid is guaranteed to be true
```

**Structured Error Information:**
```go
result, err := facilitator.Verify(ctx, payload, requirements)
if err != nil {
    // Extract structured error details if needed
    if ve, ok := err.(*x402.VerifyError); ok {
        log.Printf("Verification failed: reason=%s, payer=%s, network=%s",
                   ve.Reason, ve.Payer, ve.Network)
    }
    return err
}
```

**Error Types:**
- `*VerifyError` - Verification failures with `Reason`, `Payer`, `Network`, `Err`
- `*SettleError` - Settlement failures with `Reason`, `Payer`, `Network`, `Transaction`, `Err`

This replaces the old pattern of checking both `err != nil` and `response.IsValid == false`.

## API Endpoints

### GET /supported

Returns supported networks and schemes.

**Response:**
```json
{
  "kinds": [
    {
      "x402Version": 2,
      "scheme": "exact",
      "network": "eip155:84532"
    }
  ]
}
```

### POST /verify

Verifies a payment signature.

**Request:**
```json
{
  "paymentPayload": {...},
  "paymentRequirements": {...}
}
```

**Response:**
```json
{
  "isValid": true,
  "invalidReason": ""
}
```

### POST /settle

Settles a payment on-chain.

**Request:**
```json
{
  "paymentPayload": {...},
  "paymentRequirements": {...}
}
```

**Response:**
```json
{
  "success": true,
  "transaction": "0x1234...",
  "network": "eip155:84532",
  "payer": "0xabcd..."
}
```

## Lifecycle Hooks

The example registers hooks for logging verification and settlement events. See `main.go` for the complete implementation.

## Testing the Facilitator

### 1. Start the Facilitator

```bash
go run .
```

### 2. Test with Client and Server

Start a resource server (in another terminal):

```bash
cd ../servers/gin
go run main.go
```

Start a client (in another terminal):

```bash
cd ../clients/http
go run . builder-pattern
```



## Next Steps

- **[E2E Facilitator](../../../e2e/facilitators/go/)**: Complete working implementation
- **[Server Examples](../servers/)**: Build servers that use facilitators
- **[Client Examples](../clients/)**: Build clients that connect to facilitators

## Related Resources

- [x402 Facilitator Package](../../../go/)
- [EVM Scheme Documentation](../../../go/mechanisms/evm/)
- [Facilitator Signer Proposal](../../../PROPOSAL_SIGNER_HELPERS.md)


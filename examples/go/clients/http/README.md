# Go HTTP Client Example

This example demonstrates how to use the x402 Go HTTP client to make requests to endpoints protected by the x402 payment protocol.

## What This Example Shows

- **HTTP Client Wrapping**: How to wrap `http.Client` with x402 payment handling
- **Automatic Payment**: Transparent payment creation and retry on 402 responses
- **Multiple Patterns**: Different ways to configure the client
- **Signer Creation**: Using the signer helpers for easy key management
- **Payment Extraction**: Reading settlement details from response headers

## Available Examples

This package contains multiple examples demonstrating different configuration patterns:

### 1. Builder Pattern (`builder-pattern`)

Demonstrates the basic way to configure the client by chaining `Register()` calls to map network patterns to scheme clients.

**Use when:** You need fine-grained control over which networks use which signers.

```go
client := x402.Newx402Client().
    Register("eip155:*", evm.NewExactEvmScheme(evmSigner)).
    Register("solana:*", svm.NewExactSvmScheme(svmSigner))
```

### 2. Hooks (`hooks`)

Demonstrates how to register hooks for payment creation lifecycle events to add custom logic at different stages.

**Use when:** You need to log, validate, or add custom behavior during payment creation.

```go
client.OnBeforePaymentCreation(func(ctx PaymentCreationContext) (*BeforePaymentCreationResult, error) {
    // Custom logic before payment
    return nil, nil
})
```

### 3. Helper Registration (`helper-registration`)

Shows a convenient pattern using wildcard network registration for clean, simple client configuration.

**Use when:** You want to register all networks of a type with the same signer.

```go
client := x402.Newx402Client().
    Register("eip155:*", evm.NewExactEvmScheme(evmSigner))
```

## Prerequisites

- Go 1.21 or higher
- An Ethereum private key (testnet recommended for testing)
- A Solana private key (optional, for SVM examples)
- A running x402 server (see [server examples](../../servers/))

## Setup

1. **Install dependencies:**

```bash
go mod download
```

2. **Configure environment variables:**

Create a `.env` file in this directory:

```bash
# Required: Your Ethereum private key
EVM_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Optional: Your Solana private key (needed for full multi-chain examples)
SVM_PRIVATE_KEY=5J7W...

# Optional: Server URL (defaults to http://localhost:4021)
SERVER_URL=http://localhost:4021
```

**⚠️ Security Warning:** Never use mainnet keys in `.env` files! Use testnet keys only.

## Running the Examples

```bash
# Run the default example (builder-pattern)
go run .

# Or run a specific example:
go run . builder-pattern
go run . hooks
go run . helper-registration
```

## Example Output

```
Running example: builder-pattern

Making request to: http://localhost:4021/weather

✅ Response body:
  {
    "city": "San Francisco",
    "weather": "foggy",
    "temperature": 60,
    "timestamp": "2024-01-01T00:00:00Z"
  }

💰 Payment Details:
  Transaction: 0x1234567890abcdef...
  Network: eip155:84532
  Payer: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

## How It Works

The x402 HTTP client provides transparent payment handling:

1. **Initial Request**: Client makes a normal HTTP request
2. **402 Detection**: If server responds with 402 Payment Required
3. **Payment Creation**: Client automatically creates a payment payload
4. **Retry with Payment**: Request is retried with payment headers
5. **Success**: Server processes payment and returns protected resource
6. **Settlement Headers**: Response includes payment settlement details

### Code Flow

```go
// 1. Create x402 client with registered schemes
client := x402.Newx402Client().
    Register("eip155:*", evm.NewExactEvmScheme(evmSigner))

// 2. Wrap HTTP client
httpClient := x402http.WrapHTTPClientWithPayment(http.DefaultClient, x402http.Newx402HTTPClient(client))

// 3. Make request (payment is handled automatically)
resp, err := httpClient.Get("http://localhost:4021/weather")

// 4. Read response normally
body, _ := io.ReadAll(resp.Body)
```

## Network Registration Patterns

### Wildcard Registration

Register all networks of a type:

```go
// All EVM networks
client.Register("eip155:*", evm.NewExactEvmScheme(evmSigner))

// All Solana networks
client.Register("solana:*", svm.NewExactSvmScheme(svmSigner))
```

### Specific Network Registration

Register specific networks with different signers:

```go
// Ethereum Mainnet with specific signer
client.Register("eip155:1", evm.NewExactEvmScheme(mainnetSigner))

// Base Sepolia with different signer
client.Register("eip155:84532", evm.NewExactEvmScheme(testnetSigner))

// Solana Mainnet
client.Register("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", svm.NewExactSvmScheme(solanaMainnetSigner))
```

### Registration Precedence

More specific registrations take precedence over wildcards:

```go
client.
    Register("eip155:*", evm.NewExactEvmScheme(defaultSigner)).    // Fallback for all EVM
    Register("eip155:1", evm.NewExactEvmScheme(mainnetSigner))     // Specific for Ethereum Mainnet
```

## Private Key Management

### Creating Signers

Use the signer helpers for easy key management:

```go
// EVM signer from hex private key (with or without 0x prefix)
evmSigner, err := evmsigners.NewClientSignerFromPrivateKey("0x1234...")

// SVM signer from base58 private key
svmSigner, err := svmsigners.NewClientSignerFromPrivateKey("5J7W...")

// From environment variable
evmSigner, err := evmsigners.NewClientSignerFromPrivateKey(os.Getenv("EVM_PRIVATE_KEY"))
```

### Generating Test Keys

For testing, generate keys with these tools:

**Ethereum:**
```bash
# Using cast (foundry)
cast wallet new

# Or use an online tool (testnet only!)
```

**Solana:**
```bash
# Using solana CLI
solana-keygen new

# Or use an online tool (testnet only!)
```

## Comparing Patterns

| Pattern | Lines of Code | Flexibility | Best For |
|---------|---------------|-------------|----------|
| Builder Pattern | ~10 lines | High | Complex multi-network setups |
| Hooks | ~20 lines | Medium | Custom logging/validation |
| Helper Registration | ~5 lines | Low | Simple, clean setup |

## Testing Against Local Server

1. Start a local x402 server:

```bash
cd ../../servers/gin
go run main.go
```

2. Run the client in another terminal:

```bash
cd ../../clients/http
go run . builder-pattern
```

## Next Steps

- **[Advanced Client Examples](../advanced/)**: Explore custom transport, retry logic, and error handling
- **[Custom Client Example](../custom/)**: Learn how to implement payment handling without the wrapper
- **[Server Examples](../../servers/)**: Build servers that can receive these payments

## Related Resources

- [x402 HTTP Package Documentation](../../../../go/http/)
- [x402 Core Package Documentation](../../../../go/)
- [Signer Helpers Documentation](../../../../go/signers/)


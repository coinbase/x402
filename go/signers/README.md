# x402 Signer Helpers

Built-in signer implementations that eliminate 95-99% of boilerplate code for x402 payment integration.

## Quick Start

### Client Signers (For Making Payments)

```go
import (
    x402 "github.com/coinbase/x402/go"
    "github.com/coinbase/x402/go/mechanisms/evm"
    "github.com/coinbase/x402/go/mechanisms/svm"
    evmsigners "github.com/coinbase/x402/go/signers/evm"
    svmsigners "github.com/coinbase/x402/go/signers/svm"
)

// Create signers (2 lines instead of 200!)
evmSigner, _ := evmsigners.NewClientSignerFromPrivateKey("0x...")
svmSigner, _ := svmsigners.NewClientSignerFromPrivateKey("5J...")

// Use with x402 client
client := x402.Newx402Client().
    RegisterScheme("eip155:*", evm.NewExactEvmClient(evmSigner)).
    RegisterScheme("solana:*", svm.NewExactSvmClient(svmSigner))
```

**Before:** 200+ lines of EIP-712 and Ed25519 signing implementation  
**After:** 2 lines with helper functions  
**Reduction:** 99% less code!

## What Are Signers?

**Signers** are components that handle cryptographic signing operations for blockchain transactions.

### Client Signers (This Package)

**Purpose:** Create payment signatures locally  
**Blockchain Interaction:** ❌ None (offline signing)  
**RPC Required:** ❌ No  
**Use Cases:**
- Wallet applications
- API clients making payments
- Payment integrations

### Facilitator Signers (Coming Soon)

**Purpose:** Verify and execute payments on-chain  
**Blockchain Interaction:** ✅ Yes (reads, writes, confirmations)  
**RPC Required:** ✅ Yes  
**Use Cases:**
- Payment processors
- Facilitator services
- On-chain settlement

## Available Helpers

### EVM (Ethereum) Client Signer

```go
import evmsigners "github.com/coinbase/x402/go/signers/evm"

signer, err := evmsigners.NewClientSignerFromPrivateKey("0x1234...")
if err != nil {
    log.Fatal(err)
}

// Use with exact EVM client
evmClient := evm.NewExactEvmClient(signer)
```

**Implements:** `evm.ClientEvmSigner`  
**Methods:**
- `Address() string` - Returns Ethereum address
- `SignTypedData(...)` - Signs EIP-712 typed data

**Eliminates:** 130 lines of EIP-712 signing implementation

### SVM (Solana) Client Signer

```go
import svmsigners "github.com/coinbase/x402/go/signers/svm"

signer, err := svmsigners.NewClientSignerFromPrivateKey("5J7W...")
if err != nil {
    log.Fatal(err)
}

// Use with exact SVM client
svmClient := svm.NewExactSvmClient(signer)
```

**Implements:** `svm.ClientSvmSigner`  
**Methods:**
- `Address() solana.PublicKey` - Returns Solana public key
- `SignTransaction(tx)` - Signs Solana transaction

**Eliminates:** 70 lines of Ed25519 signing implementation

## Complete Example

### Before (355 lines)

```go
// User had to implement:
// - 130 lines: EVM signer with EIP-712
// - 70 lines: SVM signer with Ed25519
// - 40 lines: Helper functions
// - 15 lines: Client setup
// - 100 lines: Request handling
```

### After (30 lines)

```go
package main

import (
    "context"
    "log"
    "net/http"
    "os"

    x402 "github.com/coinbase/x402/go"
    x402http "github.com/coinbase/x402/go/http"
    "github.com/coinbase/x402/go/mechanisms/evm"
    "github.com/coinbase/x402/go/mechanisms/svm"
    evmsigners "github.com/coinbase/x402/go/signers/evm"
    svmsigners "github.com/coinbase/x402/go/signers/svm"
)

func main() {
    // Create signers - 2 lines!
    evmSigner, _ := evmsigners.NewClientSignerFromPrivateKey(os.Getenv("EVM_PRIVATE_KEY"))
    svmSigner, _ := svmsigners.NewClientSignerFromPrivateKey(os.Getenv("SVM_PRIVATE_KEY"))
    
    // Build client with fluent API
    client := x402.Newx402Client().
        RegisterScheme("eip155:*", evm.NewExactEvmClient(evmSigner)).
        RegisterScheme("solana:*", svm.NewExactSvmClient(svmSigner))
    
    // Make payment-enabled requests
    httpClient := x402http.Newx402HTTPClient(client)
    wrapped := x402http.WrapHTTPClientWithPayment(http.DefaultClient, httpClient)
    
    resp, _ := wrapped.Get("https://api.example.com/protected")
    defer resp.Body.Close()
    
    // Handle response...
}
```

**Result: 91% code reduction!**

## Package Structure

```
go/signers/
├── README.md           # This file
├── evm/
│   ├── client.go      # NewClientSignerFromPrivateKey()
│   ├── client_test.go # Tests
│   └── README.md      # EVM-specific docs
└── svm/
    ├── client.go      # NewClientSignerFromPrivateKey()
    ├── client_test.go # Tests
    └── README.md      # SVM-specific docs
```

## Private Key Formats

### EVM Private Keys

**Format:** Hex-encoded (64 characters)  
**With prefix:** `0x1234567890abcdef...` (66 characters)  
**Without prefix:** `1234567890abcdef...` (64 characters)

Both formats are supported - the helper automatically handles the `0x` prefix.

### SVM Private Keys

**Format:** Base58-encoded (typically 87-88 characters)  
**Example:** `4Z7cXSyeFR8wNGMVXUE1TwtKn5D5Vu7...`

## Error Handling

All helpers return descriptive errors:

```go
signer, err := evmsigners.NewClientSignerFromPrivateKey("invalid")
// Error: invalid private key: invalid hex string
```

Common errors:
- `invalid private key` - Key format is incorrect
- `failed to parse` - Key encoding is invalid

## Testing

### Unit Tests

Run tests for signer helpers:

```bash
go test ./signers/evm -v
go test ./signers/svm -v
```

### Integration with x402

The signers are tested as part of the main x402 test suite:

```bash
go test ./test/integration -v
```

## Security Considerations

### Private Key Handling

- ✅ Keys are only stored in memory
- ✅ No disk writes
- ✅ No logging of sensitive data
- ⚠️ Use environment variables or secure vaults for keys
- ⚠️ Never commit keys to version control

### Production Usage

```go
// ✅ Good: Load from environment
signer, _ := evmsigners.NewClientSignerFromPrivateKey(os.Getenv("PRIVATE_KEY"))

// ❌ Bad: Hardcoded keys
signer, _ := evmsigners.NewClientSignerFromPrivateKey("0x1234...")
```

## Coming Soon

### Facilitator Signers

Helpers for facilitator signers (with RPC integration) are planned:

```go
// Planned API (not yet available)
import evmsigners "github.com/coinbase/x402/go/signers/evm"

facilitatorSigner, err := evmsigners.NewFacilitatorSignerFromPrivateKey(
    "0x...",
    &evmsigners.FacilitatorConfig{
        RPCURLs: map[string]string{
            "eip155:8453": "https://base.llamarpc.com",
        },
    },
)
```

This will eliminate 300+ lines of facilitator boilerplate.

### Additional Signer Types

- Keystore-based signers
- Mnemonic-based signers
- Hardware wallet adapters
- Testing utilities

## Comparison with TypeScript

| Aspect | TypeScript | Go (Before) | Go (After) |
|--------|-----------|-------------|------------|
| **Signer creation** | 1 line (Viem) | 130 lines | 1 line |
| **Dependencies** | `viem/accounts` | Manual impl | `go/signers/evm` |
| **Crypto knowledge** | ❌ None | ✅ EIP-712 expert | ❌ None |
| **Time to start** | 5 min | 2-3 hours | 5-10 min |

**Result:** Go SDK now matches TypeScript SDK's ease of use!

## Related Documentation

- [PROPOSAL_SIGNER_HELPERS.md](../../PROPOSAL_SIGNER_HELPERS.md) - Full proposal
- [IMPLEMENTATION_PLAN_SIGNERS.md](../../IMPLEMENTATION_PLAN_SIGNERS.md) - Implementation details
- [SIGNER_INTERFACE_COMPARISON.md](../../SIGNER_INTERFACE_COMPARISON.md) - Client vs Facilitator interfaces
- [evm/README.md](./evm/README.md) - EVM-specific documentation
- [svm/README.md](./svm/README.md) - SVM-specific documentation

## Support

For issues or questions:
- GitHub Issues: https://github.com/coinbase/x402/issues
- Documentation: https://github.com/coinbase/x402/go


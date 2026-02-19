# Hypercore Mechanisms

This directory contains payment mechanism implementations for **Hypercore L1** (Hyperliquid) networks.

## What This Exports

This package provides scheme implementations for Hypercore L1 blockchains that can be used by clients, servers, and facilitators.

## Exact Payment Scheme

The **exact** scheme implementation enables fixed-amount payments using EIP-712 signed SendAsset actions with API-based settlement.

### Export Paths

The exact scheme is organized by role:

#### For Clients

**Import Path:**
```
github.com/coinbase/x402/go/mechanisms/hypercore/exact/client
```

**Exports:**
- `NewExactHypercoreScheme(signer)` - Creates client-side Hypercore exact payment mechanism
- Used for creating payment payloads with EIP-712 signed SendAsset actions

**Example:**
```go
import (
    "github.com/coinbase/x402/go/mechanisms/hypercore"
    "github.com/coinbase/x402/go/mechanisms/hypercore/exact/client"
)

// Implement HyperliquidSigner interface
signer := &MyHyperliquidSigner{...}

// Create client scheme
clientScheme := client.NewExactHypercoreScheme(signer)

// Create payment payload
payload, err := clientScheme.CreatePaymentPayload(ctx, requirements)
```

#### For Servers

**Import Path:**
```
github.com/coinbase/x402/go/mechanisms/hypercore/exact/server
```

**Exports:**
- `NewExactHypercoreScheme()` - Creates server-side Hypercore exact payment mechanism
- Used for building payment requirements and parsing prices

**Example:**
```go
import (
    "github.com/coinbase/x402/go/mechanisms/hypercore/exact/server"
)

// Create server scheme
serverScheme := server.NewExactHypercoreScheme()

// Parse price (converts "$0.01" to AssetAmount with USDH)
assetAmount, err := serverScheme.ParsePrice(ctx, "$0.01", "hypercore:mainnet")

// Enhance payment requirements (adds signatureChainId, isMainnet)
enhanced, err := serverScheme.EnhancePaymentRequirements(ctx, requirements, supportedKind, []string{})
```

#### For Facilitators

**Import Path:**
```
github.com/coinbase/x402/go/mechanisms/hypercore/exact/facilitator
```

**Exports:**
- `NewExactHypercoreScheme(apiURL)` - Creates facilitator-side Hypercore exact payment mechanism
- Used for verifying EIP-712 signatures and settling payments via Hyperliquid API
- Requires Hyperliquid API endpoint (no wallet needed - stateless facilitator)

**Example:**
```go
import (
    "github.com/coinbase/x402/go/mechanisms/hypercore"
    "github.com/coinbase/x402/go/mechanisms/hypercore/exact/facilitator"
)

// Create facilitator scheme (stateless - no signer needed)
facScheme := facilitator.NewExactHypercoreScheme(hypercore.HyperliquidAPIMainnet)

// Verify payment (validates signature, amount, destination, nonce)
verifyResp, err := facScheme.Verify(ctx, payload, requirements)

// Settle payment (submits to API and retrieves transaction hash)
settleResp, err := facScheme.Settle(ctx, payload, requirements)
```

## Supported Networks

All Hypercore L1 networks using CAIP-2 network identifiers:

- **Hypercore Mainnet**: `hypercore:mainnet` - Hyperliquid production network
- **Hypercore Testnet**: `hypercore:testnet` - Hyperliquid testing network

Use `hypercore:*` wildcard to support all Hypercore networks.

## Scheme Implementation

The **exact** scheme implements fixed-amount payments:

- **Method**: EIP-712 signed SendAsset actions
- **Token**: USDH (Hyperliquid USD) - 6 decimals (default)
- **Default Token**: `USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b`
- **Signing**: EIP-712 with domain `HyperliquidSignTransaction` (chainId: 999)
- **Nonces**: Timestamp-based (milliseconds since epoch) - max age 1 hour
- **Settlement**: API-based submission (no gas fees)
- **Confirmation**: Transaction hash retrieved via ledger query

### Custom Asset Configuration

Facilitators can configure custom assets using money parsers:

```go
import (
    "github.com/coinbase/x402/go"
    "github.com/coinbase/x402/go/mechanisms/hypercore/exact/server"
)

scheme := server.NewExactHypercoreScheme()

// Register custom money parser for specific amounts or conditions
scheme.RegisterMoneyParser(func(amount float64, network string) (*x402.AssetAmount, error) {
    if amount > 1000 {
        // Use a different token for large amounts
        return &x402.AssetAmount{
            Amount: fmt.Sprintf("%d", int64(amount * 1e18)),
            Asset:  "CUSTOM:0x...",
            Extra: map[string]interface{}{
                "name": "Custom Token",
                "decimals": 18,
            },
        }, nil
    }
    return nil, nil // Use default USDH
})

// Multiple parsers can be registered - tried in order
scheme.RegisterMoneyParser(func(amount float64, network string) (*x402.AssetAmount, error) {
    if network == "hypercore:testnet" && amount < 0.10 {
        return &x402.AssetAmount{
            Amount: fmt.Sprintf("%d", int64(amount * 1e6)),
            Asset:  "TEST:0x...",
            Extra: map[string]interface{}{
                "name": "Test Token",
                "decimals": 6,
            },
        }, nil
    }
    return nil, nil
})
```

**Parser Chain Behavior:**
1. Custom parsers are tried in registration order
2. First parser that returns non-nil wins
3. If all return nil, default USDH asset is used
4. This matches the EVM mechanism pattern exactly

### Key Differences from EVM/SVM

| Feature | EVM/SVM | Hypercore L1 |
|---------|---------|--------------|
| **Settlement** | On-chain transaction | API submission |
| **Facilitator** | Needs wallet + gas | Stateless (no wallet) |
| **Nonce** | Sequential | Timestamp-based |
| **Signature** | EIP-3009 / SPL | EIP-712 SendAsset |
| **Confirmation** | Block inclusion | Ledger query |
| **Gas Fees** | Yes | No |

### EIP-712 SendAsset Action Structure

```go
type HypercoreSendAssetAction struct {
    Type             string `json:"type"`              // "sendAsset"
    HyperliquidChain string `json:"hyperliquidChain"`  // "Mainnet" or "Testnet"
    SignatureChainID string `json:"signatureChainId"`  // "0x3e7" (999 in hex)
    Destination      string `json:"destination"`       // Recipient address (0x...)
    SourceDex        string `json:"sourceDex"`         // "spot"
    DestinationDex   string `json:"destinationDex"`    // "spot"
    Token            string `json:"token"`             // "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b"
    Amount           string `json:"amount"`            // USD string (6 decimals, e.g. "0.100000")
    FromSubAccount   string `json:"fromSubAccount"`    // "" for main account
    Nonce            int64  `json:"nonce"`             // Timestamp in milliseconds
}
```

### EIP-712 Domain

```go
Domain{
    Name:              "HyperliquidSignTransaction",
    Version:           "1",
    ChainID:           big.NewInt(999),
    VerifyingContract: "0x0000000000000000000000000000000000000000",
}
```

## Future Schemes

This directory currently contains only the **exact** scheme implementation. As new payment schemes are developed for Hypercore networks, they will be added here alongside the exact implementation:

```
hypercore/
├── exact/          - Fixed amount payments (current)
├── upto/           - Variable amount up to a limit (planned)
├── subscription/   - Recurring payments (planned)
└── batch/          - Batched payments (planned)
```

Each new scheme will follow the same three-role structure (client, server, facilitator).

## Contributing New Schemes

We welcome contributions of new payment scheme implementations for Hypercore networks!

To contribute a new scheme:

1. Create directory structure: `hypercore/{scheme_name}/client/`, `hypercore/{scheme_name}/server/`, `hypercore/{scheme_name}/facilitator/`
2. Implement the required interfaces for each role
3. Add comprehensive tests
4. Document the scheme specification
5. Provide usage examples

See [CONTRIBUTING.md](../../../CONTRIBUTING.md) for more details.

## Related Documentation

- **[Mechanisms Overview](../README.md)** - About mechanisms in general
- **[EVM Mechanisms](../evm/README.md)** - Ethereum implementations
- **[SVM Mechanisms](../svm/README.md)** - Solana implementations
- **[Exact Scheme Specification](../../../specs/schemes/exact/)** - Exact scheme specifications

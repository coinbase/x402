# EVM Mechanism for x402 (V2)

This package provides V2 EVM blockchain support for the x402 payment protocol. It implements the `exact` payment scheme using EIP-3009 TransferWithAuthorization.

**Note**: This is the V2 implementation which supports x402 protocol version 2. For V1 support, use the `v1` subpackage.

## Features

- **EIP-3009 Support**: Gasless token transfers using TransferWithAuthorization
- **EIP-712 Signing**: Structured data signing for secure authorization
- **Multi-Network Support**: Base, Base Sepolia, Ethereum Mainnet
- **USDC Integration**: Default support for USDC stablecoin
- **Modular Design**: Clean separation between client, facilitator, and service components

## Installation

```go
// For V2 (default, recommended)
import "github.com/coinbase/x402/go/mechanisms/evm"

// For V1 (legacy support)
import evmv1 "github.com/coinbase/x402/go/mechanisms/evm/v1"
```

## Usage

### Client-Side (Payment Creation)

```go
import (
    x402 "github.com/coinbase/x402/go"
    "github.com/coinbase/x402/go/mechanisms/evm"
)

// Implement the ClientEvmSigner interface
type mySigner struct {
    // Your wallet implementation
}

func (s *mySigner) Address() string {
    return "0x..." // Your address
}

func (s *mySigner) SignTypedData(domain evm.TypedDataDomain, types map[string][]evm.TypedDataField, primaryType string, message map[string]interface{}) ([]byte, error) {
    // Your EIP-712 signing implementation
}

// Create payment
signer := &mySigner{}
client := x402.Newx402Client()
evm.RegisterClient(client, signer, "base")

requirements := x402.PaymentRequirements{
    Network: "base",
    Asset:   "USDC",
    PayTo:   "0xrecipient",
    Amount:  "1.50", // $1.50 USDC
}

payload, err := client.CreatePaymentPayload(ctx, 2, requirements)
```

### Facilitator-Side (Verification & Settlement)

```go
// Implement the FacilitatorEvmSigner interface
type myFacilitatorSigner struct {
    // Your blockchain client implementation
}

// Create facilitator
facilitator := x402.Newx402Facilitator()
signer := &myFacilitatorSigner{}
evm.RegisterFacilitator(facilitator, signer, "base")

// Verify payment
verifyResp, err := facilitator.Verify(ctx, payload, requirements)
if verifyResp.IsValid {
    // Payment is valid
    fmt.Printf("Payer: %s\n", verifyResp.Payer)
}

// Settle payment on-chain
settleResp, err := facilitator.Settle(ctx, payload, requirements)
if settleResp.Success {
    fmt.Printf("Transaction: %s\n", settleResp.Transaction)
}
```

### Service-Side (Price Parsing & Requirements)

```go
// Create service with EVM support
service := x402.Newx402ResourceService(
    evm.RegisterService("base", "base-sepolia")...,
)

// Parse price to asset amount
assetAmount, err := evmService.ParsePrice("$1.50", "base")
// Returns: { Asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", Amount: "1500000" }

// Enhance payment requirements
enhanced, err := evmService.EnhancePaymentRequirements(
    ctx,
    requirements,
    supportedKind,
    []string{"customField"},
)
```

## Supported Networks

| Network | Chain ID | USDC Address | Network String |
|---------|----------|--------------|----------------|
| Base Mainnet | 8453 | 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 | `base`, `base-mainnet`, `eip155:8453` |
| Base Sepolia | 84532 | 0x036CbD53842c5426634e7929541eC2318f3dCF7e | `base-sepolia`, `eip155:84532` |
| Ethereum Mainnet | 1 | 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 | `eip155:1` |

## EIP-3009 Authorization Structure

The exact payment scheme uses EIP-3009 TransferWithAuthorization with the following structure:

```go
type ExactEIP3009Authorization struct {
    From        string // Token holder address
    To          string // Recipient address
    Value       string // Amount in smallest unit (e.g., 1000000 = 1 USDC)
    ValidAfter  string // Unix timestamp
    ValidBefore string // Unix timestamp
    Nonce       string // 32-byte unique nonce
}
```

## Testing

```bash
cd go/mechanisms/evm
go test -v
```

## Dependencies

- `github.com/ethereum/go-ethereum`: Ethereum Go implementation
- `github.com/coinbase/x402/go`: Core x402 protocol

## Version Differences

### V2 (This Package)
- Supports x402 protocol version 2
- No buffer on `validAfter` (can be used immediately)
- Default validity window of 1 hour
- Enhanced price parsing with multiple format support

### V1 (v1 Subpackage)
- Supports x402 protocol version 1 only
- 10-minute buffer subtracted from `validAfter`
- Default validity window of 10 minutes
- Simpler price parsing logic

For backward compatibility with existing V1 integrations, use:
```go
import evmv1 "github.com/coinbase/x402/go/mechanisms/evm/v1"
```

## License

See the main x402 repository for license information.

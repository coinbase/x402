# EVM Mechanism for x402

EVM (Ethereum Virtual Machine) implementation of the x402 payment protocol using the **Exact** payment scheme with EIP-3009 TransferWithAuthorization.

## Package Structure

```
evm/
├── client.go       # ExactEvmClient (V2)
├── facilitator.go  # ExactEvmFacilitator (V2)
├── server.go       # ExactEvmServer (V2)
├── builder.go      # NewEvmClient() convenience builder
├── v1/
│   ├── client.go      # ExactEvmClientV1
│   ├── facilitator.go # ExactEvmFacilitatorV1
│   ├── server.go      # ExactEvmServerV1
│   └── evm.go         # V1 helpers + NETWORKS constant
```

## Components

### Client (Payment Creation)

**V2:** `ExactEvmClient` - Creates payments using EIP-3009 with CAIP-2 networks

```go
import (
    x402 "github.com/coinbase/x402/go"
    "github.com/coinbase/x402/go/mechanisms/evm"
)

client := x402.Newx402Client()
evmClient := evm.NewExactEvmClient(mySigner)
client.RegisterScheme("eip155:*", evmClient)
```

**V1:** `ExactEvmClientV1` - Legacy implementation with simple network names

```go
import evmv1 "github.com/coinbase/x402/go/mechanisms/evm/exact/v1"

evmClientV1 := evmv1.NewExactEvmClientV1(mySigner)
client.RegisterSchemeV1("base-sepolia", evmClientV1)
```

### Facilitator (Payment Verification & Settlement)

**V2:** `ExactEvmFacilitator` - Verifies and settles EIP-3009 payments

```go
facilitator := x402.Newx402Facilitator()
evmFacilitator := evm.NewExactEvmFacilitator(myFacilitatorSigner)
facilitator.RegisterScheme("eip155:8453", evmFacilitator)

// Verify payment
verifyResp, err := facilitator.Verify(ctx, payloadBytes, requirementsBytes)

// Settle on-chain
settleResp, err := facilitator.Settle(ctx, payloadBytes, requirementsBytes)
```

**V1:** `ExactEvmFacilitatorV1` - Legacy verification and settlement

### Service (Payment Requirements)

**V2:** `ExactEvmServer` - Builds payment requirements for protected resources

```go
server := x402.Newx402ResourceServer(
    evm.RegisterServer("eip155:8453")...,
)

// Server handles price parsing and requirement building
```

**V1:** `ExactEvmServerV1` - Legacy requirement building

## Convenience Builder

**`NewEvmClient(config)`** - Pre-configured client with V1+V2 support

```go
import (
    "github.com/coinbase/x402/go/mechanisms/evm"
    evmv1 "github.com/coinbase/x402/go/mechanisms/evm/v1"
)

client := evm.NewEvmClient(evm.EvmClientConfig{
    Signer: myEvmSigner,
    NewEvmClientV1: func(s evm.ClientEvmSigner) x402.SchemeNetworkClient {
        return evmv1.NewExactEvmClientV1(s)
    },
})
// Registers eip155:* for V2 + all V1 networks automatically
```

## Supported Networks

**V2 Networks** (CAIP-2 format):
- `eip155:1` - Ethereum Mainnet
- `eip155:8453` - Base Mainnet
- `eip155:84532` - Base Sepolia  
- `eip155:*` - Wildcard (all EVM chains)

**V1 Networks** (see `v1.NETWORKS`):
- 15 networks including Base, Polygon, Avalanche, Sei, etc.

## Signer Interfaces

### ClientEvmSigner (Client-side)
```go
type ClientEvmSigner interface {
    Address() string
    SignTypedData(domain, types, primaryType, message) ([]byte, error)
}
```

### FacilitatorEvmSigner (Facilitator-side)
```go
type FacilitatorEvmSigner interface {
    SendTransaction(ctx, chainID, data) (string, error)
    WaitForTransaction(ctx, chainID, txHash) error
}
```

## Testing

```bash
go test ./...                    # All tests
go test -v ./mechanisms/evm      # V2 tests
go test -v ./mechanisms/evm/exact/v1   # V1 tests
```

## Dependencies

- `github.com/ethereum/go-ethereum` - Ethereum Go implementation
- `github.com/coinbase/x402/go` - Core x402 protocol

## Related Packages

- `github.com/coinbase/x402/go` - Core x402 client
- `github.com/coinbase/x402/go/http` - HTTP integration
- `github.com/coinbase/x402/go/mechanisms/svm` - Solana implementation

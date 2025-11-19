# SVM Mechanism for x402

SVM (Solana Virtual Machine) implementation of the x402 payment protocol using the **Exact** payment scheme with SPL Token transfers.

## Package Structure

```
svm/
├── client.go       # ExactSvmClient (V2)
├── facilitator.go  # ExactSvmFacilitator (V2)
├── server.go       # ExactEvmServer (V2)
├── builder.go      # NewSvmClient() convenience builder
├── v1/
│   ├── client.go      # ExactSvmClientV1
│   ├── facilitator.go # ExactSvmFacilitatorV1
│   └── svm.go         # V1 helpers + NETWORKS constant
```

## Components

### Client (Payment Creation)

**V2:** `ExactSvmClient` - Creates payments using SPL Token with CAIP-2 networks

```go
import (
    x402 "github.com/coinbase/x402/go"
    "github.com/coinbase/x402/go/mechanisms/svm"
)

client := x402.Newx402Client()
svmClient := svm.NewExactSvmClient(mySigner)
client.RegisterScheme("solana:*", svmClient)
```

**V1:** `ExactSvmClientV1` - Legacy implementation with simple network names

```go
import svmv1 "github.com/coinbase/x402/go/mechanisms/svm/exact/v1"

svmClientV1 := svmv1.NewExactSvmClientV1(mySigner)
client.RegisterSchemeV1("solana-devnet", svmClientV1)
```

### Facilitator (Payment Verification & Settlement)

**V2:** `ExactSvmFacilitator` - Verifies and settles SPL Token payments

```go
facilitator := x402.Newx402Facilitator()
svmFacilitator := svm.NewExactSvmFacilitator(myFacilitatorSigner)
facilitator.RegisterScheme("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", svmFacilitator)

// Verify payment (checks signatures, doesn't submit)
verifyResp, err := facilitator.Verify(ctx, payloadBytes, requirementsBytes)

// Settle on-chain (signs and submits transaction)
settleResp, err := facilitator.Settle(ctx, payloadBytes, requirementsBytes)
```

**V1:** `ExactSvmFacilitatorV1` - Legacy verification and settlement

### Service (Payment Requirements)

**V2:** `ExactEvmServer` - Builds payment requirements for protected resources

```go
server := x402.Newx402ResourceServer(
    svm.RegisterServer("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")...,
)

// Server handles price parsing and requirement building
```

**V1:** V1 server not separately exported (use V2 server)

## Convenience Builder

**`NewSvmClient(config)`** - Pre-configured client with V1+V2 support

```go
import (
    "github.com/coinbase/x402/go/mechanisms/svm"
    svmv1 "github.com/coinbase/x402/go/mechanisms/svm/v1"
)

client := svm.NewSvmClient(svm.SvmClientConfig{
    Signer: mySvmSigner,
    NewSvmClientV1: func(s svm.ClientSvmSigner) x402.SchemeNetworkClient {
        return svmv1.NewExactSvmClientV1(s)
    },
})
// Registers solana:* for V2 + all V1 networks automatically
```

## Supported Networks

**V2 Networks** (CAIP-2 format):
- `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` - Mainnet Beta
- `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` - Devnet
- `solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z` - Testnet
- `solana:*` - Wildcard (all Solana networks)

**V1 Networks** (see `v1.NETWORKS`):
- `solana` - Mainnet
- `solana-devnet` - Devnet
- `solana-testnet` - Testnet

## Signer Interfaces

### ClientSvmSigner (Client-side)
```go
type ClientSvmSigner interface {
    Address() solana.PublicKey
    SignTransaction(tx *solana.Transaction) error
}
```

### FacilitatorSvmSigner (Facilitator-side)
```go
type FacilitatorSvmSigner interface {
    SendAndConfirmTransaction(ctx, tx) (solana.Signature, error)
}
```

## Optional Configuration

**ClientConfig** - Customize RPC behavior (optional, uses network defaults if not provided):

```go
svmClient := svm.NewExactSvmClient(signer, &svm.ClientConfig{
    RPCURL: "https://custom.rpc.com",
})
```

## Transaction Details

**Transaction Structure:**
1. Compute Budget Instructions (unit limit + price)
2. SPL Token `TransferChecked` instruction
3. Partially signed by client (client's signature)
4. Completed and submitted by facilitator (fee payer signature)

**Requirements:**
- Source ATA must exist (client's token account)
- Destination ATA must exist (recipient's token account)
- Fee payer specified in `requirements.extra.feePayer`

## Testing

```bash
go test ./...                    # All tests
go test -v ./mechanisms/svm      # V2 tests
go test -v ./mechanisms/svm/exact/v1   # V1 tests
```

## Dependencies

- `github.com/gagliardetto/solana-go` - Solana Go SDK
- `github.com/coinbase/x402/go` - Core x402 protocol

## Related Packages

- `github.com/coinbase/x402/go` - Core x402 client
- `github.com/coinbase/x402/go/http` - HTTP integration
- `github.com/coinbase/x402/go/mechanisms/evm` - EVM implementation

# Solana Mechanism for x402

This package implements the Solana payment mechanism for the x402 payment protocol. It supports both v1 and v2 of the x402 protocol using the "exact" payment scheme with SPL Token transfers.

## Overview

The Solana mechanism enables x402 payments on Solana using:
- **SPL Token** transfers (including Token-2022)
- **Exact payment scheme**: Exact amount transfers with EIP-3009-style authorization
- **Compute budget optimization**: Configurable compute units and pricing
- **Multi-network support**: Mainnet, Devnet, and Testnet

## Architecture

### V2 Implementation (Recommended)

The V2 implementation uses CAIP-2 network identifiers and the current x402 protocol version:

```
go/mechanisms/solana/
├── solana.go           # Registration helpers
├── client.go           # Client implementation
├── facilitator.go      # Facilitator implementation  
├── service.go          # Service implementation
├── types.go            # Type definitions
├── constants.go        # Network configs and constants
└── utils.go            # Helper functions
```

### V1 Implementation (Legacy Support)

The V1 implementation provides backwards compatibility for existing clients and facilitators:

```
go/mechanisms/solana/v1/
├── solana.go           # V1 registration helpers
├── client.go           # V1 client implementation
└── facilitator.go      # V1 facilitator implementation
```

**Note**: V1 does not include a service implementation as we don't support new servers using V1.

## Components

### 1. Service (V2 Only)

The service implementation is used by servers creating payment requirements.

```go
import (
    x402 "github.com/coinbase/x402/go"
    "github.com/coinbase/x402/go/mechanisms/solana"
)

// Register service with x402 resource service
opts := solana.RegisterService()
service := x402.NewX402ResourceService(opts...)
```

**Key Features**:
- Parses prices in multiple formats: "$0.10", "0.10 USDC", "0.10"
- Enhances payment requirements with network-specific details
- Adds feePayer from facilitator's supported kinds
- Supports USDC by default

### 2. Client

The client implementation is used by payers creating payment payloads.

**V2 Client**:
```go
import (
    "github.com/coinbase/x402/go/mechanisms/solana"
    solanaSDK "github.com/gagliardetto/solana-go"
)

// Implement ClientSolanaSigner interface
type MySigner struct {
    privateKey solanaSDK.PrivateKey
}

func (s *MySigner) Address() solanaSDK.PublicKey {
    return s.privateKey.PublicKey()
}

func (s *MySigner) SignTransaction(tx *solanaSDK.Transaction) error {
    _, err := tx.Sign(func(key solanaSDK.PublicKey) *solanaSDK.PrivateKey {
        if key.Equals(s.privateKey.PublicKey()) {
            return &s.privateKey
        }
        return nil
    })
    return err
}

// Register client
client := x402.NewX402Client()
signer := &MySigner{privateKey: myKey}
solana.RegisterClient(client, signer, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")
```

**V1 Client**:
```go
import (
    "github.com/coinbase/x402/go/mechanisms/solana/v1"
)

// Register V1 client
client := x402.NewX402Client()
v1.RegisterClient(client, signer, "solana")
```

### 3. Facilitator

The facilitator implementation is used by payment processors verifying and settling transactions.

**V2 Facilitator**:
```go
import (
    "github.com/coinbase/x402/go/mechanisms/solana"
    solanaSDK "github.com/gagliardetto/solana-go"
    "github.com/gagliardetto/solana-go/rpc"
)

// Implement FacilitatorSolanaSigner interface
type MyFacilitatorSigner struct {
    privateKeys map[string]solanaSDK.PrivateKey
    rpcClients  map[string]*rpc.Client
}

func (s *MyFacilitatorSigner) GetRPC(network string) (*rpc.Client, error) {
    client, ok := s.rpcClients[network]
    if !ok {
        return nil, fmt.Errorf("no RPC client for network: %s", network)
    }
    return client, nil
}

func (s *MyFacilitatorSigner) SignTransaction(tx *solanaSDK.Transaction, network string) error {
    key, ok := s.privateKeys[network]
    if !ok {
        return fmt.Errorf("no private key for network: %s", network)
    }
    
    _, err := tx.Sign(func(pubkey solanaSDK.PublicKey) *solanaSDK.PrivateKey {
        if pubkey.Equals(key.PublicKey()) {
            return &key
        }
        return nil
    })
    return err
}

func (s *MyFacilitatorSigner) SendTransaction(ctx context.Context, tx *solanaSDK.Transaction, network string) (solanaSDK.Signature, error) {
    rpc, err := s.GetRPC(network)
    if err != nil {
        return solanaSDK.Signature{}, err
    }
    return rpc.SendTransaction(ctx, tx, rpc.SendTransactionOpts{})
}

func (s *MyFacilitatorSigner) ConfirmTransaction(ctx context.Context, sig solanaSDK.Signature, network string) error {
    // Implementation depends on your confirmation strategy
    return nil
}

func (s *MyFacilitatorSigner) GetAddress(network string) solanaSDK.PublicKey {
    return s.privateKeys[network].PublicKey()
}

// Register facilitator
facilitator := x402.NewX402Facilitator()
signer := &MyFacilitatorSigner{...}
solana.RegisterFacilitator(facilitator, signer)
```

**V1 Facilitator**:
```go
import (
    "github.com/coinbase/x402/go/mechanisms/solana/v1"
)

// Register V1 facilitator
facilitator := x402.NewX402Facilitator()
v1.RegisterFacilitator(facilitator, signer, "solana")
```

## Network Support

### V2 Networks (CAIP-2 Format)

- **Mainnet**: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`
- **Devnet**: `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`
- **Testnet**: `solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z`

### V1 Networks (Simple Names)

- **Mainnet**: `solana`
- **Devnet**: `solana-devnet`
- **Testnet**: `solana-testnet`

## Payment Flow

### Client Side (Creating Payment)

1. Client receives payment requirements from server
2. Client creates transaction with:
   - Compute budget instructions (SetComputeUnitLimit, SetComputeUnitPrice)
   - TransferChecked instruction (SPL Token or Token-2022)
3. Transaction is partially signed by client
4. Transaction is encoded to base64 and sent as payload

### Facilitator Side (Verifying & Settling)

1. Facilitator receives payment payload
2. Verification process:
   - Validates transaction structure (3 or 4 instructions)
   - Verifies compute budget instructions
   - Verifies optional CreateATA instruction
   - Verifies TransferChecked instruction (amount, mint, recipient)
   - Signs transaction with facilitator key
   - **Simulates transaction** (catches balance issues, invalid accounts)
3. Settlement process:
   - Verifies payment first
   - Signs transaction
   - Sends transaction to network
   - Waits for confirmation with retries

## Transaction Structure

Valid transactions have 3 or 4 instructions:

**3 Instructions** (ATA already exists):
1. SetComputeUnitLimit
2. SetComputeUnitPrice
3. TransferChecked

**4 Instructions** (Need to create ATA):
1. SetComputeUnitLimit
2. SetComputeUnitPrice
3. CreateAssociatedTokenAccount
4. TransferChecked

## Configuration

### Compute Budget

```go
const (
    DefaultComputeUnitPrice = 1      // microlamports per compute unit
    MaxComputeUnitPrice     = 5      // lamports (facilitator validation limit)
)
```

### Transaction Confirmation

```go
const (
    DefaultCommitment    = rpc.CommitmentConfirmed
    MaxConfirmAttempts   = 15
    ConfirmRetryDelay    = 500 * time.Millisecond
    ConfirmMaxJitter     = 1 * time.Second
)
```

## Error Handling

Common error reasons returned by the facilitator:

- `unsupported_scheme` - Not using exact scheme
- `invalid_exact_solana_payload_missing_fee_payer` - No feePayer in requirements
- `invalid_exact_solana_payload_transaction` - Invalid transaction format
- `invalid_exact_solana_payload_transaction_instructions_length` - Wrong number of instructions
- `invalid_exact_solana_payload_transaction_instructions_compute_limit_instruction` - Invalid compute limit
- `invalid_exact_solana_payload_transaction_instructions_compute_price_instruction` - Invalid compute price
- `invalid_exact_solana_payload_transaction_instructions_compute_price_instruction_too_high` - Price exceeds maximum
- `invalid_exact_solana_payload_transaction_create_ata_instruction` - Invalid ATA creation
- `invalid_exact_solana_payload_no_transfer_instruction` - Missing or invalid transfer
- `invalid_exact_solana_payload_mint_mismatch` - Wrong token mint
- `invalid_exact_solana_payload_recipient_mismatch` - Wrong recipient
- `invalid_exact_solana_payload_amount_insufficient` - Amount too low
- `transaction_simulation_failed` - Transaction simulation failed
- `network_mismatch` - Network doesn't match requirements

## Dependencies

```go
require (
    github.com/gagliardetto/solana-go v1.8.4
    github.com/coinbase/x402/go v0.0.0 // internal
)
```

## Testing

See `go/test/integration/solana_test.go` for integration tests.

## References

- [Solana SPL Token Documentation](https://spl.solana.com/token)
- [x402 Protocol Specification](../../../specs/)
- [x402 Solana Spec](../../../specs/schemes/exact/scheme_exact_svm.md)
- [TypeScript SVM Implementation](../../../typescript/packages/mechanisms/svm/)


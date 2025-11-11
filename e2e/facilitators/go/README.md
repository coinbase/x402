# E2E Test Facilitator: Go

This facilitator demonstrates and tests the Go x402 facilitator implementation with both EVM and SVM payment verification and settlement.

## What It Tests

### Core Functionality
- ✅ **V2 Protocol** - Modern x402 facilitator protocol
- ✅ **V1 Protocol** - Legacy x402 facilitator protocol
- ✅ **Payment Verification** - Validates payment payloads off-chain
- ✅ **Payment Settlement** - Executes transactions on-chain
- ✅ **Multi-chain Support** - EVM and SVM mechanisms
- ✅ **HTTP API** - HTTP server exposing facilitator endpoints

### Facilitator Endpoints
- ✅ `POST /verify` - Verifies payment payload validity
- ✅ `POST /settle` - Settles payment on blockchain
- ✅ `GET /supported` - Returns supported payment kinds
- ✅ **Extension Support** - Bazaar discovery extension

## What It Demonstrates

### Facilitator Setup

```go
import (
    x402 "github.com/coinbase/x402/go"
    "github.com/coinbase/x402/go/mechanisms/evm"
    evmv1 "github.com/coinbase/x402/go/mechanisms/evm/v1"
    "github.com/coinbase/x402/go/mechanisms/svm"
    svmv1 "github.com/coinbase/x402/go/mechanisms/svm/v1"
    "github.com/coinbase/x402/go/extensions/bazaar"
)

// Create facilitator
facilitator := x402.Newx402Facilitator()
facilitator.RegisterExtension(bazaar.EXTENSION_NAME)

// Register EVM V2 wildcard
evmFacilitator := evm.NewExactEvmFacilitator(evmSigner)
facilitator.RegisterScheme("eip155:*", evmFacilitator)

// Register EVM V1 networks
evmFacilitatorV1 := evmv1.NewExactEvmFacilitatorV1(evmSigner)
facilitator.RegisterSchemeV1("base-sepolia", evmFacilitatorV1)

// Register SVM V2 wildcard
svmFacilitator := svm.NewExactSvmFacilitator(svmSigner)
facilitator.RegisterScheme("solana:*", svmFacilitator)

// Register SVM V1 networks
svmFacilitatorV1 := svmv1.NewExactSvmFacilitatorV1(svmSigner)
facilitator.RegisterSchemeV1("solana-devnet", svmFacilitatorV1)
```

### HTTP Server

```go
import (
    "net/http"
    "encoding/json"
)

http.HandleFunc("/verify", handleVerify(facilitator))
http.HandleFunc("/settle", handleSettle(facilitator))
http.HandleFunc("/supported", handleSupported(facilitator))

http.ListenAndServe(":4024", nil)
```

### Key Concepts Shown

1. **Extension Registration** - Bazaar discovery support
2. **Multi-Version Support** - V1 and V2 protocols
3. **Multi-Chain Support** - EVM and SVM mechanisms
4. **Wildcard Registration** - Efficient V2 scheme handling
5. **Real Settlement** - Actual on-chain transaction execution
6. **Error Handling** - Comprehensive verification errors

## Test Scenarios

This facilitator is tested with:
- **Clients:** TypeScript Fetch, Go HTTP
- **Servers:** Express (TypeScript), Gin (Go)
- **Networks:** Base Sepolia (EVM), Solana Devnet (SVM)
- **Protocols:** V1 and V2

### Verification Flow
1. Receives payment payload + requirements
2. Validates signatures and authorization structure
3. Returns verification result without blockchain interaction

### Settlement Flow
1. Receives payment payload + requirements
2. Verifies payload validity
3. Executes transaction on blockchain
4. Returns transaction hash and status

## Running

```bash
# Via e2e test suite
cd e2e
pnpm test --facilitator=go

# Direct execution
cd e2e/facilitators/go
export EVM_PRIVATE_KEY="0x..."
export SVM_PRIVATE_KEY="..."
export PORT=4024
./go
```

## Environment Variables

- `PORT` - HTTP server port (default: 4024)
- `EVM_PRIVATE_KEY` - Ethereum private key for settlement
- `SVM_PRIVATE_KEY` - Solana private key for settlement

## API Endpoints

### POST /verify

**Request:**
```json
{
  "x402Version": 2,
  "paymentPayload": { ... },
  "paymentRequirements": { ... }
}
```

**Response:**
```json
{
  "isValid": true,
  "payer": "0x...",
  "scheme": "exact",
  "network": "eip155:84532"
}
```

### POST /settle

**Request:**
```json
{
  "x402Version": 2,
  "paymentPayload": { ... },
  "paymentRequirements": { ... }
}
```

**Response:**
```json
{
  "success": true,
  "transaction": "0x...",
  "network": "eip155:84532",
  "payer": "0x...",
  "scheme": "exact"
}
```

### GET /supported

**Response:**
```json
{
  "kinds": [
    {
      "scheme": "exact",
      "network": "eip155:84532",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "extensions": ["bazaar"]
    }
  ]
}
```

## Implementation Details

### EVM Facilitator
- Verifies EIP-712 signatures
- Calls `transferWithAuthorization()` on USDC contract
- Uses go-ethereum for blockchain interaction
- Handles gas estimation and transaction submission

### SVM Facilitator
- Verifies ed25519 signatures
- Completes partially-signed SPL Token transactions
- Adds fee payer signature
- Submits to Solana RPC

### Extension Support
- **Bazaar** - Discovery extension for API documentation
- Registered at facilitator level
- Included in supported kinds response

## Dependencies

- `github.com/coinbase/x402/go` - Core facilitator
- `github.com/coinbase/x402/go/mechanisms/evm` - EVM mechanisms
- `github.com/coinbase/x402/go/mechanisms/svm` - SVM mechanisms
- `github.com/coinbase/x402/go/extensions/bazaar` - Bazaar extension
- `github.com/ethereum/go-ethereum` - Ethereum client
- `github.com/gagliardetto/solana-go` - Solana client

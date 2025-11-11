# E2E Test Facilitator: TypeScript

This facilitator demonstrates and tests the TypeScript x402 facilitator implementation with both EVM and SVM payment verification and settlement.

## What It Tests

### Core Functionality
- ✅ **V2 Protocol** - Modern x402 facilitator protocol
- ✅ **V1 Protocol** - Legacy x402 facilitator protocol
- ✅ **Payment Verification** - Validates payment payloads off-chain
- ✅ **Payment Settlement** - Executes transactions on-chain
- ✅ **Multi-chain Support** - EVM and SVM mechanisms
- ✅ **HTTP API** - Express.js server exposing facilitator endpoints

### Facilitator Endpoints
- ✅ `POST /verify` - Verifies payment payload validity
- ✅ `POST /settle` - Settles payment on blockchain
- ✅ `GET /supported` - Returns supported payment kinds
- ✅ **Extension Support** - Bazaar discovery extension

## What It Demonstrates

### Facilitator Setup

```typescript
import { x402Facilitator } from "@x402/core/facilitator";
import { ExactEvmFacilitator } from "@x402/evm";
import { ExactEvmFacilitatorV1, NETWORKS as EVM_NETWORKS } from "@x402/evm/v1";
import { ExactSvmFacilitator } from "@x402/svm";
import { ExactSvmFacilitatorV1, NETWORKS as SVM_NETWORKS } from "@x402/svm/v1";

// Create facilitator with bazaar extension
const facilitator = new x402Facilitator()
  .registerExtension("bazaar");

// Register EVM V2 wildcard
facilitator.registerScheme(
  "eip155:*",
  new ExactEvmFacilitator(evmSigner)
);

// Register all EVM V1 networks
EVM_NETWORKS.forEach(network => {
  facilitator.registerSchemeV1(
    network,
    new ExactEvmFacilitatorV1(evmSigner)
  );
});

// Register SVM schemes similarly...
```

### HTTP Server

```typescript
import express from "express";
import { createFacilitatorRouter } from "@x402/server/facilitator";

const app = express();
app.use(express.json());

// Mount facilitator routes at root
app.use("/", createFacilitatorRouter(facilitator));

app.listen(port, () => {
  console.log(`Facilitator ready at http://localhost:${port}`);
});
```

### Key Concepts Shown

1. **Extension Registration** - Bazaar discovery
2. **Comprehensive Network Support** - All EVM V1 networks, all SVM V1 networks
3. **Wildcard Schemes** - Efficient V2 registration with `eip155:*` and `solana:*`
4. **HTTP Router Integration** - `@x402/server/facilitator` for Express
5. **Real Signers** - Actual blockchain transaction submission
6. **Multi-Protocol** - V1 and V2 side-by-side

## Test Scenarios

This facilitator is tested with:
- **Clients:** TypeScript Fetch, Go HTTP
- **Servers:** Express (TypeScript), Gin (Go)
- **Networks:** Base Sepolia (EVM), Solana Devnet (SVM)
- **Test Cases:** 
  - V1 EVM payments
  - V2 EVM payments
  - V1 SVM payments
  - V2 SVM payments

### Success Criteria
- ✅ Verification returns valid status
- ✅ Settlement returns transaction hash
- ✅ Supported endpoint lists all mechanisms
- ✅ Bazaar extension included

## Running

```bash
# Via e2e test suite
cd e2e
pnpm test --facilitator=typescript

# Direct execution
cd e2e/facilitators/typescript
export EVM_PRIVATE_KEY="0x..."
export SVM_PRIVATE_KEY="..."
export PORT=4025
pnpm start
```

## Environment Variables

- `PORT` - HTTP server port
- `EVM_PRIVATE_KEY` - Ethereum private key (hex with 0x prefix)
- `SVM_PRIVATE_KEY` - Solana private key (base58 encoded)

## Package Dependencies

- `@x402/core` - Core facilitator
- `@x402/server` - Facilitator HTTP router
- `@x402/evm` - EVM facilitator (V2)
- `@x402/evm/v1` - EVM facilitator (V1) + NETWORKS
- `@x402/svm` - SVM facilitator (V2)
- `@x402/svm/v1` - SVM facilitator (V1) + NETWORKS
- `express` - HTTP server
- `viem` - Ethereum transactions
- `@solana/web3.js` - Solana transactions

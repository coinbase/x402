# Token-Gate Server Example

Express.js server demonstrating ERC-20/ERC-721 token-gated access with x402:
- Routes that are free for NFT/token holders and paid for everyone else
- Server advertises token requirements in 402 responses so clients discover them automatically

```typescript
import express from "express";
import { paymentMiddlewareFromHTTPServer, x402ResourceServer, x402HTTPResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import {
  createTokenGateExtension,
  declareTokenGateExtension,
  createTokenGateRequestHook,
} from "@x402/extensions/token-gate";
import { baseSepolia } from "viem/chains";

const NFT_CONTRACT = { address: "0xYourNFT", chain: baseSepolia, type: "ERC-721" as const };

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("eip155:84532", new ExactEvmScheme())
  .registerExtension(createTokenGateExtension());

const httpServer = new x402HTTPResourceServer(resourceServer, routes)
  .onProtectedRequest(createTokenGateRequestHook({ contracts: [NFT_CONTRACT], access: "free" }));

const app = express();
app.use(paymentMiddlewareFromHTTPServer(httpServer));
```

## How It Works

1. **Client requests** a protected route
2. **Server returns 402** with `token-gate` extension listing the required contract and domain
3. **Client signs** a proof of wallet ownership (EIP-191) and retries with both the proof and payment headers
4. **Server verifies** the proof signature and checks on-chain ownership (`balanceOf` / `ownerOf`)
5. **Token holders** get free access (or a discount) — non-holders fall through to normal x402 payment

On-chain ownership results are cached for 5 minutes (configurable via `ownershipCacheTtl`).

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))
- EVM payout address
- ERC-721 or ERC-20 contract address on Base Sepolia
- Facilitator URL (see [facilitator list](https://www.x402.org/ecosystem?category=facilitators))

## Setup

1. Copy `.env-local` to `.env`:

```bash
cp .env-local .env
```

and fill in the required environment variables:

- `EVM_ADDRESS` - Ethereum address to receive payments from non-holders
- `TOKEN_CONTRACT_ADDRESS` - ERC-721 or ERC-20 contract address on Base Sepolia
- `FACILITATOR_URL` - Facilitator endpoint URL

2. Install and build from the typescript examples root:

```bash
cd ../../
pnpm install && pnpm build
cd servers/token-gate
```

3. Run the server:

```bash
pnpm dev
```

## Testing the Server

Start the token-gate client to test:

```bash
cd ../../clients/token-gate
# Ensure .env is set up with EVM_PRIVATE_KEY
pnpm start
```

The client will:
1. Request `/weather` — free if the wallet holds the NFT, otherwise pays $0.001 USDC
2. Request `/joke` — same token-gate logic

## Example Endpoints

- `GET /weather` — Weather data ($0.001 USDC, free for NFT holders)
- `GET /joke` — Joke content ($0.001 USDC, free for NFT holders)

## Token-Gate Extension Configuration

The server uses two key components:

### 1. Extension Registration + Per-Route Declaration

```typescript
// Register extension on the resource server (enables 402 advertisement)
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("eip155:84532", new ExactEvmScheme())
  .registerExtension(createTokenGateExtension());

// Declare per-route so the 402 response includes the contract info
const routes = {
  "GET /weather": {
    accepts: [{ scheme: "exact", price: "$0.001", network: "eip155:84532", payTo: evmAddress }],
    extensions: {
      ...declareTokenGateExtension({
        contracts: [NFT_CONTRACT],
        message: "NFT holders get free access",
      }),
    },
  },
};
```

### 2. Request Hook (Verifies Proofs)

```typescript
const httpServer = new x402HTTPResourceServer(resourceServer, routes)
  .onProtectedRequest(
    createTokenGateRequestHook({
      contracts: [NFT_CONTRACT],
      access: "free",   // or { discount: 50 } for 50% off
    }),
  );
```

The hook fires for every protected request. If the `token-gate` header is present and valid and the wallet holds the required token, access is granted without payment. Otherwise the request proceeds to normal x402 payment.

## Discount Mode

To offer a discount instead of free access:

```typescript
createTokenGateRequestHook({
  contracts: [NFT_CONTRACT],
  access: { discount: 50 }, // 50% off
});
```

In discount mode the hook returns `void` (payment still proceeds). Use a `DynamicPrice` function on the route to apply the actual price reduction.

## Event Logging

Monitor token-gate events:

```typescript
createTokenGateRequestHook({
  contracts: [NFT_CONTRACT],
  access: "free",
  onEvent(event) {
    console.log(`[token-gate] ${event.type}`, event);
  },
});
```

Event types:
- `access_granted` — Proof verified and wallet confirmed as token holder
- `not_holder` — Valid proof but wallet does not hold the required token
- `proof_invalid` — Header present but proof verification failed

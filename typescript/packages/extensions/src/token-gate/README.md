# token-gate

x402 extension that grants free or discounted access to ERC-20/ERC-721 token holders.

**Example use cases:**
- NFT holders get free API calls (e.g. hold a membership NFT → zero-cost access)
- DAO token holders get discounted data feeds (e.g. hold 1000 GOV → 50% off)
- Early-adopter ERC-20 holders bypass paywalls on premium endpoints
- Protocol-native access tiers: hold more tokens, pay less per request
- Agent-native token gating: AI agents that hold a specific token unlock mint or airdrop API endpoints

## How it works

1. Client sends a signed proof in the `token-gate` header (EIP-191 `personal_sign`)
2. Server verifies the signature, checks freshness, then reads the on-chain token balance
3. If the wallet holds the required tokens, access is granted without payment

Proof header value: base64-encoded JSON `{ address, domain, issuedAt, signature }`.

The proof is valid for 5 minutes by default (`proofMaxAge`). On-chain ownership results are cached for 5 minutes by default (`ownershipCacheTtl`) to avoid repeated RPC calls.

## Server setup

Register the resource server extension and declare it on routes so clients discover the token requirement automatically from 402 responses:

```typescript
import {
  createTokenGateExtension,
  declareTokenGateExtension,
} from '@x402/extensions/token-gate';
import { base } from 'viem/chains';

// Register on resource server
const resourceServer = new x402ResourceServer(facilitator)
  .registerExtension(createTokenGateExtension());

// Declare on specific routes
const routes = {
  '/api/data': {
    accepts: [{ scheme: 'exact', price: '$0.005', network: 'eip155:8453', payTo: ADDRESS }],
    extensions: {
      ...declareTokenGateExtension({
        contracts: [{ address: '0xYourNFT', chain: base, type: 'ERC-721' }],
        message: 'NFT holders get free access',
      }),
    },
  },
};
```

## Client setup

When the server returns a 402 with the `token-gate` extension, the client hook checks ownership and attaches a signed proof for the retry:

```typescript
import { createTokenGateClientHook } from '@x402/extensions/token-gate';

const httpClient = new x402HTTPClient(client)
  .onPaymentRequired(createTokenGateClientHook({ account }));
```

## TokenContract options

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | `0x${string}` | yes | Contract address |
| `chain` | `Chain` | yes | viem chain object (e.g. `base`) |
| `type` | `"ERC-20" \| "ERC-721"` | yes | Token standard |
| `minBalance` | `bigint` | no | Minimum balance required (default: `1n`) |
| `tokenId` | `bigint` | no | Specific ERC-721 token ID — uses `ownerOf()` |

## Discount mode

For a discount instead of free access:

```typescript
createTokenGateRequestHook({
  contracts: [...],
  access: { discount: 50 }, // 50% off
});
```

In discount mode the hook returns `void` (payment proceeds). Use a `DynamicPrice` function alongside it to apply the actual discount to the route price.

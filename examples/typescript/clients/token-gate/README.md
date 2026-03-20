# Token-Gate Client Example

Client demonstrating token-gated access with x402:
- Automatically checks on-chain token ownership when a server returns a `token-gate` 402
- Sends a signed EIP-191 proof on retry if the wallet holds the required token
- Falls back to normal x402 payment if the wallet is not a holder

```typescript
import { x402Client, x402HTTPClient, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { createTokenGateClientHook } from "@x402/extensions/token-gate";

const account = privateKeyToAccount(process.env.EVM_PRIVATE_KEY);

const client = new x402Client();
client.register("eip155:*", new ExactEvmScheme(account));

const httpClient = new x402HTTPClient(client).onPaymentRequired(
  createTokenGateClientHook({ account }),
);

const fetchWithPayment = wrapFetchWithPayment(fetch, httpClient);

// Token-gate hook fires automatically on 402 — no extra code needed per request
const weather = await fetchWithPayment("http://localhost:4022/weather");
```

## How It Works

1. **Client requests** a protected resource
2. **Server returns 402** with `token-gate` extension (contract address, chainId, domain)
3. **Hook reads the 402**, calls `balanceOf` (or `ownerOf`) on-chain to check ownership
4. **If holder** — hook signs an EIP-191 proof and retries with the `token-gate` header → free access
5. **If not holder** — hook returns `undefined`, normal x402 payment proceeds

On-chain ownership results are cached for 5 minutes to avoid repeated RPC calls.

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))
- EVM private key for payments and proof signing
- Running token-gate server (see [server example](../../servers/token-gate/))

## Setup

1. Copy `.env-local` to `.env`:

```bash
cp .env-local .env
```

and provide the required values:

- `EVM_PRIVATE_KEY` - Ethereum private key (used for both x402 payments and token-gate proof signing)
- `RESOURCE_SERVER_URL` - (Optional) Server URL (defaults to `http://localhost:4022`)

2. Install and build from the typescript examples root:

```bash
cd ../../
pnpm install && pnpm build
cd clients/token-gate
```

3. Start the token-gate server:

```bash
cd ../../servers/token-gate
pnpm dev
```

4. Run the client:

```bash
cd ../../clients/token-gate
pnpm start
```

## Expected Output

**Wallet holds the NFT:**

```
Client EVM address: 0x...
Server: http://localhost:4022

If this wallet holds the required NFT, all requests will be free.
Otherwise the client will pay $0.001 USDC per request.

--- /weather ---
1. First request...
   ✓ Free access via token-gate (NFT holder)
   Response: { weather: 'sunny', temperature: 72 }
2. Second request...
   ✓ Free access via token-gate (NFT holder)
   Response: { weather: 'sunny', temperature: 72 }

--- /joke ---
...

Done.
```

**Wallet does not hold the NFT:**

```
--- /weather ---
1. First request...
   ✓ Paid via payment settlement
   Payment details: { "success": true, "transaction": "0x...", ... }
   Response: { weather: 'sunny', temperature: 72 }
...
```

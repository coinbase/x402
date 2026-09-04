# Who-Lookup Client Example

Example client demonstrating `@x402/fetch` against a real, live x402-protected
endpoint on Base mainnet, so you can try the full 402 → pay → 200 flow without
standing up your own server first.

The endpoint is [`lookups.alienprobe.ai`](https://lookups.alienprobe.ai), a
third-party "who" lookup that resolves a company name, domain, or LEI to a
GLEIF legal-entity record for a fixed **$0.05 in USDC on Base mainnet**. It is
operated by a contributor to this repo, not by Coinbase or the x402
Foundation — see [DISCLAIMER](#disclaimer) below.

> **This example pays $0.05 USDC on Base MAINNET from the key in your `.env`.**
> It is the only example in this repo that spends real money by default —
> there is no testnet twin for this endpoint. It refuses to run unless you
> set `X402_ALLOW_MAINNET=1`. Never fund a mainnet key you would not lose.

```typescript
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const client = new x402Client();
client.register("eip155:*", new ExactEvmScheme(privateKeyToAccount(process.env.EVM_PRIVATE_KEY)));

const fetchWithPayment = wrapFetchWithPayment(fetch, client);

const response = await fetchWithPayment("https://lookups.alienprobe.ai/v1/lookup/who/apple.com");
console.log(await response.json());
```

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))
- An EVM wallet funded with a small amount of USDC on **Base mainnet**
  (`eip155:8453`) — this example spends real money, capped at $0.05 per run

## Setup

1. Install and build all packages from the typescript examples root:

```bash
cd ../../
pnpm install && pnpm build
cd clients/who-lookup
```

2. Copy `.env-local` to `.env` and add your private key:

```bash
cp .env-local .env
```

Required environment variables:

- `EVM_PRIVATE_KEY` - Ethereum private key funded with USDC on Base mainnet
- `X402_ALLOW_MAINNET` - Must be set to `1`. This example refuses to run
  without it, since it spends real money and has no testnet equivalent.

Optional environment variables:

- `RESOURCE_SERVER_URL` - Overrides the resource server (default: this example's live endpoint)
- `ENDPOINT_PATH` - Overrides the endpoint path (default: `/v1/lookup/who/apple.com`)
- `MAX_PAYMENT_ATOMIC` - Spend cap in atomic units of the priced asset (default: `"100000"`, i.e. $0.10 USDC).
  The example aborts via `onBeforePaymentCreation` rather than pay more than this, no matter what the server asks for.

3. Run the client:

```bash
pnpm start
```

## What to expect

- `GET /v1/lookup/who/apple.com` → 402, then a signed payment, then 200 with the resolved GLEIF record.
- `GET /v1/lookup/who/Acme` (ambiguous name) → 409, free, with up to five candidates and a hint to re-ask with a jurisdiction suffix. Try it by setting `ENDPOINT_PATH=/v1/lookup/who/Acme`.
- A malformed, unknown, or unreadable subject returns 400/404/503 — all free, before any payment is created.

## Disclaimer

`lookups.alienprobe.ai` is a third-party service run by a contributor to this
repository. It is not affiliated with, endorsed by, or operated by Coinbase
or the x402 Foundation. It is included here only as a cheap, real endpoint
newcomers can try the payment flow against.

## Next Steps

See [Advanced Examples](../advanced/) for builder pattern registration, payment lifecycle hooks, and network preferences.

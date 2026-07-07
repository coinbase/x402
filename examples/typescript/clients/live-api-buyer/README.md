# Live API Buyer Example

An x402 client example that calls a **live, production** x402-protected API instead of a
local demo server — so you can see the real 402 → pay → 200 flow end to end.

## What this demonstrates

Most x402 examples run against `localhost` servers started for the demo. This one targets
a real endpoint already running in production on Base mainnet, so every step — the 402
challenge, the payment signature, the settlement — is the real thing:

1. **Request** — the client calls the resource URL with `fetch`.
2. **402 Payment Required** — the server returns `402` with a `PAYMENT-REQUIRED` header
   encoding the price, network, asset, and payee for this specific resource.
3. **Sign** — `@x402/fetch`'s `wrapFetchWithPayment` decodes those requirements and has
   the registered scheme (`ExactEvmScheme`) sign a USDC payment authorization for them.
4. **Retry with payment** — the client retries the same request with a
   `PAYMENT-SIGNATURE` header attached.
5. **200 OK** — the server (via its facilitator) verifies and settles the payment onchain,
   then returns the actual response body plus a `PAYMENT-RESPONSE` settlement receipt.

The demo target is `https://api.stelardigital.com/pricecheck` (a live x402 API returning
crypto price/signal data) — used here only because it's a real, working endpoint. Point
`RESOURCE_URL` at any x402-protected API and the flow is identical.

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))
- An EVM wallet funded with a small amount of USDC on Base mainnet (this example spends
  real money — a few cents per request)

## Setup

1. Install and build all packages from the typescript examples root:

```bash
cd ../../
pnpm install && pnpm build
cd clients/live-api-buyer
```

2. Copy `.env-local` to `.env` and add your private key:

```bash
cp .env-local .env
```

Required environment variables:

- `EVM_PRIVATE_KEY` - Ethereum private key for the wallet paying on Base mainnet

Optional environment variables:

- `RESOURCE_URL` - the x402-protected URL to call (defaults to the live demo endpoint above)

3. Run the client:

```bash
pnpm start
```

You should see the request go out, the 402 challenge get resolved automatically, and the
final JSON response with a settlement receipt.

## Next Steps

See [`fetch/`](../fetch/) for the general-purpose `@x402/fetch` example (EVM + SVM, run
against a localhost server) and [`custom/`](../custom/) for a manual, header-by-header
implementation of the same flow using only `@x402/core`.

---

**Note:** this example spends real USDC on Base mainnet. Use a wallet with a small balance
dedicated to testing, never a wallet holding significant funds.

# Permit2 + CDP Facilitator Dogfooding Guide

Branch: `feat/permit2-cdp-dogfooding`

This branch wires the example servers and clients to use the **CDP Facilitator** on **Base mainnet** for Permit2 testing. All servers expose four endpoints that exercise different pricing/transfer flows, and all clients register `eip155:*` so they can pay against any of them.

## Prerequisites

- Node.js v20+, pnpm v10
- Go 1.24+
- A CDP API key pair from [Coinbase Developer Platform](https://www.coinbase.com/developer-platform) (needed for server-side verify/settle)
- An EVM private key with Base mainnet USDC for the client (the payer)
- An EVM address to receive payments (the payee, used by the server)

## What changed

### Servers (resource servers that charge for endpoints)

All four server examples (Express, Hono, Next, Gin) now:

1. Use the **CDP Facilitator** (`@coinbase/x402` package in TS, inline CDP auth provider in Go) instead of a manual `FACILITATOR_URL`. The facilitator URL defaults to `https://api.cdp.coinbase.com/platform/v2/x402`.
2. Run on **Base mainnet** (`eip155:8453`) with mainnet USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`).
3. Expose **four test endpoints** instead of the old single `/weather` route.

### Clients (payers that call the endpoints)

The axios, fetch, and Go HTTP example clients:

1. Register `eip155:*` (covers Base mainnet).
2. Default to `/protected-currency` but can be pointed at any endpoint via env var.
3. Stripped of Solana/Aptos/Stellar -- EVM only for this testing round.

## Test endpoints

Every server exposes the same four endpoints on port `4021`:

| Endpoint | Pricing style | Transfer method | Gas sponsorship |
|---|---|---|---|
| `GET /protected-currency` | `price: "$0.001"` (currency shorthand) | Default (EIP-3009) | None |
| `GET /protected-eip3009` | Long-form `{ amount: "1000", asset: USDC }` | EIP-3009 (`transferWithAuthorization`) | None |
| `GET /protected-eip2612` | Long-form + `assetTransferMethod: "permit2"` | Permit2 | EIP-2612 (`declareEip2612GasSponsoringExtension`) |
| `GET /protected-erc20` | Long-form + `assetTransferMethod: "permit2"` | Permit2 | Generic ERC-20 approval (`declareErc20ApprovalGasSponsoringExtension`) |

All endpoints also respond on `GET /health` (no payment required).

## Quick start

### 1. Pick a server

#### TypeScript (Express)

```bash
cd examples/typescript/servers/express
cp .env-local .env
```

Fill in `.env`:

```
EVM_ADDRESS=0xYourPayeeAddress
CDP_API_KEY_ID=your-cdp-key-id
CDP_API_KEY_SECRET=your-cdp-key-secret
```

Then from the `examples/typescript` root:

```bash
pnpm install && pnpm build
cd servers/express
pnpm dev
```

#### TypeScript (Hono)

Same steps, but `cd examples/typescript/servers/hono`.

#### TypeScript (Next.js)

Same env setup in `examples/typescript/fullstack/next/.env`, then:

```bash
cd examples/typescript/fullstack/next
pnpm dev
```

The four endpoints are protected page routes at `/protected-currency`, `/protected-eip3009`, `/protected-eip2612`, `/protected-erc20`, plus `GET /api/weather` as a `withX402`-wrapped API route.

#### Go (Gin)

```bash
cd examples/go/servers/gin
cp .env-example .env
```

Fill in `.env`:

```
EVM_PAYEE_ADDRESS=0xYourPayeeAddress
CDP_API_KEY_ID=your-cdp-key-id
CDP_API_KEY_SECRET=your-cdp-key-secret
```

Then:

```bash
go run .
```

The Go server defaults to `https://api.cdp.coinbase.com/platform/v2/x402` as the facilitator. You can override with `FACILITATOR_URL` if needed.

### 2. Pick a client

#### TypeScript (Axios)

```bash
cd examples/typescript/clients/axios
cp .env-local .env
```

Fill in `.env`:

```
EVM_PRIVATE_KEY=0xYourPrivateKeyWithBaseMainnetUSDC
RESOURCE_SERVER_URL=http://localhost:4021
ENDPOINT_PATH=/protected-eip2612
```

Then:

```bash
pnpm start
```

Change `ENDPOINT_PATH` to test each of the four endpoints.

#### TypeScript (Fetch)

Same pattern, `cd examples/typescript/clients/fetch`.

#### Go

```bash
cd examples/go/clients/http
cp .env-example .env
```

Fill in `.env`:

```
EVM_PRIVATE_KEY=0xYourPrivateKeyWithBaseMainnetUSDC
SERVER_URL=http://localhost:4021/protected-eip2612
```

Then:

```bash
go run .
```

## What to test

For each endpoint, confirm:

1. A `402 Payment Required` response is returned when no payment header is present.
2. The client successfully signs, the facilitator verifies+settles, and you get a `200` with a `PAYMENT-RESPONSE` header.
3. The settlement transaction appears on [Base mainnet Basescan](https://basescan.org/).

### Priority test matrix

| # | Endpoint | What it exercises |
|---|---|---|
| 1 | `/protected-eip2612` | Permit2 flow with EIP-2612 gasless approval -- the primary permit2 path for USDC |
| 2 | `/protected-erc20` | Permit2 flow with generic ERC-20 `approve()` gas sponsorship -- fallback for non-EIP-2612 tokens |
| 3 | `/protected-currency` | Standard currency shorthand (should resolve to EIP-3009 under the hood) |
| 4 | `/protected-eip3009` | Explicit EIP-3009 long-form -- baseline, same as currency but with explicit asset definition |

### Failure modes to watch for

- **Missing CDP credentials on server**: should fail with a clear error at verify/settle time, not silently.
- **Insufficient USDC on client wallet**: should get a verify failure explaining the balance issue.
- **Permit2 approval missing**: the EIP-2612 endpoint should handle this via gas-sponsored approval; the ERC-20 endpoint should handle it via a sponsored `approve()` tx.

## File reference

| Role | Path |
|---|---|
| Express server | `examples/typescript/servers/express/index.ts` |
| Hono server | `examples/typescript/servers/hono/index.ts` |
| Next.js proxy | `examples/typescript/fullstack/next/proxy.ts` |
| Gin server | `examples/go/servers/gin/main.go` |
| Axios client | `examples/typescript/clients/axios/index.ts` |
| Fetch client | `examples/typescript/clients/fetch/index.ts` |
| Go HTTP client | `examples/go/clients/http/main.go` |

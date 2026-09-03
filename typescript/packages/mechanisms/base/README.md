# `@x402/base` [![npm version](https://img.shields.io/npm/v/%40x402%2Fbase.svg)](https://www.npmjs.com/package/@x402/base)

Base (`eip155:8453` mainnet / `eip155:84532` Sepolia) implementation of the x402 payment protocol.

## Installation

```bash
npm install @x402/base
```

## Overview

`@x402/base` provides Base-specific mechanisms for the `exact`, `upto`, `auth-capture`, and
`batch-settlement` payment schemes. Today it is a thin pass-through wrapper around
[`@x402/evm`](../evm) — Base is fully EVM-compatible and has no protocol-level differences from
generic EVM chains yet, so every method simply delegates to the underlying `@x402/evm`
implementation.

This package exists as an explicit, overridable seam: registering `@x402/base`'s schemes against
`eip155:8453` / `eip155:84532` (instead of, or alongside, `@x402/evm`'s `eip155:*` wildcard) lets
Base-specific behavior be introduced later — a different gas-sponsoring strategy, a different
default asset transfer method, etc. — without changing the public API or requiring consumers to
switch schemes.

## Network Scope

`@x402/base` is scoped to exactly two networks: `eip155:8453` (Base) and `eip155:84532` (Base
Sepolia). Because the underlying `@x402/evm` schemes are generic across the entire `eip155:*`
family, `@x402/base` enforces this scope itself at runtime rather than relying solely on the
`@x402/core` registration key — a `BaseScheme` reached via a wildcard registration, or called
directly, would otherwise silently process payments for any EVM chain.

- Value-affecting methods (`createPaymentPayload`, `verify`, `settle`, `parsePrice`,
  `enhancePaymentRequirements`, `buildChannelConfig`, `createChannelManager`) throw for any other
  network.
- Metadata reads (`getAssetDecimals`, `getExtra`, `getSigners`, `findDefaultAsset`) fail closed,
  returning `undefined` / `[]` instead of throwing.
- `validateFacilitatorSupport` reports a problem string for a mis-registered network, which
  `@x402/core` surfaces as a startup error from `x402ResourceServer.initialize()` instead of at
  first payment.

See [`src/networks.ts`](./src/networks.ts) (`isBaseNetwork`, `assertBaseNetwork`,
`findBaseDefaultAsset`) for the shared implementation, exported from the package root.

- **Client** - For applications that need to make payments (have wallets/signers)
- **Server** - For resource servers that accept payments and build payment requirements
- **Facilitator** - For payment processors that verify and settle on-chain transactions

## Package Exports

| Scheme | Role | Import | Class |
|--------|------|--------|-------|
| Exact (fixed-price) | Client | `@x402/base/exact/client` | `BaseScheme` |
| Exact (fixed-price) | Server | `@x402/base/exact/server` | `BaseScheme` |
| Exact (fixed-price) | Facilitator | `@x402/base/exact/facilitator` | `BaseScheme` |
| Upto (usage-based) | Client | `@x402/base/upto/client` | `BaseScheme` |
| Upto (usage-based) | Server | `@x402/base/upto/server` | `BaseScheme` |
| Upto (usage-based) | Facilitator | `@x402/base/upto/facilitator` | `BaseScheme` |
| AuthCapture (refundable) | Client | `@x402/base/auth-capture/client` | `BaseScheme` |
| Batch-Settlement (payment channels) | Client | `@x402/base/batch-settlement/client` | `BaseScheme` |
| Batch-Settlement (payment channels) | Server | `@x402/base/batch-settlement/server` | `BaseScheme` |
| Batch-Settlement (payment channels) | Facilitator | `@x402/base/batch-settlement/facilitator` | `BaseScheme` |

AuthCapture is client-only today — `@x402/evm` has no server/facilitator implementation yet.

See [`src/exact/README.md`](./src/exact/README.md), [`src/upto/README.md`](./src/upto/README.md),
[`src/auth-capture/README.md`](./src/auth-capture/README.md), and
[`src/batch-settlement/README.md`](./src/batch-settlement/README.md) for usage details.

## Usage

```typescript
import { x402Client } from "@x402/core/client";
import { BaseScheme as BaseExactScheme } from "@x402/base/exact/client";
import { BaseScheme as BaseUptoScheme } from "@x402/base/upto/client";
import { privateKeyToAccount } from "viem/accounts";

const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);

const client = new x402Client()
  .register("eip155:8453", new BaseExactScheme(signer)) // fixed-price services
  .register("eip155:8453", new BaseUptoScheme(signer)); // usage-based services
```

Constructor arguments, signer types, and options are identical to `@x402/evm`'s `ExactEvmScheme` /
`UptoEvmScheme` — `BaseScheme` re-exports and forwards to the same underlying types.

## Signers

Every scheme's client/facilitator constructor takes a `BaseClientSigner` / `BaseFacilitatorSigner`
— Base-branded aliases of `@x402/evm`'s `ClientEvmSigner` / `FacilitatorEvmSigner` (a Base wallet
is just an EVM wallet). The package root also re-exports the `@x402/evm` adapter helpers under
Base-branded names so nothing `Evm`-named needs to be imported directly from `@x402/evm`:

```typescript
import { toBaseClientSigner, toBaseFacilitatorSigner } from "@x402/base";
```

## Development

```bash
# Build
npm run build

# Test
npm run test

# Integration tests
npm run test:integration

# Lint & Format
npm run lint
npm run format
```

## Related Packages

- `@x402/core` - Core protocol types and client
- `@x402/evm` - Generic EVM (`eip155:*`) implementation that this package wraps
- `@x402/fetch` - HTTP wrapper with automatic payment handling

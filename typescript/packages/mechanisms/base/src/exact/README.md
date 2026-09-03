# Exact Base Scheme (`@x402/base/exact`)

The **exact** scheme is the default x402 payment scheme for Base. The client pays the exact
advertised price — no more, no less.

Today, `@x402/base`'s `exact` scheme is a thin pass-through wrapper around
[`@x402/evm`'s `exact` scheme](../../../evm/src/exact/README.md) — every method delegates to an
internal `ExactEvmScheme` instance from `@x402/evm`. Constructor arguments, signer requirements,
supported transfer methods (EIP-3009 and Permit2), and gas-sponsoring extensions are all identical
to `@x402/evm` — see that package's docs for the full behavior. This package exists as an
explicit, overridable seam for introducing Base-specific behavior later without changing the
public API.

## Import Paths

| Role | Import |
|------|--------|
| Client | `@x402/base/exact/client` |
| Server | `@x402/base/exact/server` |
| Facilitator | `@x402/base/exact/facilitator` |

## Client Usage

Register `BaseScheme` with an `x402Client` to automatically handle payments for Base services
that use the `exact` scheme.

```typescript
import { x402Client } from "@x402/core/client";
import { BaseScheme } from "@x402/base/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);

const client = new x402Client()
  .register("eip155:8453", new BaseScheme(signer))
  .register("eip155:84532", new BaseScheme(signer));
```

The client selects between EIP-3009 and Permit2 based on `paymentRequirements.extra.assetTransferMethod`
(defaults to `eip3009`) — identical to `@x402/evm`.

## Server Usage

Register `BaseScheme` with an `x402ResourceServer` to protect routes with fixed-price payments
on Base.

```typescript
import { x402ResourceServer } from "@x402/core/server";
import { BaseScheme } from "@x402/base/exact/server";

const server = new x402ResourceServer(facilitatorClient);
server.register("eip155:8453", new BaseScheme());
server.register("eip155:84532", new BaseScheme());
```

In your route config, set `scheme: "exact"` and `price` to the fixed amount:

```typescript
{
  "GET /weather": {
    accepts: {
      scheme: "exact",
      price: "$0.001",
      network: "eip155:84532",
      payTo: "0xYourAddress",
    },
  },
}
```

## Facilitator Usage

```typescript
import { BaseScheme } from "@x402/base/exact/facilitator";

const scheme = new BaseScheme(facilitatorSigner);
```

## Supported Networks

| Network | CAIP-2 ID |
|---------|-----------|
| Base Mainnet | `eip155:8453` |
| Base Sepolia | `eip155:84532` |

## See Also

- [`@x402/evm` Exact Scheme](../../../evm/src/exact/README.md) — the implementation this package wraps
- [x402 Docs: Quickstart for Sellers](https://docs.x402.org/getting-started/quickstart-for-sellers)
- [x402 Docs: Quickstart for Buyers](https://docs.x402.org/getting-started/quickstart-for-buyers)
- [Exact EVM Scheme Specification](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md)

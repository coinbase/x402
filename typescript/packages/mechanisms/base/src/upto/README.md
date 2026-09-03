# Upto Base Scheme (`@x402/base/upto`)

The **upto** scheme enables usage-based billing on Base. The client authorizes a **maximum**
payment amount, but the server settles **only what was actually used** — ideal for variable-cost
endpoints like LLM token generation, compute time, or bandwidth metering.

Today, `@x402/base`'s `upto` scheme is a thin pass-through wrapper around
[`@x402/evm`'s `upto` scheme](../../../evm/src/upto/README.md) — every method delegates to an
internal `UptoEvmScheme` instance from `@x402/evm`. Constructor arguments, signer requirements,
the Permit2-only transfer method, and gas-sponsoring extensions are all identical to `@x402/evm` —
see that package's docs for the full behavior. This package exists as an explicit, overridable
seam for introducing Base-specific behavior later without changing the public API.

## Import Paths

| Role | Import |
|------|--------|
| Client | `@x402/base/upto/client` |
| Server | `@x402/base/upto/server` |
| Facilitator | `@x402/base/upto/facilitator` |

## Client Usage

Register `BaseScheme` with an `x402Client` to handle payments for Base services that use the
`upto` scheme.

```typescript
import { x402Client } from "@x402/core/client";
import { BaseScheme as BaseExactScheme } from "@x402/base/exact/client";
import { BaseScheme as BaseUptoScheme } from "@x402/base/upto/client";
import { privateKeyToAccount } from "viem/accounts";

const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);

const client = new x402Client();
client.register("eip155:8453", new BaseExactScheme(signer)); // fixed-price services
client.register("eip155:8453", new BaseUptoScheme(signer)); // usage-based services
```

### Key Difference from Exact

The upto client requires `paymentRequirements.extra.facilitatorAddress` (provided automatically by
the facilitator via `getExtra()`). This address is embedded in the Permit2 witness so only the
designated facilitator can settle the payment — identical to `@x402/evm`.

## Server Usage

Register `BaseScheme` with an `x402ResourceServer` and use `setSettlementOverrides` in your
handler to specify the actual charge.

```typescript
import { x402ResourceServer } from "@x402/core/server";
import { BaseScheme } from "@x402/base/upto/server";

const server = new x402ResourceServer(facilitatorClient).register("eip155:84532", new BaseScheme());

// In your route config, `price` is the maximum authorized amount:
const routes = {
  "GET /api/generate": {
    accepts: {
      scheme: "upto",
      price: "$0.10", // client authorizes up to 10 cents
      network: "eip155:84532",
      payTo: "0xYourAddress",
    },
    description: "AI text generation — billed by token usage",
  },
};
```

Settlement override formats (`setSettlementOverrides`) are identical to `@x402/evm` — see the
[`@x402/evm` upto docs](../../../evm/src/upto/README.md#settlement-override-formats).

## Facilitator Usage

```typescript
import { BaseScheme } from "@x402/base/upto/facilitator";

const scheme = new BaseScheme(facilitatorSigner);
```

The upto facilitator's `getExtra()` returns a `facilitatorAddress` that the client embeds in the
signed Permit2 witness. Only this address can call `settle()` on the upto proxy contract.

## Supported Networks

| Network | CAIP-2 ID |
|---------|-----------|
| Base Mainnet | `eip155:8453` |
| Base Sepolia | `eip155:84532` |

## See Also

- [`@x402/evm` Upto Scheme](../../../evm/src/upto/README.md) — the implementation this package wraps
- [Exact Base Scheme](../exact/README.md) — fixed-price payments
- [x402 Docs: Payment Schemes](https://docs.x402.org/getting-started/quickstart-for-sellers#payment-schemes-exact-vs-upto)
- [x402 Docs: Quickstart for Sellers](https://docs.x402.org/getting-started/quickstart-for-sellers)
- [x402 Docs: Quickstart for Buyers](https://docs.x402.org/getting-started/quickstart-for-buyers)

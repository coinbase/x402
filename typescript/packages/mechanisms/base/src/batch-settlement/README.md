# Batch-Settlement Base Scheme (`@x402/base/batch-settlement`)

The **batch-settlement** scheme implements payment channels: the client deposits funds once into a
channel (an onchain `x402BatchSettlement` contract), then signs cheap, gasless EIP-712 vouchers for
each subsequent request. The facilitator claims vouchers in batches, amortizing gas across many
requests — ideal for high-frequency, low-value payments (metering, streaming, per-request APIs).

Today, `@x402/base`'s `batch-settlement` scheme is a thin pass-through wrapper around
[`@x402/evm`'s `batch-settlement` scheme](../../../evm/src/batch-settlement/README.md) — every
method delegates to an internal `BatchSettlementEvmScheme` instance from `@x402/evm`. Constructor
arguments, channel/voucher/deposit mechanics, and storage backends are all identical to
`@x402/evm` — see that package's docs for the full behavior. This package exists as an explicit,
overridable seam for introducing Base-specific behavior later without changing the public API.

## Import Paths

| Role | Import |
|------|--------|
| Client | `@x402/base/batch-settlement/client` |
| Server | `@x402/base/batch-settlement/server` |
| Facilitator | `@x402/base/batch-settlement/facilitator` |

## Client Usage

```typescript
import { x402Client } from "@x402/core/client";
import { BaseScheme } from "@x402/base/batch-settlement/client";
import { privateKeyToAccount } from "viem/accounts";

const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);

const client = new x402Client();
client.register("eip155:8453", new BaseScheme(signer, { depositPolicy: { depositMultiplier: 5 } }));
```

The client automatically deposits (bundled with the first voucher) when a channel has no balance
or needs a top-up, and signs voucher-only payloads for subsequent requests against the same
channel. Cooperative refunds are available via `client.refund(url)`.

## Server Usage

```typescript
import { x402ResourceServer } from "@x402/core/server";
import { BaseScheme } from "@x402/base/batch-settlement/server";

const server = new x402ResourceServer(facilitatorClient);
server.register(
  "eip155:84532",
  new BaseScheme("0xYourReceiverAddress", { receiverAuthorizerSigner }),
);
```

The server must either configure its own `receiverAuthorizerSigner` or use a facilitator that
advertises one via `getExtra()` — see
[`@x402/evm`'s batch-settlement docs](../../../evm/src/batch-settlement/README.md) for the
receiver-authorizer delegation model and channel storage options (in-memory, file, Redis).

## Facilitator Usage

```typescript
import { BaseScheme } from "@x402/base/batch-settlement/facilitator";

const scheme = new BaseScheme(facilitatorSigner, authorizerSigner);
```

The facilitator verifies deposits/vouchers and settles deposits, claims, batch settlements, and
refunds onchain against the deployed `x402BatchSettlement` contract.

## Supported networks

| Network | CAIP-2 ID |
|---------|-----------|
| Base Mainnet | `eip155:8453` |
| Base Sepolia | `eip155:84532` |

## See Also

- [`@x402/evm` Batch-Settlement Scheme](../../../evm/src/batch-settlement/README.md) — the implementation this package wraps
- [Exact Base Scheme](../exact/README.md) — fixed-price payments
- [Upto Base Scheme](../upto/README.md) — usage-based payments

# Upto EVM Scheme (`@x402/evm/upto`)

The **upto** scheme enables usage-based billing on EVM networks. The client authorizes a **maximum** payment amount, but the server settles **only what was actually used**. This is ideal for variable-cost endpoints like LLM token generation, compute time, or bandwidth metering.

Supports two asset transfer methods:

- **Permit2** (the default when `assetTransferMethod` is omitted) works with any ERC-20.
- **EIP-3009** is selected explicitly with `assetTransferMethod: "eip3009"` and signs
  `ReceiveWithAuthorization` to the canonical upto ERC-3009 proxy.

Both proxy contracts accept the actual settlement amount, allowing the facilitator to settle any amount up to the signed maximum.

## Import Paths

| Role | Import |
|------|--------|
| Client | `@x402/evm/upto/client` |
| Server | `@x402/evm/upto/server` |
| Facilitator | `@x402/evm/upto/facilitator` |

## Client Usage

Register `UptoEvmScheme` with an `x402Client` to handle payments for services that use the `upto` scheme. From the buyer's perspective, usage is transparent — the SDK signs a max-authorization and the server charges only what was consumed.

```typescript
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { UptoEvmScheme } from "@x402/evm/upto/client";
import { privateKeyToAccount } from "viem/accounts";

const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);

const client = new x402Client();
client.register("eip155:*", new ExactEvmScheme(signer)); // fixed-price services
client.register("eip155:*", new UptoEvmScheme(signer));  // usage-based services
```

### Key Difference from Exact

Permit2 requirements use `paymentRequirements.extra.facilitatorAddress`. Explicit EIP-3009
requirements use the token EIP-712 `name` and `version` plus
`paymentRequirements.extra.settlerAddress`. The facilitator provides both settlement-address keys
through `getExtra()`.

The EIP-3009 payload signs `ReceiveWithAuthorization` to
`0x40203Fa50150e6ec970DE91F3330e82cDF640006`. Its nonce commits to `payTo`, `settler`, and a
fresh salt, preventing any of those fields from being changed after signing.

## Server Usage

Register `UptoEvmScheme` with an `x402ResourceServer` and use `setSettlementOverrides` in your handler to specify the actual charge.

```typescript
import { paymentMiddleware, setSettlementOverrides, x402ResourceServer } from "@x402/express";
import { UptoEvmScheme } from "@x402/evm/upto/server";

const server = new x402ResourceServer(facilitatorClient)
  .register("eip155:84532", new UptoEvmScheme());

// In your route config, `price` is the maximum authorized amount:
const routes = {
  "GET /api/generate": {
    accepts: {
      scheme: "upto",
      price: "$0.10",           // client authorizes up to 10 cents
      network: "eip155:84532",
      payTo: "0xYourAddress",
    },
    description: "AI text generation — billed by token usage",
  },
};

// In your handler, settle the actual usage:
app.get("/api/generate", (req, res) => {
  const actualUsage = computeActualCost(); // your billing logic
  setSettlementOverrides(res, { amount: String(actualUsage) });
  res.json({ result: "..." });
});
```

### Settlement Override Formats

The `amount` in `setSettlementOverrides` supports three formats:

| Format | Example | Description |
|--------|---------|-------------|
| Raw atomic units | `"50000"` | Settles exactly 50,000 atomic units |
| Percentage | `"50%"` | Settles 50% of the authorized maximum |
| Dollar price | `"$0.05"` | Converts to atomic units (when route used `$` pricing) |

Setting `amount` to `"0"` skips on-chain settlement entirely — the client is not charged.

## Facilitator Usage

For custom facilitator implementations:

```typescript
import { UptoEvmScheme } from "@x402/evm/upto/facilitator";

const scheme = new UptoEvmScheme({ signers: [wallet] });
```

The upto facilitator's `getExtra()` selects one signer and returns it as both
`facilitatorAddress` and `settlerAddress`. Permit2 embeds it in the witness; EIP-3009 commits to it
through the authorization nonce. Only the selected address can settle.

## Supported Networks

Works on EIP-155 networks where the proxy for the selected asset transfer method is deployed:

| Network | CAIP-2 ID |
|---------|-----------|
| Base Mainnet | `eip155:8453` |
| Base Sepolia | `eip155:84532` |

## How It Works

1. Server advertises `scheme: "upto"` with a max `price`
2. Client signs either a Permit2 maximum or an EIP-3009 `ReceiveWithAuthorization` maximum
3. Server performs work, calculates actual cost
4. Server calls `setSettlementOverrides` with the actual amount
5. Facilitator settles on-chain for the actual amount (≤ max)
6. If actual amount is `0`, no on-chain transaction occurs

## Gas Sponsoring Extensions

The Permit2 path supports both gas sponsoring extensions. These let the **facilitator** pay for the client's Permit2 approval transaction, removing all gas costs from the client. The client SDK detects advertised extensions automatically. The EIP-3009 path does not need an approval transaction and does not use these extensions.

### EIP-2612 Gas Sponsoring

The preferred path. If the payment token supports [EIP-2612](https://eips.ethereum.org/EIPS/eip-2612), the client signs an off-chain permit and the facilitator bundles approval + settlement in a single `settleWithPermit` call — zero gas for the client.

**Server:** Declare the extension in your route config:

```typescript
import { declareEip2612GasSponsoringExtension } from "@x402/extensions";

{
  "GET /api/generate": {
    accepts: {
      scheme: "upto",
      price: "$0.10",
      network: "eip155:84532",
      payTo: "0xYourAddress",
    },
    extensions: {
      ...declareEip2612GasSponsoringExtension(),
    },
  },
}
```

**Client:** No additional setup. `UptoEvmScheme` automatically checks for the extension and signs the permit when applicable.

**Facilitator:** Register the extension:

```typescript
import { EIP2612_GAS_SPONSORING } from "@x402/extensions";

facilitator.registerExtension(EIP2612_GAS_SPONSORING);
```

### ERC-20 Approval Gas Sponsoring

Fallback for tokens that do not support EIP-2612. The client signs a raw `approve(Permit2, MaxUint256)` transaction off-chain; the facilitator broadcasts it before settling.

**Server:** Declare the extension (omit `name`/`version` from token config to signal non-EIP-2612 tokens):

```typescript
import { declareErc20ApprovalGasSponsoringExtension } from "@x402/extensions";

{
  "GET /api/generate": {
    accepts: { /* ... */ },
    extensions: {
      ...declareErc20ApprovalGasSponsoringExtension(),
    },
  },
}
```

**Client:** The signer must support transaction signing (`signTransaction`, `getTransactionCount`). `UptoEvmScheme` falls back to this when EIP-2612 is unavailable.

**Facilitator:** Register with a signer that can broadcast transactions:

```typescript
import { createErc20ApprovalGasSponsoringExtension } from "@x402/extensions";

facilitator.registerExtension(createErc20ApprovalGasSponsoringExtension(erc20ApprovalSigner));
```

### Extension Priority

When both extensions are advertised, EIP-2612 takes priority. The client tries EIP-2612 first; if the token lacks `name`/`version` in `extra`, it falls back to ERC-20 approval gas sponsoring.

## Examples

- [Express upto server](https://github.com/x402-foundation/x402/tree/main/examples/typescript/servers/upto)

## See Also

- [Exact EVM Scheme](../exact/README.md) — fixed-price payments
- [x402 Docs: Payment Schemes](https://docs.x402.org/getting-started/quickstart-for-sellers#payment-schemes-exact-vs-upto)
- [x402 Docs: Quickstart for Sellers](https://docs.x402.org/getting-started/quickstart-for-sellers)
- [x402 Docs: Quickstart for Buyers](https://docs.x402.org/getting-started/quickstart-for-buyers)

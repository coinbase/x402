# Local Stablecoins with x402

x402 is asset-agnostic by design. While USDC is the default payment token, any ERC-20 can be used as a payment asset. This guide shows how to accept and pay with **local currency stablecoins** — tokens pegged to currencies like the Argentine Peso (ARS), Brazilian Real (BRL), or Colombian Peso (COP).

## Why Local Stablecoins Matter for Agents

When an AI agent operating in Argentina needs to pay for a local API, forcing it through USD creates unnecessary friction:

- **FX conversion costs** eat into every transaction
- **Price instability** — local services priced in USD must constantly adjust
- **Regulatory complexity** — some jurisdictions prefer local-currency settlement

Local stablecoins solve this by letting agents pay in the currency the service is naturally priced in. An agent querying Argentine market data pays in wARS. An agent accessing Brazilian logistics APIs pays in wBRL. No conversion, no friction.

## Available Local Stablecoins

| Token | Currency | Chain | Address | Decimals |
|-------|----------|-------|---------|----------|
| wARS | Argentine Peso (ARS) | Base | `0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D` | 18 |

wARS is part of the [latam-stables](https://github.com/ripio/latam-stables) project by [Ripio](https://ripio.com) — Foundry-based contracts with cross-chain bridge infrastructure. More local stablecoins (wBRL, wCOP, wMXN) are in development.

## How It Works

x402's `PaymentRequirements` include an `asset` field — the token contract address. When a server specifies wARS as the asset, clients pay in wARS. The protocol doesn't care what the token represents; it just moves ERC-20 tokens from buyer to seller.

### Payment Flow

Most local stablecoins implement [EIP-2612](https://eips.ethereum.org/EIPS/eip-2612) (`permit`) rather than [EIP-3009](https://eips.ethereum.org/EIPS/eip-3009) (`transferWithAuthorization`). This means they use the **Permit2** flow:

1. Client requests a resource → server responds with `402 Payment Required`
2. Payment requirements specify the wARS token address and amount
3. Client signs a [Permit2](https://github.com/Uniswap/permit2) authorization
4. Facilitator verifies the signature and settles on-chain
5. Server delivers the resource

The client needs Permit2 approval for the token (a one-time on-chain transaction), after which all payments are gasless signatures.

## Server Setup

Use `registerMoneyParser` to price your API in local currency:

```typescript
import { ExactEvmScheme } from "@x402/evm/exact/server";

const WARS_BASE = {
  address: "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D",
  symbol: "wARS",
  decimals: 18,
};

const evmScheme = new ExactEvmScheme().registerMoneyParser(
  async (amount, network) => {
    if (network !== "eip155:8453") return null;

    return {
      amount: BigInt(Math.round(amount * 10 ** WARS_BASE.decimals)).toString(),
      asset: WARS_BASE.address,
      extra: {
        token: WARS_BASE.symbol,
        assetTransferMethod: "permit2",
      },
    };
  }
);
```

Then price your endpoints in ARS:

```typescript
app.use(
  paymentMiddleware(
    {
      "GET /cotizacion": {
        accepts: {
          scheme: "exact",
          price: 1500, // 1500 ARS
          network: "eip155:8453",
          payTo: evmAddress,
        },
        description: "Argentine market data",
      },
    },
    new x402ResourceServer(facilitatorClient).register("eip155:8453", evmScheme),
  ),
);
```

## Client Setup

Clients don't need special configuration for local stablecoins. The standard x402 client handles Permit2 automatically:

```typescript
import { withX402 } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";

const x402Fetch = withX402(fetch, {
  "eip155:8453": new ExactEvmScheme(signer),
});

// Just fetch — x402 handles payment in wARS automatically
const response = await x402Fetch("https://api.example.com/cotizacion");
```

The client wallet needs:
1. wARS token balance
2. One-time Permit2 approval for wARS (or the facilitator can sponsor this via EIP-2612 gas sponsoring)

## Adding Your Own Local Stablecoin

Any ERC-20 token can be used with x402. To add a new local stablecoin:

1. **Deploy your token** as a standard ERC-20 (EIP-2612 permit support recommended)
2. **Create a money parser** that maps your currency to the token (see server example above)
3. **Set `assetTransferMethod: "permit2"`** in the `extra` field if your token doesn't support EIP-3009

The x402 protocol handles the rest — verification, settlement, and the client payment flow all work with any ERC-20.

## Full Examples

- [Server example](../../examples/typescript/servers/advanced/local-stablecoin.ts) — Express server accepting wARS
- [Client example](../../examples/typescript/clients/advanced/local-stablecoin.ts) — Agent paying with wARS

## Related

- [Custom Money Definitions](../../examples/typescript/servers/advanced/custom-money-definition.ts)
- [EIP-2612 Gas Sponsoring](../../examples/typescript/servers/advanced/eip2612-gas-sponsoring.ts)
- [x402 Specification](../specs/x402-specification-v2.md)

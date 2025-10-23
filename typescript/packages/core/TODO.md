

# TODO

## x402Client

### Add policy based payment requirements filtering

1. Add `addPolicy` function to `x402Client`
Allows the passing of a func that takes a payment requirement and returns true/false about whether the payment should be included or excluded

```typescript
client
  .addPolicy(paymentReq => paymentReq.maxAmountRequired <= 100_000)
  .addPolicy(paymentReq => paymentReq.network !== "eip155:1") // no mainnet
  .addPolicy((paymentReq, context) => context.timestamp > startTime);
```

*Note*: This does enable the package to export policy builder funcs that could assist in making lambda chaining more readeable
e.g. export
     `blacklist(key: 'asset' | 'payTo' | 'network' | 'extra.${string}', values: string[]) => ((paymentReq: PaymentRequirement) => boolean)`
     `whitelist(key: 'asset' | 'payTo' | 'network' | 'extra.${string}', values: string[]) => ((paymentReq: PaymentRequirements) => boolean)`
     `matches(paymentReq: Partial<PaymentRequirements>) => ((paymentReq: PaymentRequirements) => boolean)`
and then you could have:
```typescript
client
  .addPolicy(whitelist('asset', [ /* Tokens you actually hold in your wallet */]))
  .addPolicy(whitelist('payTo', [ /* List of trusted vendors */]))
```

```typescript
client
  .registerScheme('eip155:*', new ExactEvmClient(signer))
  .addPolicy(matches({
    network: `eip155:1`,
    asset: '0x...',
  }))
  .addPolicy(whitelist('payTo', [ /* List of trusted vendors */]))
```

## x402HTTPResourceServer

### Hooks

A hooks system that powers the middleware allowing custom logic injection at critical payment flow points. Six hooks cover the entire payment lifecycle, with `onSettlementFailure` being the most critical for handling irreversible side effects.

```typescript
paymentMiddleware(payTo, routes, facilitator, {
  beforeVerification: async ({ requirements, payload, request }) => {},
  afterVerification: async ({ requirements, payload, request }) => {},
  beforeSettlement: async ({ requirements, payload, request }) => {},
  afterSettlement: async ({ requirements, payload, request, response }) => {},
  onSettlementFailure: async ({ requirements, payload, request, response }) => {},
  onVerificationFailure: async ({ requirements, payload, request, response }) => {}
});
```

### Dynamic Pricing in RouteConfig

Price to be a callback function that determines pricing at runtime based on request context.

```typescript
{
  "/api/data": {
    price: async (request) => {
      const tier = request.query.tier;
      return tier === "premium" ? "$0.10" : "$0.01";
    },
    payTo: "0x209693Bc6afc0C5329bA36FaF03C514EF312287C",
    network: "eip155:84532"
  }
}
```

### Dynamic PayTo in RouteConfig

The `payTo` parameter to be a callback function that determines the payment recipient at runtime based on request context.

```typescript
{
  "/api/data": {
    payTo: async (request) => {
      const productId = request.body.productId;
      const sellerAddress = await getSellerAddress(productId);
      return sellerAddress; // Returns address string
    },
    price: "$0.10",
    network: "eip155:84532"
  }
}
```
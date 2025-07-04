# x402 Paywall

Automatic wallet connection and payment UI for x402 middleware-enabled servers. Handles wallet connection, network switching, balance checking, and payment processing.

```typescript
export const middleware = paymentMiddleware(
  address,
  {
    "/protected": { price: "$0.01" },
  },
  {
    appLogo: "/logos/your-app.png",         // Optional
    appName: "Your App Name",               // Optional
    cdpClientKey: "your-cdp-client-key",    // Optional: Enhanced RPC
  },
);
```

## Features

**Wallet Connection & Payment Processing:** Supports Coinbase Smart Wallet, Coinbase EOA, MetaMask, Phantom, Rabby, Trust Wallet, and Frame. Includes x402 payment processing by default.

**Enhanced RPC** (optional): Add `cdpClientKey` to use Coinbase's hosted RPC infrastructure for improved performance.

## Configuration Options

| Option | Description |
|--------|-------------|
| `appLogo` | Logo URL for wallet selection modal (optional, defaults to no logo) |
| `appName` | App name displayed in wallet selection modal (optional, defaults to "Dapp") |
| `cdpClientKey` | [Coinbase Developer Platform Client API Key](https://docs.cdp.coinbase.com/get-started/docs/cdp-api-keys) for enhanced RPC |


## Usage

The paywall automatically loads when a browser attempts to access a protected route configured in your middleware.

![](../../../../../static/paywall.jpg)

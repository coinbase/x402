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
    cdpProjectId: "your-cdp-project-id",    // Optional: Fund button
  },
);
```

## Features

**Wallet Connection & Payment Processing:** Supports Coinbase Smart Wallet, Coinbase EOA, MetaMask, Phantom, Rabby, Trust Wallet, and Frame. Includes x402 payment processing by default.

**Enhanced RPC** (optional): Add `cdpClientKey` to use Coinbase's hosted RPC infrastructure for improved performance.

**Fund/Onramp Button** (optional): Add `cdpProjectId` to enable onramp functionality in the wallet dropdown. Provides Coinbase Smart Wallet Fund flow or Coinbase Onramp depending on wallet type. This is only available on Base mainnet.

## Configuration Options

| Option | Description |
|--------|-------------|
| `appLogo` | Logo URL for wallet selection modal (optional, defaults to no logo) |
| `appName` | App name displayed in wallet selection modal (optional, defaults to "Dapp") |
| `cdpClientKey` | [Coinbase Developer Platform Client API Key](https://docs.cdp.coinbase.com/get-started/docs/cdp-api-keys) for enhanced RPC |
| `cdpProjectId` | [Coinbase Developer Platform Project ID](https://docs.base.org/onchainkit/config/onchainkit-provider#project-id) for Fund/Onramp button |


## Usage

The paywall automatically loads when a browser attempts to access a protected route configured in your middleware.

![](../../../../../static/paywall.jpg)

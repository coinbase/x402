# x402 Paywall

The x402 paywall is designed to work with x402 middleware-enabled servers and handles wallet connection, network switching, USDC balance checking, and payment processing automatically.

## Configuration

### CDP Client Key

You can optionally include a [CDP Client API Key](https://docs.cdp.coinbase.com/get-started/docs/cdp-api-keys) from the [Coinbase Developer Platform](https://portal.cdp.coinbase.com/projects/api-keys/client-key). This unlocks **enhanced OnchainKit features** in the wallet connection experience:

- **Access to Coinbase's RPC nodes** (if you don't provide your own RPC URL)
- **Enhanced performance** through Coinbase's hosted infrastructure

It is not required for basic functionality or logo & name customization.


```typescript
export const middleware = paymentMiddleware(
  address,
  {
    "/protected": {
      price: "$0.01",
    },
  },
  {
    appLogo: "/logos/your-app.png",
    appName: "Your App Name",
    cdpClientKey: "your-cdp-client-key",
  },
);
```

## Configuration Options

| Option | Description |
|--------|-------------|
| `appLogo` | Your app's logo for the paywall wallet selection modal |
| `appName` | Your app's name displayed in the paywall wallet selection modal |
| `cdpClientKey` | Coinbase Developer Platform [Client API Key](https://docs.cdp.coinbase.com/get-started/docs/cdp-api-keys) (only required for [enhanced OnchainKit features](https://docs.base.org/onchainkit/config/onchainkit-provider#apikey)) |


## Usage

The paywall automatically loads when a browser attempts to access a protected route configured in your middleware.

![](../../../../../static/paywall.jpg)

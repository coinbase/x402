# x402 Advanced Resource Server Example

This is an advanced example of an Express.js server that demonstrates how to implement paywall functionality without using middleware. This approach is useful for more complex scenarios, such as:

- Asynchronous payment settlement
- Custom payment validation logic
- Complex routing requirements
- Integration with existing authentication systems

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))
- A valid Ethereum address for receiving payments
- Coinbase Developer Platform API Key & Secret (if accepting payments on Base mainnet)
  -- Get them here [https://portal.cdp.coinbase.com/projects](https://portal.cdp.coinbase.com/projects)

## Setup

1. Copy `.env-local` to `.env` and add your Ethereum address:

```bash
cp .env-local .env
```

2. Install and build all packages from the typescript examples root:
```bash
cd ../../
pnpm install
pnpm build
cd servers/advanced
```

3. Run the server
```bash
pnpm install
pnpm dev
```

## Implementation Overview

This advanced implementation provides a structured approach to handling payments with:

1. Helper functions for creating payment requirements and verifying payments
2. Support for delayed payment settlement
3. Dynamic pricing capabilities
4. Multiple payment requirement options
5. Proper error handling and response formatting
6. Integration with the x402 facilitator service

## Testing the Server

You can test the server using one of the example clients:

### Using the Fetch Client
```bash
cd ../../clients/fetch
# Ensure .env is setup
pnpm install
pnpm dev
```

### Using the Axios Client
```bash
cd ../../clients/axios
# Ensure .env is setup
pnpm install
pnpm dev
```

## Example Endpoints

The server includes example endpoints that demonstrate different payment scenarios:

### Delayed Settlement
- `/delayed-settlement` - Demonstrates asynchronous payment processing
- Returns the weather data immediately without waiting for payment settlement
- Processes payment asynchronously in the background
- Useful for scenarios where immediate response is critical and payment settlement can be handled later

### Dynamic Pricing
- `/dynamic-price` - Shows how to implement variable pricing based on request parameters
- Accepts a `multiplier` query parameter to adjust the base price
- Demonstrates how to calculate and validate payments with dynamic amounts
- Useful for implementing tiered pricing or demand-based pricing models

### Multiple Payment Requirements
- `/multiple-payment-requirements` - Illustrates how to accept multiple payment options
- Allows clients to pay using different assets (e.g., USDC or USDT)
- Supports multiple networks (e.g., Base and Base Sepolia)
- Useful for providing flexibility in payment methods and networks

## Response Format

### Payment Required (402)
```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "1000",
      "resource": "http://localhost:3001/weather",
      "description": "Access to weather data",
      "mimeType": "",
      "payTo": "0xYourAddress",
      "maxTimeoutSeconds": 60,
      "asset": "0x...",
      "outputSchema": null,
      "extra": {
        "name": "USD Coin",
        "version": "1"
      }
    }
  ]
}
```

### Successful Response
```json
// Body
{
  "report": {
    "weather": "sunny",
    "temperature": 70
  }
}
// Headers
{
  "X-PAYMENT-RESPONSE": "..." // Encoded response object
}
```

## Extending the Example

To add more paid endpoints with delayed payment settlement, you can follow this pattern:

```typescript
app.get("/your-endpoint", async (req, res) => {
  const resource = `${req.protocol}://${req.headers.host}${req.originalUrl}` as Resource;
  const paymentRequirements = [createExactPaymentRequirements(
    "$0.001", // Your price
    "base-sepolia", // Your network
    resource,
    "Description of your resource"
  )];

  const isValid = await verifyPayment(req, res, paymentRequirements);
  if (!isValid) return;

  // Return your protected resource immediately
  res.json({
    // Your response data
  });

  // Process payment asynchronously
  try {
    const settleResponse = await settle(
      exact.evm.decodePayment(req.header("X-PAYMENT")!),
      paymentRequirements[0]
    );
    const responseHeader = settleResponseHeader(settleResponse);
    // In a real application, you would store this response header
    // and associate it with the payment for later verification
    console.log("Payment settled:", responseHeader);
  } catch (error) {
    console.error("Payment settlement failed:", error);
    // In a real application, you would handle the failed payment
    // by marking it for retry or notifying the user
  }
});
```

For dynamic pricing or multiple payment requirements, refer to the `/dynamic-price` and `/multiple-payment-requirements` endpoints in the example code for implementation details.

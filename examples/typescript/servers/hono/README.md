# x402-hono Example Server

This is an example Hono server that demonstrates how to use the `x402-hono` middleware to implement paywall functionality in your API endpoints.

## Prerequisites

- Node.js (v20 or higher)
- A valid x402 facilitator (you can use the example express server at `examples/typescript/facilitator`)
- A valid Ethereum address for receiving payments

## Setup

1. First, start the local facilitator server:

```bash
cd ../facilitator
# Ensure .env is setup
pnpm install
pnpm dev
```

The facilitator will run on http://localhost:3002

2. Create a `.env` file in the root directory with the following variables:
```env
FACILITATOR_URL=http://localhost:3002
ADDRESS=0xYourEthereumAddress
NETWORK=base # or "base-sepolia" for testnet
PORT=3001
```

3. In a new terminal, install and start the example server:
```bash
pnpm install
pnpm dev
```
The server will run on http://localhost:3001


## Testing the Server

You can test the server using one of the example clients:

### Using the Fetch Client
```bash
cd ../clients/fetch
# Ensure .env is setup
npm install
npm dev
```

### Using the Axios Client
```bash
cd ../clients/axios
# Ensure .env is setup
npm install
npm dev
```

These clients will demonstrate how to:
1. Make an initial request to get payment requirements
2. Process the payment requirements
3. Make a second request with the payment token

## Example Endpoint

The server includes a single example endpoint at `/weather` that requires a payment of $0.001 to access. The endpoint returns a simple weather report.

## Response Format

### Payment Required (402)
```json
{
  "error": "X-PAYMENT header is required",
  "paymentRequirements": {
    "scheme": "exact",
    "network": "base",
    "maxAmountRequired": "1000",
    "resource": "http://localhost:3001/weather",
    "description": "",
    "mimeType": "",
    "payTo": "0xYourAddress",
    "maxTimeoutSeconds": 60,
    "asset": "0x...",
    "outputSchema": null,
    "extra": null
  }
}
```

### Successful Response
```ts
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

To add more paid endpoints, follow the pattern in the example:

```typescript
app.get(
  "/your-endpoint",
  paymentMiddleware("$0.10", {
    description: "Description of your endpoint",
    resource: `http://localhost:${process.env.PORT}/your-endpoint`,
  }),
  c => {
    return c.json({
      // Your endpoint response here
    });
  }
);
```

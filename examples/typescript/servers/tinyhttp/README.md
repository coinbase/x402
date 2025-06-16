# tinyhttp x402 Example Server

This example demonstrates how to use the `x402-tinyhttp` middleware to add payment requirements to your tinyhttp application.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file with your configuration:

   ```bash
   NETWORK=base-sepolia
   ADDRESS=0x1234567890123456789012345678901234567890
   FACILITATOR_URL=https://x402.org/facilitator
   ```

3. Start the server:
   ```bash
   npm start
   ```

## Endpoints

- `GET /weather` - Requires $0.001 payment

## Testing

You can test the endpoints using curl:

```bash
# Protected endpoint (will return 402 Payment Required)
curl http://localhost:4021/weather

# With payment header (replace with actual payment)
curl -H "X-PAYMENT: <base64-encoded-payment>" http://localhost:4021/weather
```

## Features Demonstrated

- Route-specific payment requirements
- Custom descriptions for payments
- Automatic paywall HTML for browser requests
- JSON responses for API requests

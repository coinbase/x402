# x402-observed Express Example

This example demonstrates how to use `@x402-observed/express` to add zero-configuration observability to your x402 payment workflows.

## What is x402-observed?

`@x402-observed` is a drop-in replacement for the standard x402 middleware that automatically logs all payment workflow events to a local SQLite database. You can then view these events in real-time using the `x402-observed` dashboard.

## Setup

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Configure environment variables:**
   
   The `.env` file is already configured with test credentials. For production, copy `.env.example` to `.env` and add your own credentials:
   ```bash
   cp .env.example .env
   ```

   Then edit `.env` with your values:
   - `CDP_API_KEY`: Your Coinbase Developer Platform API key
   - `CDP_API_SECRET`: Your CDP API secret
   - `EVM_PAYEE_ADDRESS`: Your Ethereum address to receive payments

3. **Start the server:**
   ```bash
   pnpm dev
   ```

   The server will start at http://localhost:3000

## Using the Dashboard

To view payment workflows in real-time:

1. **Start the x402-observed dashboard** (in a separate terminal):
   ```bash
   npx x402-observed
   ```

2. **Open the dashboard:**
   
   Navigate to http://localhost:4402 in your browser

3. **Make requests:**
   
   Open http://localhost:3000 in your browser and click the "Test Endpoint" buttons

4. **Watch workflows appear:**
   
   The dashboard will show all payment events in real-time:
   - Request received
   - Payment required (402 response)
   - Payment header received
   - Verify called
   - Verify result
   - Settle called
   - Settle result (with transaction hash)
   - Workflow completed

## Key Difference from Standard x402

The only change needed to enable observability is the import statement:

```typescript
// Before (standard x402)
import { paymentMiddleware } from '@x402/express';

// After (with observability)
import { paymentMiddleware } from '@x402-observed/express';
```

Everything else remains identical:
- Same function signature
- Same behavior
- Same return values
- Zero configuration required

## How It Works

The `@x402-observed/express` middleware:

1. **Wraps the original middleware** - No reimplementation, just observation
2. **Intercepts payment events** - Logs all verify() and settle() calls
3. **Stores to SQLite** - Events saved to `.x402-observed/events.db`
4. **Preserves behavior** - Original x402 functionality is unchanged

## Endpoints

- `GET /` - Simple HTML frontend for testing
- `GET /api/premium` - Protected endpoint ($0.001 USDC)
- `GET /api/data` - Protected endpoint ($0.005 USDC)
- `GET /health` - Health check (no payment required)

## Database Location

All workflow events are stored in:
```
.x402-observed/events.db
```

This file is created automatically in your project root. Add it to `.gitignore` to avoid committing payment data.

## Troubleshooting

**Dashboard shows no workflows:**
- Make sure you've made at least one request to a protected endpoint
- Check that `.x402-observed/events.db` exists in the project root
- Verify the dashboard is running on port 4402

**Server won't start:**
- Check that port 3000 is available
- Verify your `.env` file has valid credentials
- Ensure all dependencies are installed with `pnpm install`

## Learn More

- [x402 Documentation](https://docs.x402.org)
- [x402-observed GitHub](https://github.com/yourusername/x402-observed)

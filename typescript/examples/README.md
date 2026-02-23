# x402-observed Examples

This directory contains example projects demonstrating how to use `@x402-observed` packages to add zero-configuration observability to your x402 payment workflows.

## Available Examples

### 1. Express Example (`express-example/`)

A complete Express.js server demonstrating:
- Drop-in replacement for `@x402/express`
- Multiple protected endpoints with different pricing
- Simple HTML frontend for testing
- Real-time workflow observability

**Quick Start:**
```bash
cd express-example
pnpm install
pnpm dev
```

Then in a separate terminal:
```bash
npx x402-observed
```

Open http://localhost:3000 for the app and http://localhost:4402 for the dashboard.

### 2. Next.js Example (`nextjs-example/`)

A complete Next.js application demonstrating:
- Drop-in replacement for `@x402/next`
- Next.js middleware configuration
- API routes with payment protection
- React frontend for testing
- Real-time workflow observability

**Quick Start:**
```bash
cd nextjs-example
pnpm install
pnpm dev
```

Then in a separate terminal:
```bash
npx x402-observed
```

Open http://localhost:3000 for the app and http://localhost:4402 for the dashboard.

## What is x402-observed?

`@x402-observed` provides drop-in replacements for x402 middleware packages that automatically log all payment workflow events to a local SQLite database. The events can be viewed in real-time using the `x402-observed` dashboard.

### Key Features

- **Zero Configuration**: No setup required, just change your import
- **Drop-in Replacement**: Identical API to standard x402 packages
- **Local Storage**: SQLite database in your project root
- **Real-time Dashboard**: View workflows as they happen
- **Complete Visibility**: See all payment events from request to settlement

## How It Works

### 1. Change Your Import

The only code change needed:

```typescript
// Before
import { paymentMiddleware } from '@x402/express';

// After
import { paymentMiddleware } from '@x402-observed/express';
```

### 2. Events Are Logged Automatically

Every payment workflow is logged to `.x402-observed/events.db`:
- Request received
- Payment required (402 response)
- Payment header received
- Verify called
- Verify result
- Settle called
- Settle result (with transaction hash)
- Workflow completed

### 3. View in the Dashboard

Run `npx x402-observed` to launch the dashboard at http://localhost:4402

The dashboard shows:
- All workflows with their status
- Complete event timeline for each workflow
- Transaction hashes and verification details
- Real-time updates via Server-Sent Events

## Environment Variables

Both examples require these environment variables:

```bash
# CDP API Credentials
CDP_API_KEY=your_cdp_api_key_here
CDP_API_SECRET=your_cdp_api_secret_here

# x402 Configuration
FACILITATOR_URL=https://facilitator.x402.org
EVM_NETWORK=eip155:84532
EVM_PAYEE_ADDRESS=0xYourPayeeAddressHere
```

**Note:** The examples include pre-configured test credentials in `.env` (Express) and `.env.local` (Next.js) for quick testing. For production, use your own credentials.

## Testing the Examples

### 1. Start the Example Server

Choose either Express or Next.js:

```bash
# Express
cd express-example && pnpm dev

# OR Next.js
cd nextjs-example && pnpm dev
```

### 2. Start the Dashboard

In a separate terminal:

```bash
cd express-example  # or nextjs-example
npx x402-observed
```

### 3. Make Requests

Open the example app in your browser:
- Express: http://localhost:3000
- Next.js: http://localhost:3000

Click the "Test Endpoint" buttons to trigger payment workflows.

### 4. View Workflows

Open the dashboard at http://localhost:4402 to see:
- Workflows appearing in real-time
- Complete event timelines
- Transaction details
- Payment verification results

## Database Location

Both examples store workflow events in:
```
.x402-observed/events.db
```

This file is created automatically in the project root. It's added to `.gitignore` to avoid committing payment data.

## Architecture

The observability system consists of three layers:

1. **Middleware Layer** (`@x402-observed/express` or `@x402-observed/next`)
   - Wraps original x402 middleware
   - Intercepts payment events
   - Logs to SQLite

2. **Storage Layer** (`@x402-observed/core`)
   - SQLite database with better-sqlite3
   - Idempotent event insertion
   - Query methods for workflows and events

3. **Dashboard Layer** (`x402-observed` CLI)
   - Express server serving static files
   - REST API over SQLite
   - Server-Sent Events for real-time updates

## Learn More

- [x402 Documentation](https://docs.x402.org)
- [Express Example README](./express-example/README.md)
- [Next.js Example README](./nextjs-example/README.md)

## Troubleshooting

**Dashboard shows no workflows:**
- Make sure you've made at least one request to a protected endpoint
- Check that `.x402-observed/events.db` exists
- Verify the dashboard is running on port 4402

**Port conflicts:**
- Express example uses port 3000
- Next.js example uses port 3000
- Dashboard uses port 4402
- Only run one example at a time, or change ports in the code

**Missing dependencies:**
- Run `pnpm install` in the example directory
- Ensure you're in the monorepo root when running pnpm commands

**Environment variables not loaded:**
- Express uses `.env` file
- Next.js uses `.env.local` file
- Check that the file exists and has valid values

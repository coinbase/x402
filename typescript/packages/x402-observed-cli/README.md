# x402-observed

Zero-configuration observability for x402 payment workflows. Drop-in replacement middleware + local dashboard for debugging HTTP 402 payments.

## Quick Start

```bash
# 1. Replace your x402 import
- import { paymentMiddleware } from '@x402/express';
+ import { paymentMiddleware } from '@x402-observed/express';

# 2. Start your server (events auto-logged to SQLite)
npm start

# 3. Launch the dashboard
npx x402-observed
```

Open http://localhost:4402 to see all payment workflows in real-time.

## What is x402-observed?

x402-observed is a development tool that provides instant visibility into x402 payment flows. It's designed like `npx prisma studio` - zero configuration, local-first, and immediately useful.

### Key Features

- **Drop-in Replacement**: Change one import line, get full observability
- **Zero Configuration**: No environment variables, no setup files, no infrastructure
- **Local SQLite Storage**: Events stored at `.x402-observed/events.db` in your project
- **Real-time Dashboard**: Live updates via Server-Sent Events
- **Non-invasive**: Original x402 behavior completely preserved
- **Framework Support**: Express and Next.js

## Installation

```bash
# For Express
npm install @x402-observed/express

# For Next.js
npm install @x402-observed/next

# Dashboard (installed automatically with npx)
npx x402-observed
```

## Usage

### Express

```typescript
import express from 'express';
import { paymentMiddleware } from '@x402-observed/express';
import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server';

const app = express();
const facilitator = new HTTPFacilitatorClient({ url: 'https://facilitator.example.com' });
const server = new x402ResourceServer(facilitator);

app.use(
  paymentMiddleware(
    {
      'GET /premium': {
        accepts: {
          payTo: '0xYourAddress',
          scheme: 'exact',
          price: '$0.001',
          network: 'eip155:84532',
        },
        description: 'Premium content',
      },
    },
    server
  )
);

app.listen(3000);
```

### Next.js

```typescript
import { withX402 } from '@x402-observed/next';
import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server';

const facilitator = new HTTPFacilitatorClient({ url: 'https://facilitator.example.com' });
const server = new x402ResourceServer(facilitator);

const handler = async () => {
  return NextResponse.json({ data: 'protected content' });
};

export const GET = withX402(
  handler,
  {
    accepts: {
      payTo: '0xYourAddress',
      scheme: 'exact',
      price: '$0.001',
      network: 'eip155:84532',
    },
    description: 'Premium API endpoint',
  },
  server
);
```

## Dashboard

Launch the dashboard to view all payment workflows:

```bash
npx x402-observed
```

The dashboard shows:
- **Workflow List**: All payment workflows with status and timestamps
- **Event Timeline**: Complete sequence of events for each workflow
- **Transaction Details**: Transaction hashes, verification results, error messages
- **Real-time Updates**: Live event streaming via SSE

### Dashboard Features

- View all 8 event types:
  - Request received
  - Payment required (402)
  - Payment header received
  - Verify called
  - Verify result
  - Settle called
  - Settle result (with transaction hash)
  - Workflow completed
- Filter by status (pending, completed, failed)
- Inspect event details and metadata
- Copy transaction hashes
- Real-time updates without page refresh

## How It Works

### Architecture

```
HTTP Request → observedPaymentMiddleware
  ↓
[LOG: request_received] → SQLite
  ↓
Original x402 middleware (unchanged)
  ↓
facilitatorProxy.verify()
  ↓
[LOG: verify_called, verify_result] → SQLite → SSE broadcast
  ↓
facilitatorProxy.settle()
  ↓
[LOG: settle_called, settle_result] → SQLite → SSE broadcast
  ↓
[LOG: workflow_completed] → SQLite → SSE broadcast
```

### Interception Strategy

The observed middleware uses JavaScript Proxy to intercept `HTTPFacilitatorClient` methods:
- Logs events before and after each method call
- Captures actual timestamps at event occurrence
- Preserves original return values and error behavior
- Zero performance impact on payment processing

## Database

Events are stored in `.x402-observed/events.db` at your project root.

### Schema

```sql
-- Workflows table
CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  status TEXT NOT NULL
);

-- Events table
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  data TEXT NOT NULL,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id)
);
```

### Inspecting the Database

```bash
# Using sqlite3 CLI
sqlite3 .x402-observed/events.db "SELECT * FROM workflows;"

# Or use any SQLite browser
open .x402-observed/events.db
```

## Configuration

x402-observed requires zero configuration by default. For advanced use cases:

```typescript
import { configureObservability } from '@x402-observed/express';

// Custom database path
configureObservability({ dbPath: '/custom/path/events.db' });

// Disable observability (useful for production)
configureObservability({ disabled: true });
```

## Examples

See the `typescript/examples/` directory for complete working examples:

- **Express Example**: `typescript/examples/express-example/`
  - Full observability with SQLite
  - Wallet integration (MetaMask/Coinbase Wallet)
  - Real-time dashboard
  
- **Next.js Example**: `typescript/examples/nextjs-example/`
  - Next.js 15 App Router
  - Route-level payment protection
  - Graceful degradation

## Packages

The x402-observed tool consists of five packages:

| Package | Description | Published |
|---------|-------------|-----------|
| `@x402-observed/core` | Core observability infrastructure | ✅ |
| `@x402-observed/express` | Express middleware wrapper | ✅ |
| `@x402-observed/next` | Next.js middleware wrapper | ✅ |
| `x402-observed` | CLI + dashboard (this package) | ✅ |
| `@x402-observed/dashboard` | Dashboard UI (internal) | ❌ |

## Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/coinbase/x402.git
cd x402/typescript

# Install dependencies
pnpm install

# Build all packages
pnpm build --filter @x402-observed/core
pnpm build --filter @x402-observed/express
pnpm build --filter @x402-observed/next
pnpm build --filter @x402-observed/dashboard
pnpm build --filter x402-observed

# Run tests
pnpm test --filter @x402-observed/core
```

### Running the Dashboard Locally

```bash
cd typescript/packages/x402-observed-cli
pnpm dev
```

## Troubleshooting

### Dashboard shows no workflows

- Make sure you've made at least one request to a protected endpoint
- Check that `.x402-observed/events.db` exists in your project root
- Verify the dashboard is running on port 4402

### SQLite errors in Next.js

Next.js has issues with native modules like `better-sqlite3`. The package gracefully degrades:
- Payment processing continues normally
- Observability is disabled with a warning
- Use the Express example for full observability

### Port 4402 already in use

```bash
# Kill the process using port 4402
lsof -ti:4402 | xargs kill -9

# Or specify a different port (future feature)
npx x402-observed --port 4403
```

## Comparison with Standard x402

| Feature | @x402/express | @x402-observed/express |
|---------|---------------|------------------------|
| Payment Processing | ✅ | ✅ |
| Function Signature | ✅ | ✅ (identical) |
| Behavior | ✅ | ✅ (preserved) |
| Event Logging | ❌ | ✅ |
| SQLite Storage | ❌ | ✅ |
| Dashboard | ❌ | ✅ |
| Real-time Updates | ❌ | ✅ |
| Configuration Required | ❌ | ❌ |

## Philosophy

x402-observed follows the "Prisma Studio" model:
- **Local-first**: No cloud services, no external dependencies
- **Zero-config**: Works out of the box
- **Developer-focused**: Built for debugging, not production monitoring
- **Non-invasive**: Never modifies original behavior

## Roadmap

- [ ] Alternative storage backends (Redis, in-memory)
- [ ] Custom port configuration
- [ ] Export workflows to JSON/CSV
- [ ] Performance metrics and analytics
- [ ] Webhook notifications
- [ ] Multi-project support

## Contributing

See [CONTRIBUTING.md](../../../CONTRIBUTING.md) for guidelines.

## License

MIT

## Learn More

- [x402 Protocol Documentation](https://docs.x402.org)
- [x402 GitHub Repository](https://github.com/coinbase/x402)
- [Express Example](../../examples/express-example/)
- [Next.js Example](../../examples/nextjs-example/)

---

**Built with ❤️ for the x402 community**

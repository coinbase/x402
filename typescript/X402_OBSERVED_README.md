# x402-observed: Zero-Config Observability for x402 Payments

> **Local-first development tool for debugging HTTP 402 payment workflows**

x402-observed is a zero-configuration observability solution for x402 payment workflows. It provides developers with real-time visibility into HTTP 402 payment flows through transparent interception of payment operations, similar to how `npx prisma studio` provides instant database visibility.

## 🚀 Quick Start

```bash
# 1. Install the observed middleware (drop-in replacement)
npm install @x402-observed/express
# or
npm install @x402-observed/next

# 2. Change one import line in your code
- import { paymentMiddleware } from '@x402/express';
+ import { paymentMiddleware } from '@x402-observed/express';

# 3. Start your server (events auto-logged to SQLite)
npm start

# 4. Launch the dashboard
npx x402-observed
```

Open http://localhost:4402 to see all payment workflows in real-time! 🎉

## 📦 Monorepo Structure

This is a fork of [coinbase/x402](https://github.com/coinbase/x402) with additional observability packages. The original x402 packages are **never modified** - all new code lives in packages prefixed with `x402-observed-`.

```
typescript/
├── packages/
│   ├── core/                          # @x402/core (upstream, read-only)
│   ├── http/                          # @x402/express, @x402/next (upstream, read-only)
│   │
│   ├── x402-observed-core/            # @x402-observed/core
│   │   ├── src/
│   │   │   ├── events/                # Event types and schemas
│   │   │   ├── storage/               # SQLite database layer
│   │   │   ├── proxy/                 # HTTPFacilitatorClient proxy wrapper
│   │   │   └── tracker/               # Workflow lifecycle management
│   │   └── package.json
│   │
│   ├── x402-observed-express/         # @x402-observed/express
│   │   ├── src/
│   │   │   └── middleware.ts          # Observed paymentMiddleware for Express
│   │   └── package.json
│   │
│   ├── x402-observed-next/            # @x402-observed/next
│   │   ├── src/
│   │   │   └── middleware.ts          # Observed paymentMiddleware for Next.js
│   │   └── package.json
│   │
│   ├── x402-observed-cli/             # x402-observed (npx binary)
│   │   ├── src/
│   │   │   ├── server.ts              # Express server
│   │   │   ├── api/                   # REST API routes
│   │   │   ├── sse.ts                 # Server-Sent Events
│   │   │   └── index.ts               # CLI entry point
│   │   └── package.json
│   │
│   └── x402-observed-dashboard/       # Dashboard UI (not published)
│       ├── src/
│       │   ├── app/                   # Next.js app directory
│       │   ├── components/            # React components
│       │   └── lib/                   # API client
│       └── package.json
│
└── examples/
    ├── express-example/               # Express + observability example
    └── nextjs-example/                # Next.js + observability example
```

## 🔗 Package Relationships

### Dependency Graph

```
@x402/core (upstream, read-only)
    ↓
@x402-observed/core
    ├── better-sqlite3 (SQLite driver)
    └── @x402/core (types, interfaces)
    ↓
    ├─→ @x402-observed/express
    │   └── @x402/express (original middleware)
    │
    ├─→ @x402-observed/next
    │   └── @x402/next (original middleware)
    │
    └─→ x402-observed (CLI)
        ├── express (server)
        └── @x402-observed/dashboard (UI)
```

### Package Descriptions

| Package | Description | Published to npm |
|---------|-------------|------------------|
| **@x402-observed/core** | Core observability infrastructure: event storage, workflow tracking, facilitator proxy | ✅ Yes |
| **@x402-observed/express** | Drop-in replacement for `@x402/express` with observability | ✅ Yes |
| **@x402-observed/next** | Drop-in replacement for `@x402/next` with observability | ✅ Yes |
| **x402-observed** | CLI tool that launches the dashboard (runs via `npx x402-observed`) | ✅ Yes |
| **@x402-observed/dashboard** | Next.js dashboard UI (bundled with CLI, not published separately) | ❌ No |

## 🎯 Key Features

### 1. Drop-in Replacement

Change **one import line** to enable observability:

```typescript
// Before
import { paymentMiddleware } from '@x402/express';

// After
import { paymentMiddleware } from '@x402-observed/express';
```

- ✅ Identical function signature
- ✅ Identical behavior
- ✅ Zero configuration required
- ✅ No code changes needed

### 2. Zero Configuration

No environment variables, no setup files, no infrastructure:

```bash
# Just run it
npx x402-observed
```

- SQLite database auto-created at `.x402-observed/events.db`
- Dashboard auto-served on port 4402
- REST API auto-exposed at `/api/workflows`
- SSE endpoint auto-configured at `/api/events`

### 3. Local-First Storage

All data stored locally in SQLite:

```
your-project/
├── .x402-observed/
│   └── events.db          # SQLite database (auto-created)
├── src/
│   └── server.ts
└── package.json
```

- No cloud services
- No external dependencies
- Easy to inspect with any SQLite browser
- Add to `.gitignore` to avoid committing payment data

### 4. Real-Time Dashboard

Beautiful dashboard with live updates:

- **Workflow List**: All payment workflows with status and timestamps
- **Event Timeline**: Complete sequence of events for each workflow
- **Transaction Details**: Transaction hashes, verification results, error messages
- **Real-time Updates**: Live event streaming via Server-Sent Events (SSE)

### 5. Non-Invasive Interception

Uses JavaScript Proxy to intercept payment operations:

- Logs events before and after each method call
- Captures actual timestamps at event occurrence
- Preserves original return values and error behavior
- Zero performance impact on payment processing

## 🔍 How It Works

### Data Flow

```
HTTP Request
    ↓
observedPaymentMiddleware (Express/Next)
    ↓
[LOG: request_received] → SQLite
    ↓
Original paymentMiddleware (unchanged)
    ↓
402 Response
    ↓
[LOG: payment_required] → SQLite → SSE broadcast
    ↓
Payment Header Received
    ↓
[LOG: payment_header_received] → SQLite → SSE broadcast
    ↓
facilitatorProxy.verify()
    ↓
[LOG: verify_called] → SQLite → SSE broadcast
    ↓
verify() result
    ↓
[LOG: verify_result] → SQLite → SSE broadcast
    ↓
facilitatorProxy.settle()
    ↓
[LOG: settle_called] → SQLite → SSE broadcast
    ↓
settle() result (with txHash)
    ↓
[LOG: settle_result] → SQLite → SSE broadcast
    ↓
200 Response
    ↓
[LOG: workflow_completed] → SQLite → SSE broadcast
```

### Event Types

x402-observed tracks 8 event types:

1. **request_received**: HTTP request enters middleware
2. **payment_required**: 402 response returned
3. **payment_header_received**: Request includes payment header
4. **verify_called**: Facilitator verify() called
5. **verify_result**: Verification result received
6. **settle_called**: Facilitator settle() called
7. **settle_result**: Settlement result received (with transaction hash)
8. **workflow_completed**: Workflow completed successfully

### Interception Strategy

The observed middleware wraps `HTTPFacilitatorClient` using a JavaScript Proxy:

```typescript
// Simplified example
const proxy = new Proxy(originalFacilitator, {
  get(target, prop) {
    if (prop === 'verify' || prop === 'settle') {
      return async (...args) => {
        // Log *_called event with actual timestamp
        logEvent(`${prop}_called`, Date.now(), args);
        
        try {
          // Call original method
          const result = await target[prop](...args);
          
          // Log *_result event with actual timestamp
          logEvent(`${prop}_result`, Date.now(), result);
          
          return result; // Preserve original return value
        } catch (error) {
          // Log error and re-throw (preserve original behavior)
          logEvent(`${prop}_error`, Date.now(), error);
          throw error;
        }
      };
    }
    return target[prop];
  }
});
```

## 📚 Package Documentation

### @x402-observed/core

Core observability infrastructure. Provides:

- **EventStorage**: SQLite database interface using `better-sqlite3`
- **WorkflowTracker**: Workflow lifecycle management
- **FacilitatorProxy**: JavaScript Proxy wrapper for `HTTPFacilitatorClient`
- **Event Types**: TypeScript interfaces for all 8 event types

[View Package README](./packages/x402-observed-core/README.md)

### @x402-observed/express

Drop-in replacement for `@x402/express` with observability.

```typescript
import { paymentMiddleware } from '@x402-observed/express';
import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server';

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
```

[View Package README](./packages/x402-observed-express/README.md)

### @x402-observed/next

Drop-in replacement for `@x402/next` with observability.

```typescript
import { withX402 } from '@x402-observed/next';
import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server';

const facilitator = new HTTPFacilitatorClient({ url: 'https://facilitator.example.com' });
const server = new x402ResourceServer(facilitator);

export const GET = withX402(
  async () => NextResponse.json({ data: 'protected content' }),
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

[View Package README](./packages/x402-observed-next/README.md)

### x402-observed (CLI)

Command-line tool that launches the dashboard.

```bash
# Launch dashboard
npx x402-observed

# Dashboard opens at http://localhost:4402
```

[View Package README](./packages/x402-observed-cli/README.md)

## 🎓 Examples

### Express Example

Complete working example with full observability:

```bash
cd typescript/examples/express-example
pnpm install
pnpm dev
```

Features:
- ✅ Full SQLite observability
- ✅ Wallet integration (MetaMask/Coinbase Wallet)
- ✅ Real-time dashboard
- ✅ All 8 events tracked with transaction hashes

[View Express Example](./examples/express-example/)

### Next.js Example

Next.js 15 App Router example with graceful degradation:

```bash
cd typescript/examples/nextjs-example
pnpm install
pnpm dev
```

Features:
- ✅ Next.js 15 App Router
- ✅ Route-level payment protection
- ✅ Graceful degradation (SQLite has issues in Next.js)
- ⚠️ Use Express example for full observability

[View Next.js Example](./examples/nextjs-example/)

## 🛠️ Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/coinbase/x402.git
cd x402/typescript

# Install dependencies
pnpm install

# Build all packages (in order)
pnpm build --filter @x402-observed/core
pnpm build --filter @x402-observed/express
pnpm build --filter @x402-observed/next
pnpm build --filter @x402-observed/dashboard
pnpm build --filter x402-observed

# Run tests
pnpm test --filter @x402-observed/core
pnpm test --filter @x402-observed/express
pnpm test --filter @x402-observed/next
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm test --filter @x402-observed/core

# Run tests in watch mode
pnpm test:watch --filter @x402-observed/core
```

### Development Workflow

```bash
# 1. Make changes to a package
cd packages/x402-observed-core
# ... edit files ...

# 2. Build the package
pnpm build

# 3. Run tests
pnpm test

# 4. Test in example project
cd ../../examples/express-example
pnpm dev
```

## 🔧 Architecture

### Design Principles

1. **Zero Configuration**: No environment variables, no setup files, no infrastructure
2. **Drop-in Replacement**: Single import change to enable observability
3. **Non-invasive**: Original x402 behavior is completely preserved
4. **Local-first**: SQLite database stored in project root for easy inspection
5. **Real-time**: Server-Sent Events provide live updates to the dashboard

### Technology Stack

- **Backend**: Express server with REST API and SSE
- **Storage**: SQLite via `better-sqlite3`
- **Frontend**: Next.js 15 with React 19 and Tailwind CSS
- **Build**: tsup for TypeScript compilation
- **Tests**: Vitest with fast-check for property-based testing

### Database Schema

```sql
-- Workflows table
CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  status TEXT NOT NULL  -- 'pending', 'completed', 'failed'
);

-- Events table
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  data TEXT NOT NULL,  -- JSON
  FOREIGN KEY (workflow_id) REFERENCES workflows(id)
);

CREATE INDEX idx_events_workflow_id ON events(workflow_id);
CREATE INDEX idx_events_timestamp ON events(timestamp);
```

## 🐛 Troubleshooting

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

### Database locked errors

SQLite can have locking issues with concurrent writes. The package handles this gracefully:
- Retries failed writes automatically
- Logs warnings for persistent failures
- Never blocks payment processing

## 📋 Comparison with Standard x402

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
| Performance Impact | N/A | Negligible |

## 🗺️ Roadmap

- [ ] Alternative storage backends (Redis, in-memory)
- [ ] Custom port configuration
- [ ] Export workflows to JSON/CSV
- [ ] Performance metrics and analytics
- [ ] Webhook notifications
- [ ] Multi-project support
- [ ] Docker support
- [ ] Cloud deployment options

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

### Development Setup

1. Fork the repository
2. Clone your fork
3. Install dependencies: `pnpm install`
4. Create a branch: `git checkout -b feature/my-feature`
5. Make changes and test
6. Submit a pull request

## 📄 License

MIT - see [LICENSE](../LICENSE) for details.

## 🔗 Links

- [x402 Protocol Documentation](https://docs.x402.org)
- [x402 GitHub Repository](https://github.com/coinbase/x402)
- [x402 Specification](../specs/)
- [Express Example](./examples/express-example/)
- [Next.js Example](./examples/nextjs-example/)

## 💬 Support

- **Issues**: [GitHub Issues](https://github.com/coinbase/x402/issues)
- **Discussions**: [GitHub Discussions](https://github.com/coinbase/x402/discussions)
- **Discord**: [x402 Community](https://discord.gg/x402)

---

**Built with ❤️ for the x402 community**

*x402-observed is a development tool designed for local debugging. For production monitoring, consider using dedicated observability platforms.*

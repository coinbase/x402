---
"@x402-observed/core": minor
"@x402-observed/express": minor
"@x402-observed/next": minor
"x402-observed": minor
---

Add x402-observed: zero-configuration observability tool for x402 payment workflows

This release introduces x402-observed, a comprehensive observability solution for debugging HTTP 402 payment flows:

**New Packages:**
- `@x402-observed/core` - Core observability infrastructure with SQLite event storage, workflow tracking, and facilitator proxy
- `@x402-observed/express` - Drop-in replacement for `@x402/express` with automatic event logging
- `@x402-observed/next` - Drop-in replacement for `@x402/next` with automatic event logging
- `x402-observed` - CLI tool that launches a real-time dashboard (via `npx x402-observed`)

**Key Features:**
- Drop-in replacement: Change one import line to enable observability
- Zero configuration: No environment variables or setup required
- Local SQLite storage: Events stored at `.x402-observed/events.db`
- Real-time dashboard: Live updates via Server-Sent Events
- Non-invasive: Original x402 behavior completely preserved
- Tracks 8 event types: request_received, payment_required, payment_header_received, verify_called, verify_result, settle_called, settle_result, workflow_completed

**Usage:**
```typescript
// Before
import { paymentMiddleware } from '@x402/express';

// After (with observability)
import { paymentMiddleware } from '@x402-observed/express';

// Then launch dashboard
// npx x402-observed
```

See the Express and Next.js examples in `typescript/examples/` for complete working implementations.

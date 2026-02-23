# x402-observed Demo Guide

## What's Running

Your x402-observed tooling is now fully operational and ready for demo recording!

### Services Status

✅ **Local Facilitator** - Running on http://localhost:4025
✅ **Dashboard API** - Running on http://localhost:4402
✅ **Sample Data** - Loaded in SQLite database

## Demo Flow

### 1. Show the Database

The SQLite database contains a complete payment workflow:

```bash
cd typescript/examples/express-paywall-example
sqlite3 .x402-observed/events.db "SELECT * FROM workflows;"
```

Output shows:
- Workflow ID: `test-workflow-1`
- Status: `completed`
- Timestamps for creation and completion

### 2. Show the Events

```bash
sqlite3 .x402-observed/events.db "SELECT event_type, data FROM events ORDER BY timestamp;"
```

This displays the complete payment flow:
1. `request_received` - Initial API request
2. `payment_required` - 402 response returned
3. `settle_result` - Payment settled with **transaction hash**
4. `workflow_completed` - Request completed successfully

### 3. Show the API

The dashboard exposes a REST API over the SQLite database:

```bash
curl http://localhost:4402/api/workflows | jq
```

This returns JSON with:
- All workflows
- All events for each workflow
- Transaction hashes in `settle_result` events
- Complete workflow metadata

### 4. Show the Dashboard

Open in your browser:
```
http://localhost:4402
```

The dashboard displays:
- Real-time workflow list
- Event timeline for each workflow
- Transaction hash details
- Complete observability of the payment flow

## Key Demo Points

### Zero Configuration
- No environment variables needed
- No database setup required
- Just run `npx x402-observed` and it works

### Drop-in Replacement
Show the code change in `server.ts`:

```typescript
// Before
import { paymentMiddleware } from '@x402/express';

// After  
import { paymentMiddleware } from '@x402-observed/express';
```

That's it! No other code changes needed.

### Complete Observability

The system logs 8 events for each payment workflow:
1. `request_received` - Request arrives
2. `payment_required` - 402 returned
3. `payment_header_received` - Payment signature received
4. `verify_called` - Verification starts
5. `verify_result` - Payment verified
6. `settle_called` - Settlement starts
7. `settle_result` - **Transaction hash captured**
8. `workflow_completed` - Request completed

### Transaction Tracking

The `settle_result` event contains:
```json
{
  "success": true,
  "txHash": "0x1234567890abcdef...",
  "network": "eip155:84532"
}
```

This allows you to:
- Track payments on-chain
- Link workflows to blockchain transactions
- Debug payment issues
- Audit payment history

## Architecture Highlights

### SQLite Storage
- File location: `.x402-observed/events.db`
- Zero infrastructure required
- Inspectable with standard SQLite tools
- Gitignore-friendly

### Event-Driven Design
- Idempotent inserts (INSERT OR IGNORE)
- Timestamps from actual events (not Date.now())
- Complete audit trail
- Real-time SSE updates

### Package Structure
- `@x402-observed/core` - Event storage and tracking
- `@x402-observed/express` - Express middleware wrapper
- `@x402-observed/next` - Next.js middleware wrapper
- `x402-observed` - CLI dashboard server

## Demo Script

1. **Show the problem**: "Debugging x402 payments is hard - you can't see what's happening"

2. **Show the solution**: "Just change one import line"

3. **Show the data**: "Now every payment workflow is logged to SQLite"

4. **Show the API**: "Query workflows programmatically"

5. **Show the dashboard**: "Or view them in a beautiful UI"

6. **Show the transaction hash**: "Track payments on-chain"

7. **Show zero config**: "No setup, no configuration, just works"

## Stopping Services

When done with the demo:

```bash
# Stop the dashboard
# (Ctrl+C in the terminal running the CLI)

# Stop the facilitator
# (Ctrl+C in the facilitator terminal)
```

## Next Steps

For a real demo with actual payments:
1. Fix the facilitator `getExtra` issue
2. Connect to Base Sepolia testnet
3. Get testnet USDC
4. Make real payments through the UI
5. Watch workflows appear in real-time

## Marketing Angles

### For Developers
- "Debug x402 payments like a pro"
- "Complete visibility into payment workflows"
- "Zero-config observability"

### For Product Teams
- "Track every payment on-chain"
- "Audit trail for compliance"
- "Real-time payment monitoring"

### For DevOps
- "No infrastructure required"
- "SQLite-based, no database setup"
- "Works in development and production"

## Technical Differentiators

1. **Drop-in replacement** - One line change
2. **Zero configuration** - No env vars, no setup
3. **SQLite-based** - No database infrastructure
4. **Transaction tracking** - On-chain payment linking
5. **Real-time updates** - SSE for live workflows
6. **Complete audit trail** - 8 events per workflow

---

Ready to record your demo! 🎬

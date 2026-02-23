# Quick Start: Testing x402-observed

This guide gets you testing the x402-observed packages in under 5 minutes.

## Prerequisites

✅ All x402-observed packages are built  
✅ Example projects are created  
✅ Postman API key is configured

## 🚀 Quick Start (3 Terminals)

### Terminal 1: Start Express Server

```bash
cd typescript/examples/express-example
pnpm install
pnpm dev
```

**Expected Output:**
```
╔════════════════════════════════════════════════════════╗
║        x402-observed Express Example Server            ║
╠════════════════════════════════════════════════════════╣
║  Server:       http://localhost:3000                   ║
║  Observability: Events logged to .x402-observed/       ║
╚════════════════════════════════════════════════════════╝
```

### Terminal 2: Start Dashboard

```bash
cd typescript/examples/express-example
npx x402-observed
```

**Expected Output:**
```
x402-observed dashboard running at http://localhost:4402
```

### Terminal 3: Run Tests

```bash
cd typescript/examples
chmod +x test-apis.sh
./test-apis.sh
```

**Expected Output:**
```
Testing: Health Check... ✓ PASSED (Status: 200)
Testing: Premium Endpoint... ✓ PASSED (Status: 402)
Testing: Data Endpoint... ✓ PASSED (Status: 402)
Testing: Home Page... ✓ PASSED (Status: 200)
Testing: Get All Workflows... ✓ PASSED (Status: 200)
Testing: SSE Events Endpoint... ✓ PASSED (Status: 200)

Passed: 6
Failed: 0
✓ All tests passed!
```

## 🧪 Manual Testing

### Test with curl

```bash
# Health check (should return 200)
curl http://localhost:3000/health

# Protected endpoint (should return 402)
curl -i http://localhost:3000/api/premium

# View workflows
curl http://localhost:4402/api/workflows

# Watch real-time events (keep running)
curl -N http://localhost:4402/api/events
```

### Test in Browser

1. **Frontend:** http://localhost:3000
   - Click "Test Endpoint" buttons
   - See 402 responses

2. **Dashboard:** http://localhost:4402
   - View workflows table
   - Click workflow to see timeline
   - Watch real-time updates

### Test with Postman

1. Import collection: `x402-observed-api-tests.postman_collection.json`
2. Click "Run" on the collection
3. Select all requests
4. Click "Run x402-observed API Tests"

## ✅ Verification Checklist

After running tests, verify:

- [ ] Health endpoint returns `observability: "enabled"`
- [ ] Protected endpoints return 402 without payment
- [ ] `.x402-observed/events.db` file exists
- [ ] Dashboard shows workflows at http://localhost:4402
- [ ] Events are logged (request_received, payment_required)
- [ ] Real-time updates work in dashboard

## 🔍 Inspect the Database

```bash
# Navigate to example directory
cd typescript/examples/express-example

# View workflows
sqlite3 .x402-observed/events.db "SELECT * FROM workflows;"

# View events
sqlite3 .x402-observed/events.db "SELECT * FROM events ORDER BY timestamp DESC LIMIT 10;"

# Count events by type
sqlite3 .x402-observed/events.db "SELECT event_type, COUNT(*) FROM events GROUP BY event_type;"
```

**Expected Event Types:**
- `request_received` - Every request
- `payment_required` - 402 responses
- `payment_header_received` - With payment (not in basic tests)
- `verify_called` - Payment verification (not in basic tests)
- `verify_result` - Verification result (not in basic tests)
- `settle_called` - Payment settlement (not in basic tests)
- `settle_result` - Settlement with txHash (not in basic tests)
- `workflow_completed` - Successful payment (not in basic tests)

## 📊 Expected API Responses

### Health Check (200 OK)
```json
{
  "status": "ok",
  "network": "eip155:84532",
  "payee": "0x209693Bc6afc0C5329bA36FaF03C514EF312287C",
  "observability": "enabled"
}
```

### Protected Endpoint (402 Payment Required)
```json
{
  "error": "Payment Required",
  "payment": {
    "price": "$0.001",
    "network": "eip155:84532",
    "payTo": "0x209693Bc6afc0C5329bA36FaF03C514EF312287C"
  }
}
```

### Dashboard API (200 OK)
```json
{
  "workflows": [
    {
      "id": "workflow-uuid",
      "status": "pending",
      "createdAt": 1234567890000,
      "events": [...]
    }
  ]
}
```

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Find process using port
lsof -i :3000
lsof -i :4402

# Kill process
kill -9 <PID>
```

### No Workflows in Dashboard
1. Make at least one request to `/api/premium`
2. Check `.x402-observed/events.db` exists
3. Verify database has data: `sqlite3 .x402-observed/events.db "SELECT COUNT(*) FROM workflows;"`

### pnpm install Fails
```bash
# Install from monorepo root
cd typescript
pnpm install
```

### Database Not Created
- Check write permissions in project directory
- Verify EventStorage is initialized
- Check server logs for errors

## 📚 Additional Resources

- **API Testing Guide:** [API_TESTING_GUIDE.md](./API_TESTING_GUIDE.md)
- **Postman Guide:** [POSTMAN_TESTING.md](./POSTMAN_TESTING.md)
- **General Testing:** [TESTING.md](./TESTING.md)
- **Express Example:** [express-example/README.md](./express-example/README.md)
- **Next.js Example:** [nextjs-example/README.md](./nextjs-example/README.md)

## 🎯 Next Steps

After basic testing:

1. ✅ Test Next.js example (same process, different directory)
2. ✅ Test with real payment flows (requires wallet and USDC)
3. ✅ Monitor dashboard for extended periods
4. ✅ Test concurrent workflows
5. ✅ Integrate into CI/CD pipeline

## 💡 Tips

- Keep all 3 terminals visible to see logs
- Use the dashboard to visualize workflows in real-time
- Check the SQLite database directly to verify event logging
- Use Postman for automated regression testing
- The automated test script (`test-apis.sh`) is great for CI/CD

---

**Ready to start?** Open 3 terminals and follow the Quick Start section above!

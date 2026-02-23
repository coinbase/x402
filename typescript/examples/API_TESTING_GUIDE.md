# API Testing Guide for x402-observed

This guide provides multiple ways to test the x402-observed APIs to verify everything is working correctly.

## Prerequisites

Before testing, ensure you have:

1. **Started the example server** (Express or Next.js)
2. **Started the dashboard** (`npx x402-observed`)
3. **Made at least one request** to a protected endpoint (to create workflows)

## Testing Methods

### Method 1: Automated Shell Script (Recommended)

The fastest way to verify all APIs are working:

```bash
cd typescript/examples
./test-apis.sh
```

This script tests:
- ✅ Express health check
- ✅ Protected endpoints return 402
- ✅ Dashboard API returns workflows
- ✅ SSE endpoint accepts connections

**Expected Output:**
```
Testing: Health Check... ✓ PASSED (Status: 200)
Testing: Premium Endpoint (No Payment)... ✓ PASSED (Status: 402)
Testing: Data Endpoint (No Payment)... ✓ PASSED (Status: 402)
Testing: Home Page... ✓ PASSED (Status: 200)
Testing: Get All Workflows... ✓ PASSED (Status: 200)
Testing: SSE Events Endpoint... ✓ PASSED (Status: 200)

Passed: 6
Failed: 0
✓ All tests passed!
```

### Method 2: Postman Collection

Import and run the comprehensive Postman collection:

1. **Import the collection:**
   ```
   File: typescript/examples/x402-observed-api-tests.postman_collection.json
   ```

2. **Run all tests:**
   - Click the collection name
   - Click "Run" button
   - Select all requests
   - Click "Run x402-observed API Tests"

See [POSTMAN_TESTING.md](./POSTMAN_TESTING.md) for detailed instructions.

### Method 3: Manual curl Commands

Test each endpoint individually:

#### Express Example

```bash
# Health check (should return 200)
curl -i http://localhost:3000/health

# Premium endpoint (should return 402)
curl -i http://localhost:3000/api/premium

# Data endpoint (should return 402)
curl -i http://localhost:3000/api/data

# Home page (should return HTML)
curl -i http://localhost:3000/
```

#### Dashboard APIs

```bash
# Get all workflows
curl -i http://localhost:4402/api/workflows

# Get specific workflow (replace {id} with actual workflow ID)
curl -i http://localhost:4402/api/workflows/{id}

# SSE stream (keep running to see real-time events)
curl -N http://localhost:4402/api/events
```

### Method 4: Browser Testing

#### Test the Frontend

1. **Open Express example:**
   ```
   http://localhost:3000
   ```
   - Click "Test Endpoint" buttons
   - Observe 402 responses in the response boxes

2. **Open Dashboard:**
   ```
   http://localhost:4402
   ```
   - View workflows in the table
   - Click a workflow to see event timeline
   - Watch for real-time updates

#### Test APIs in Browser Console

Open browser console (F12) and run:

```javascript
// Test health endpoint
fetch('http://localhost:3000/health')
  .then(r => r.json())
  .then(console.log);

// Test protected endpoint (should get 402)
fetch('http://localhost:3000/api/premium')
  .then(r => console.log('Status:', r.status));

// Test dashboard API
fetch('http://localhost:4402/api/workflows')
  .then(r => r.json())
  .then(console.log);

// Test SSE (real-time events)
const eventSource = new EventSource('http://localhost:4402/api/events');
eventSource.onmessage = (event) => {
  console.log('New event:', JSON.parse(event.data));
};
```

### Method 5: Newman CLI (Automated Postman)

Run Postman tests from command line:

```bash
# Install newman
npm install -g newman

# Run the collection
newman run typescript/examples/x402-observed-api-tests.postman_collection.json
```

## Verification Checklist

After running tests, verify:

### ✅ Server Health
- [ ] Health endpoint returns 200
- [ ] Response includes `observability: "enabled"`
- [ ] Server logs show no errors

### ✅ Payment Protection
- [ ] Protected endpoints return 402 without payment
- [ ] Response includes payment requirements
- [ ] Payment details are correct (price, network, address)

### ✅ Database Creation
- [ ] `.x402-observed/events.db` file exists
- [ ] File is in the project root (not in node_modules)
- [ ] File size is growing with each request

### ✅ Event Logging
Check the database directly:

```bash
# View workflows
sqlite3 .x402-observed/events.db "SELECT * FROM workflows;"

# View events
sqlite3 .x402-observed/events.db "SELECT * FROM events ORDER BY timestamp DESC LIMIT 10;"

# Count events by type
sqlite3 .x402-observed/events.db "SELECT event_type, COUNT(*) FROM events GROUP BY event_type;"
```

Expected event types:
- `request_received`
- `payment_required`
- `payment_header_received` (only with payment)
- `verify_called` (only with payment)
- `verify_result` (only with payment)
- `settle_called` (only with payment)
- `settle_result` (only with payment)
- `workflow_completed` (only with valid payment)

### ✅ Dashboard Functionality
- [ ] Dashboard loads at http://localhost:4402
- [ ] Workflows appear in the table
- [ ] Clicking a workflow shows event timeline
- [ ] Real-time updates work (make a request, see it appear)
- [ ] Event details are accurate (timestamps, data)

### ✅ API Responses
- [ ] GET /api/workflows returns array of workflows
- [ ] Each workflow has id, status, createdAt, events
- [ ] GET /api/workflows/:id returns specific workflow
- [ ] Invalid workflow ID returns 404
- [ ] GET /api/events returns SSE stream

## Expected API Responses

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
    "payTo": "0x209693Bc6afc0C5329bA36FaF03C514EF312287C",
    "scheme": "exact"
  }
}
```

### Get All Workflows (200 OK)

```json
{
  "workflows": [
    {
      "id": "workflow-uuid",
      "status": "pending",
      "createdAt": 1234567890000,
      "updatedAt": 1234567890000,
      "events": [
        {
          "id": "event-uuid",
          "workflowId": "workflow-uuid",
          "eventType": "request_received",
          "timestamp": 1234567890000,
          "data": {
            "method": "GET",
            "path": "/api/premium"
          }
        }
      ]
    }
  ]
}
```

### SSE Events Stream

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"id":"event-uuid","workflowId":"workflow-uuid","eventType":"request_received","timestamp":1234567890000,"data":{}}

data: {"id":"event-uuid","workflowId":"workflow-uuid","eventType":"payment_required","timestamp":1234567890001,"data":{}}
```

## Troubleshooting

### No workflows in dashboard

**Problem:** Dashboard shows empty table

**Solutions:**
1. Make at least one request to a protected endpoint
2. Check that `.x402-observed/events.db` exists
3. Verify database has data: `sqlite3 .x402-observed/events.db "SELECT COUNT(*) FROM workflows;"`
4. Check server logs for errors

### 402 responses not logged

**Problem:** Protected endpoints return 402 but no events in database

**Solutions:**
1. Verify observed middleware is being used (check imports)
2. Check that EventStorage is initialized
3. Look for SQLite errors in server logs
4. Ensure `.x402-observed` directory is writable

### SSE not working

**Problem:** Real-time updates don't appear in dashboard

**Solutions:**
1. Check browser console for SSE connection errors
2. Verify dashboard is connecting to correct URL
3. Test SSE with curl: `curl -N http://localhost:4402/api/events`
4. Check that EventStorage.onEvent() is configured

### Port conflicts

**Problem:** "Address already in use" errors

**Solutions:**
1. Check what's using the port: `lsof -i :3000` or `lsof -i :4402`
2. Kill the process: `kill -9 <PID>`
3. Or change the port in the code

### Database locked

**Problem:** "database is locked" errors

**Solutions:**
1. Close any SQLite browser/viewer tools
2. Ensure only one server instance is running
3. Check file permissions on `.x402-observed/events.db`
4. Restart the server

## Performance Testing

Test with multiple concurrent requests:

```bash
# Install apache bench
brew install httpd  # macOS
apt-get install apache2-utils  # Linux

# Test with 100 requests, 10 concurrent
ab -n 100 -c 10 http://localhost:3000/api/premium

# Check that all workflows were logged
sqlite3 .x402-observed/events.db "SELECT COUNT(*) FROM workflows;"
```

## Next Steps

After verifying the APIs work:

1. ✅ Test with real payment flows (requires wallet and USDC)
2. ✅ Monitor dashboard for extended periods
3. ✅ Test error scenarios (invalid payments, network issues)
4. ✅ Verify transaction hashes appear in settle_result events
5. ✅ Test with multiple concurrent workflows
6. ✅ Integrate into CI/CD pipeline

## Additional Resources

- [POSTMAN_TESTING.md](./POSTMAN_TESTING.md) - Detailed Postman guide
- [TESTING.md](./TESTING.md) - General testing instructions
- [Express Example README](./express-example/README.md)
- [Next.js Example README](./nextjs-example/README.md)

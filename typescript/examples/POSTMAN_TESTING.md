# Postman API Testing for x402-observed

This guide explains how to test the x402-observed example APIs using Postman.

## Postman Collection

A comprehensive Postman collection has been created at:
```
typescript/examples/x402-observed-api-tests.postman_collection.json
```

## What's Included

The collection includes tests for:

### 1. Express Example APIs
- **Health Check** (`GET /health`) - No payment required
- **Premium Endpoint** (`GET /api/premium`) - Requires $0.001 USDC
- **Data Endpoint** (`GET /api/data`) - Requires $0.005 USDC
- **Home Page** (`GET /`) - Frontend HTML

### 2. Next.js Example APIs
- **Health Check** (`GET /api/health`) - No payment required
- **Premium Endpoint** (`GET /api/premium`) - Requires $0.001 USDC
- **Data Endpoint** (`GET /api/data`) - Requires $0.005 USDC

### 3. Dashboard APIs
- **Get All Workflows** (`GET /api/workflows`) - Returns all workflows
- **Get Workflow by ID** (`GET /api/workflows/:id`) - Returns specific workflow
- **SSE Events Stream** (`GET /api/events`) - Real-time event stream

## Setup Instructions

### Option 1: Import into Postman Desktop/Web

1. **Open Postman** (Desktop app or web version)

2. **Import the collection:**
   - Click "Import" button
   - Select "File" tab
   - Choose `typescript/examples/x402-observed-api-tests.postman_collection.json`
   - Click "Import"

3. **Configure environment variables:**
   - Click "Environments" in the left sidebar
   - Create a new environment called "x402-observed Local"
   - Add these variables:
     ```
     express_base_url = http://localhost:3000
     nextjs_base_url = http://localhost:3000
     dashboard_base_url = http://localhost:4402
     ```
   - Save the environment
   - Select it from the environment dropdown

4. **Start testing!**

### Option 2: Use Postman CLI (newman)

Install newman if you haven't already:
```bash
npm install -g newman
```

Run the collection:
```bash
# From the examples directory
newman run x402-observed-api-tests.postman_collection.json
```

## Testing Workflow

### Step 1: Start the Example Server

Choose either Express or Next.js:

```bash
# Express
cd typescript/examples/express-example
pnpm dev

# OR Next.js
cd typescript/examples/nextjs-example
pnpm dev
```

### Step 2: Start the Dashboard

In a separate terminal:

```bash
cd typescript/examples/express-example  # or nextjs-example
npx x402-observed
```

### Step 3: Run Postman Tests

#### Testing Express Example:

1. Run "Express Example → Health Check"
   - ✅ Should return 200 with `status: "ok"`
   - ✅ Should have `observability: "enabled"`

2. Run "Express Example → Premium Endpoint (No Payment)"
   - ✅ Should return 402 Payment Required
   - ✅ Response should contain payment requirements

3. Run "Express Example → Data Endpoint (No Payment)"
   - ✅ Should return 402 Payment Required
   - ✅ Response should contain payment requirements

4. Run "Express Example → Home Page"
   - ✅ Should return 200 with HTML content

#### Testing Next.js Example:

1. Run "Next.js Example → Health Check"
   - ✅ Should return 200 with `status: "ok"`
   - ✅ Should have `observability: "enabled"`

2. Run "Next.js Example → Premium Endpoint (No Payment)"
   - ✅ Should return 402 Payment Required
   - ✅ Response should contain payment requirements

3. Run "Next.js Example → Data Endpoint (No Payment)"
   - ✅ Should return 402 Payment Required
   - ✅ Response should contain payment requirements

#### Testing Dashboard APIs:

1. **First, trigger some workflows** by running the Express or Next.js endpoint tests above

2. Run "Dashboard API → Get All Workflows"
   - ✅ Should return 200 with workflows array
   - ✅ Should contain workflows from previous requests
   - ✅ Automatically saves first workflow ID for next test

3. Run "Dashboard API → Get Workflow by ID"
   - ✅ Should return 200 with specific workflow details
   - ✅ Should include all events for that workflow

4. Run "Dashboard API → SSE Events Stream"
   - ✅ Should return 200
   - ✅ Should have `Content-Type: text/event-stream`
   - ⚠️ Note: SSE streaming may not display properly in Postman

## Automated Test Scripts

Each request includes automated test scripts that verify:

- Correct HTTP status codes
- Response structure and required fields
- Data types and values
- Observability features are enabled

Tests will automatically pass/fail in the Postman test results panel.

## Expected Results

### Without Payment Headers

All protected endpoints (`/api/premium`, `/api/data`) should:
- Return **402 Payment Required**
- Include payment requirements in response
- Log events to `.x402-observed/events.db`:
  - `request_received`
  - `payment_required`

### With Valid Payment Headers

(Requires actual wallet and USDC - not included in basic tests)
- Return **200 OK** with content
- Log complete workflow:
  - `request_received`
  - `payment_header_received`
  - `verify_called`
  - `verify_result`
  - `settle_called`
  - `settle_result` (with transaction hash)
  - `workflow_completed`

### Dashboard APIs

- **GET /api/workflows**: Returns all workflows with events
- **GET /api/workflows/:id**: Returns specific workflow details
- **GET /api/events**: Streams real-time events via SSE

## Testing SSE (Server-Sent Events)

Postman doesn't handle SSE streams well. To test SSE properly:

### Using curl:

```bash
curl -N http://localhost:4402/api/events
```

Keep this running in a terminal, then make requests to the Express/Next.js endpoints in another terminal. You'll see events appear in real-time.

### Using Browser:

```javascript
// Open browser console at http://localhost:4402
const eventSource = new EventSource('/api/events');
eventSource.onmessage = (event) => {
  console.log('New event:', JSON.parse(event.data));
};
```

## Troubleshooting

### "Connection refused" errors

- Ensure the server is running on the correct port
- Express/Next.js: Port 3000
- Dashboard: Port 4402

### "No workflows found"

- Make at least one request to a protected endpoint first
- Check that `.x402-observed/events.db` exists

### Tests failing

- Verify servers are running
- Check environment variables are set correctly
- Ensure ports are not in use by other applications

### SSE not working in Postman

- This is expected - SSE is a streaming protocol
- Use curl or browser console instead
- Or test via the dashboard UI at http://localhost:4402

## Running All Tests

To run all tests in sequence:

1. In Postman, click the collection name
2. Click "Run" button
3. Select all requests
4. Click "Run x402-observed API Tests"

This will execute all requests and show a summary of passed/failed tests.

## CI/CD Integration

To integrate with CI/CD pipelines:

```bash
# Install newman
npm install -g newman

# Run tests
newman run typescript/examples/x402-observed-api-tests.postman_collection.json \
  --environment your-environment.json \
  --reporters cli,json \
  --reporter-json-export results.json
```

## Next Steps

After verifying the APIs work correctly:

1. Test with real payment flows (requires wallet and USDC)
2. Monitor the dashboard for real-time workflow updates
3. Inspect the SQLite database directly
4. Create additional test scenarios
5. Integrate into your CI/CD pipeline

## Additional Resources

- [Postman Documentation](https://learning.postman.com/)
- [Newman CLI Documentation](https://learning.postman.com/docs/running-collections/using-newman-cli/command-line-integration-with-newman/)
- [x402 Documentation](https://docs.x402.org)

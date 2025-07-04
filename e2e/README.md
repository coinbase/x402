# X402 End-to-End Test Suite

This directory contains a comprehensive end-to-end test suite for the X402 payment protocol, testing client-server-facilitator communication across multiple languages and frameworks.

## Overview

The test suite validates the complete X402 payment flow:
```
Client → Server → Facilitator → Server → Facilitator → Server → Client
```

It supports multiple languages (TypeScript, Python, Go) and frameworks (Express, FastAPI, Flask, Gin, Next.js) to ensure protocol compatibility across the entire ecosystem.

## Architecture

### Test Discovery
- **Dynamic Discovery**: Automatically discovers servers and clients by scanning subfolders
- **Configuration Files**: Each implementation has a `test.config.json` defining its capabilities
- **Environment Variables**: Supports dynamic configuration via `.env` files

### Proxy System
- **Language-Agnostic**: Uses CLI commands to run implementations
- **Structured Output**: All implementations output JSON results for consistent parsing
- **Process Management**: Handles startup, health checks, and graceful shutdown

### Test Scenarios
The suite tests all combinations of:
- **Clients**: TypeScript (axios, fetch), Python (httpx, requests)
- **Servers**: TypeScript (express, hono, next), Python (fastapi, flask), Go (gin)
- **Facilitators**: CDP facilitator enabled/disabled
- **Networks**: base-sepolia, base mainnet

## Installation

### Prerequisites
- Node.js 18+ and pnpm
- Python 3.10+ and uv
- Go 1.23+

### Setup

1. **Install TypeScript dependencies** (from the `e2e` directory):
   ```bash
   pnpm install
   ```

2. **Install Python dependencies** (run in each Python implementation directory):
   ```bash
   # For Python clients
   cd clients/httpx && uv sync
   cd ../requests && uv sync
   
   # For Python servers  
   cd ../../servers/fastapi && uv sync
   cd ../flask && uv sync
   ```

3. **Install Go dependencies** (run in the Go server directory):
   ```bash
   cd servers/gin && go mod tidy
   ```

## Running Tests

### Quick Start
```bash
pnpm test
```

This will:
1. Discover all available servers and clients
2. Run all test scenarios (client × server × facilitator × network combinations)
3. Display results with pass/fail status

### Test Output
```
🚀 Starting X402 E2E Test Suite
===============================
📋 Configuration:
   Server Address: 0x122F8Fcaf2152420445Aa424E1D8C0306935B5c9
   Server Port: 4021

🔍 Test Discovery Summary
========================
📡 Servers found: 6
   - express (typescript) - 1 x402 endpoints
   - fastapi (python) - 1 x402 endpoints
   - flask (python) - 1 x402 endpoints
   - gin (go) - 1 x402 endpoints
   - hono (typescript) - 1 x402 endpoints
   - next (typescript) - 1 x402 endpoints
📱 Clients found: 4
   - axios (typescript)
   - fetch (typescript)
   - httpx (python)
   - requests (python)
🔧 Facilitator/Network combos: 3
📊 Test scenarios: 72

📊 Test Summary
==============
✅ Passed: 72
❌ Failed: 0
📈 Total: 72
```

## Implementation Structure

### Servers
Each server implements the standard protocol:
- `GET /protected` - Protected endpoint requiring payment
- `GET /health` - Health check endpoint  
- `POST /close` - Graceful shutdown endpoint

**Supported Servers:**
- `servers/express/` - TypeScript Express server
- `servers/fastapi/` - Python FastAPI server
- `servers/flask/` - Python Flask server
- `servers/gin/` - Go Gin server
- `servers/hono/` - TypeScript Hono server
- `servers/next/` - TypeScript Next.js server

### Clients
Each client makes requests to protected endpoints and handles payment responses.

**Supported Clients:**
- `clients/axios/` - TypeScript axios client
- `clients/fetch/` - TypeScript fetch client
- `clients/httpx/` - Python httpx client
- `clients/requests/` - Python requests client

### Configuration Files

#### test.config.json
```json
{
  "name": "server-name",
  "type": "server",
  "language": "typescript|python|go",
  "description": "Description of the implementation",
  "endpoints": [
    {
      "path": "/protected",
      "method": "GET",
      "description": "Protected endpoint requiring payment",
      "requiresPayment": true
    }
  ],
  "environment": {
    "required": ["ADDRESS"],
    "optional": ["PORT", "USE_CDP_FACILITATOR", "NETWORK"]
  }
}
```

#### run.sh
Each implementation has a `run.sh` script that starts the process:
```bash
#!/bin/bash
# For TypeScript
pnpm dev

# For Python  
uv run python main.py

# For Go
go run main.go
```

## Environment Variables

### Required
- `ADDRESS` - Server wallet address for receiving payments

### Optional
- `PORT` - Server port (default: 4021)
- `USE_CDP_FACILITATOR` - Enable CDP facilitator (default: false)
- `NETWORK` - Network to use (default: base-sepolia)
- `CDP_API_KEY_ID` - CDP API key ID (required if USE_CDP_FACILITATOR=true)
- `CDP_API_KEY_SECRET` - CDP API key secret (required if USE_CDP_FACILITATOR=true)

### Client-Specific
- `PRIVATE_KEY` - Client private key for signing payments
- `RESOURCE_SERVER_URL` - Server URL to connect to
- `ENDPOINT_PATH` - Endpoint path to request

## Adding New Implementations

### 1. Create Implementation Directory
```
e2e/
├── servers/
│   └── your-server/
│       ├── main.py (or index.ts, main.go)
│       ├── run.sh
│       ├── test.config.json
│       └── pyproject.toml (for Python)
└── clients/
    └── your-client/
        ├── main.py (or index.ts)
        ├── run.sh
        ├── test.config.json
        └── pyproject.toml (for Python)
```

### 2. Implement Protocol
- **Servers**: Implement `/protected`, `/health`, `/close` endpoints
- **Clients**: Output JSON results with success/error status
- **Environment**: Use standard environment variables

### 3. Create Configuration
- Add `test.config.json` with proper metadata
- Create `run.sh` script for process startup
- Install dependencies (uv sync, go mod tidy, etc.)

### 4. Test
Run `pnpm test` to verify your implementation works with the test suite.

## Troubleshooting

### Common Issues

**Python Import Errors**
- Ensure `uv sync` was run in the implementation directory
- Check that `x402` is properly referenced in `pyproject.toml`

**Go Module Errors**
- Run `go mod tidy` in the Go implementation directory
- Verify the `replace` directive in `go.mod` points to the correct x402 path

**Next.js Build Errors**
- The Next.js server uses development mode for faster startup
- Check that all dependencies are installed with `pnpm install`

**Health Check Failures**
- Verify the server is listening on the correct port
- Check that the `/health` endpoint returns the expected JSON format
- Ensure the server outputs "Server listening on port X" for the proxy to detect

### Debugging

**Manual Testing**
```bash
# Test a server manually
cd servers/express
ADDRESS=0x123... PORT=4021 pnpm dev

# Test a client manually  
cd clients/axios
PRIVATE_KEY=0xabc... RESOURCE_SERVER_URL=http://localhost:4021 ENDPOINT_PATH=/protected pnpm dev
```

**Verbose Logging**
- Check the proxy output in test results for detailed error messages
- Run implementations manually to see full logs
- Verify environment variables are set correctly

## Contributing

When adding new implementations:
1. Follow the existing patterns and file structure
2. Ensure all required endpoints are implemented
3. Test with multiple facilitator/network combinations
4. Update this README if adding new languages or frameworks
5. Keep implementations minimal and focused on protocol compliance

## License

This test suite is part of the X402 project and follows the same license terms.

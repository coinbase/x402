# Gin v2 Server Implementation Summary

## Overview

This is a new **v2 Gin server** implementation for E2E testing, parallel to the existing v2 Express server. It uses the new v2 middleware from `go/http/gin/middleware.go`.

## Key Differences from Legacy Gin Server

| Aspect | Legacy (`e2e/legacy/servers/gin`) | v2 (`e2e/servers/gin`) |
|--------|----------------------------------|------------------------|
| **x402 Version** | v1 | v2 |
| **Package Import** | `github.com/coinbase/x402/go/pkg/gin` | `github.com/coinbase/x402-go/v2/http/gin` |
| **Network Format** | `"base-sepolia"` (string) | `"eip155:84532"` (CAIP-2) |
| **Middleware API** | Function-based with options | Route-based configuration |
| **Service Registration** | Implicit | Explicit via `WithScheme()` |
| **Facilitator Config** | `types.FacilitatorConfig` | `x402http.FacilitatorConfig` |

## Architecture

```
┌──────────────────┐
│  Gin Framework   │
│   (ginfw)        │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ x402 v2 Gin      │
│  Middleware      │◄────── Routes Config
└────────┬─────────┘
         │
         ├──────► Facilitator Client (HTTP)
         │
         └──────► EVM Service (ExactEvmService)
```

## File Structure

```
e2e/servers/gin/
├── main.go                 # Server implementation
├── go.mod                  # Go module dependencies
├── go.sum                  # Dependency checksums
├── test.config.json        # E2E test configuration
├── run.sh                  # Startup script
├── README.md              # User documentation
├── IMPLEMENTATION.md      # This file
└── .gitignore            # Git ignore rules
```

## Configuration

### Environment Variables (Required)

- `PORT`: Server port
- `EVM_ADDRESS`: Ethereum address to receive payments
- `FACILITATOR_URL`: URL of the facilitator service

### Test Config (`test.config.json`)

```json
{
  "name": "gin",
  "type": "server",
  "language": "go",
  "x402Version": 2,
  "endpoints": [
    {
      "path": "/protected",
      "method": "GET",
      "requiresPayment": true,
      "protocolFamily": "evm"
    },
    {
      "path": "/health",
      "method": "GET",
      "health": true
    },
    {
      "path": "/close",
      "method": "POST",
      "close": true
    }
  ]
}
```

## Implementation Details

### 1. Package Imports

Using v2 packages with proper aliasing to avoid conflicts:

```go
import (
    x402 "github.com/coinbase/x402-go/v2"
    x402http "github.com/coinbase/x402-go/v2/http"
    "github.com/coinbase/x402-go/v2/http/gin"
    "github.com/coinbase/x402-go/v2/mechanisms/evm"
    ginfw "github.com/gin-gonic/gin"  // Aliased to avoid conflict
)
```

### 2. Middleware Configuration

Routes-based configuration matching Express v2 style:

```go
routes := x402http.RoutesConfig{
    "GET /protected": {
        Scheme:  "exact",
        PayTo:   payeeAddress,
        Price:   "$0.001",
        Network: network,
    },
}
```

### 3. Service Registration

Explicit EVM service registration:

```go
evmService := evm.NewExactEvmService()

r.Use(gin.PaymentMiddleware(
    routes,
    gin.WithFacilitatorClient(facilitatorClient),
    gin.WithScheme(network, evmService),
    gin.WithInitializeOnStart(true),
    gin.WithTimeout(30*time.Second),
))
```

### 4. Remote Facilitator

Uses HTTP facilitator client:

```go
facilitatorClient := x402http.NewHTTPFacilitatorClient(&x402http.FacilitatorConfig{
    URL: facilitatorURL,
})
```

## Testing

### Automatic Discovery

The E2E test runner will automatically discover this server because:

1. ✅ Located in `e2e/servers/gin/`
2. ✅ Has `test.config.json` with `"type": "server"`
3. ✅ Has executable `run.sh` script
4. ✅ Declares `"x402Version": 2`

### Running Tests

```bash
# Run all v2 tests (includes this server)
cd e2e
pnpm test

# Run all tests including legacy
pnpm test --legacy
```

### Expected Test Scenarios

With this server, the test suite will create scenarios like:

- ✅ `fetch → gin → /protected via typescript`
- ✅ `fetch → gin → /protected via go`
- ✅ `go-http → gin → /protected via typescript`
- ✅ `go-http → gin → /protected via go`

## Payment Flow

1. **Request without payment**
   ```
   GET /protected
   ```

2. **Server returns 402**
   ```json
   {
     "error": "Payment required",
     "accepts": [{ ... }],
     "x402_version": 2
   }
   ```

3. **Client creates payment via facilitator**

4. **Client retries with X-Payment header**
   ```
   GET /protected
   X-Payment: <payment-payload>
   ```

5. **Middleware verifies payment with facilitator**

6. **Server returns protected content**
   ```json
   {
     "message": "Protected endpoint accessed successfully",
     "timestamp": "2024-10-26T19:00:00Z"
   }
   ```

7. **Server settles payment and returns X-Payment-Response**

## Troubleshooting

### Build Errors

If you get build errors:

```bash
cd e2e/servers/gin
go mod tidy
go build
```

### Server Won't Start

Check that all required environment variables are set:

```bash
export PORT=4021
export EVM_ADDRESS=0x...
export FACILITATOR_URL=http://localhost:4022
./run.sh
```

### Not Discovered by Tests

Verify:
1. File is at `e2e/servers/gin/test.config.json`
2. `run.sh` is executable: `chmod +x run.sh`
3. Config has `"type": "server"` and `"x402Version": 2`

## Related Files

- **v2 Middleware**: `go/http/gin/middleware.go`
- **Legacy Gin Server**: `e2e/legacy/servers/gin/main.go`
- **v2 Express Server**: `e2e/servers/express/index.ts`
- **Test Runner**: `e2e/test.ts`
- **Discovery Logic**: `e2e/src/discovery.ts`

## Success Criteria

✅ Server compiles without errors  
✅ Server starts and logs "Server listening"  
✅ Health check endpoint responds  
✅ Protected endpoint returns 402 without payment  
✅ Payment flow completes successfully  
✅ Graceful shutdown works via /close endpoint  
✅ Test suite discovers and tests the server  

## Status

🎉 **COMPLETE** - Implementation finished and ready for testing!


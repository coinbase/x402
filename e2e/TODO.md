# End-to-End Testing TODO

## Overview

The e2e test suite validates the complete x402 payment flow across different client and server implementations, ensuring protocol compliance and interoperability between all SDKs.

## Current Status

### Implemented
- ✅ Express server (TypeScript) - reference implementation
- ✅ Fetch client (TypeScript) - reference implementation
- ✅ Test harness with automatic discovery and execution
- ✅ Support for both v1 and v2 protocol testing

### Pending Implementation
- 🔄 Hono server (TypeScript)
- 🔄 Next.js server (TypeScript)
- 🔄 Axios client (TypeScript)
- 🔄 Python servers (FastAPI, Flask)
- 🔄 Python clients (httpx, requests)
- 🔄 Go servers (Gin)
- 🔄 Go clients

## Facilitator Support

### Local Facilitators
Add one facilitator implementation per language in `/facilitators/`:
- `/facilitators/typescript` - TypeScript facilitator implementation
- `/facilitators/python` - Python facilitator implementation
- `/facilitators/go` - Go facilitator implementation

### Remote Facilitators
Add configuration support for external facilitator services:
- x402.org facilitator
- CDP (Coinbase Developer Platform) facilitator
- Custom facilitator endpoints

## Test Runner Improvements

### Configuration Flags
Enhance the test runner to support:
- `--facilitator` flag to select which facilitator(s) to use
  - `local` - Use local facilitator implementations
  - `x402` - Use x402.org facilitator
  - `cdp` - Use CDP facilitator
  - `all` - Test against all available facilitators
- `--client` flag to filter which clients to test
- `--server` flag to filter which servers to test
- `--protocol-version` flag to test specific protocol versions (v1, v2, or both)

### Test Matrix
Implement comprehensive testing matrix:
- All client × server combinations
- All facilitator options
- Both protocol versions where applicable
- Different payment mechanisms (EVM, Solana, etc.)

## Protocol Files

The test suite uses standardized protocols for communication:
- `/e2e/servers/text-server-protocol.txt` - Server implementation requirements
- `/e2e/clients/text-client-protocol.txt` - Client implementation requirements

All new implementations must follow these protocols to ensure compatibility with the test harness.
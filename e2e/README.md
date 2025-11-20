# E2E Tests

End-to-end test suite for validating client-server-facilitator communication across languages and frameworks.

## Environment Variables

Required:

- `ADDRESS`: Server wallet address
- `PRIVATE_KEY`: Client private key (when running single client)

## Quick Start

```bash
# Full suite
pnpm test                     # Run all tests

# Development mode (recommended)
pnpm test -d                  # Test on testnet
pnpm test -d -v               # Test with verbose logging

# Language filters
pnpm test -d -ts              # Test TypeScript implementations
pnpm test -d -py              # Test Python implementations
```

## Filtering Tests

### Implementation Filters

```bash
--client=<name>               # Test specific client
--server=<name>              # Test specific server

# Available implementations
Clients: httpx, axios, fetch, requests
Servers: express, fastapi, flask, hono, next

# Examples
pnpm test -d -ts --client=axios     # Test TypeScript axios client
pnpm test -d -py --server=fastapi   # Test Python FastAPI server
```

### Language Flags (can combine)

```bash
-ts, --typescript              # TypeScript implementations
-py, --python                  # Python implementations

# Examples
pnpm test -ts -py             # Test TypeScript and Python together
```

### Environment Filters

```bash
--network=<name>              # arc-testnet
--prod=<true|false>

# Examples
pnpm test --prod=true        # Test production scenarios
pnpm test --network=arc-testnet     # Test on arc-testnet network
```

### Common Workflows

```bash
# Local Development
pnpm test -d -ts                     # TypeScript development
pnpm test -d -py                     # Python development
pnpm test -d -ts --server=next       # Next.js middleware development
pnpm test -d -py --client=httpx      # Python httpx client development

# Cross-Language Testing
pnpm test -ts -py                    # Test TypeScript/Python compatibility

# Production Testing
pnpm test --prod=true -ts            # Test TypeScript in production
pnpm test --network=arc-testnet -py         # Test Python on arc-testnet network
```

### Environment Options

```bash
-d, --dev                  # Development mode (testnet)
-v, --verbose              # Detailed logging
--log-file=<path>          # Save output to file
```

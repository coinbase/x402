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
pnpm test -d -go              # Test Go implementations

# Legacy compatibility testing
pnpm test --legacy            # Include legacy implementations
pnpm test --legacy -d -ts     # Test legacy + new TypeScript implementations
```

## Filtering Tests

### Implementation Filters
```bash
--client=<name>               # Test specific client
--server=<name>              # Test specific server

# Available implementations
Clients: httpx, axios, fetch, requests
Servers: express, fastapi, flask, gin, hono, next

# Examples
pnpm test -d -ts --client=axios     # Test TypeScript axios client
pnpm test -d -py --server=fastapi   # Test Python FastAPI server
```

### Language Flags (can combine)
```bash
-ts, --typescript              # TypeScript implementations
-py, --python                  # Python implementations
-go, --go                      # Go implementations

# Examples
pnpm test -ts -py             # Test TypeScript and Python together
pnpm test -py -go             # Test Python and Go together
```

### Environment Filters
```bash
--network=<name>              # base or base-sepolia
--prod=<true|false>          # true=CDP facilitator, false=no CDP

# Examples
pnpm test --prod=true        # Test production scenarios
pnpm test --network=base     # Test on base network
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
pnpm test -d -py -go                 # Test Python/Go on testnet

# Legacy Compatibility Testing
pnpm test --legacy -d                # Test both new and legacy implementations
pnpm test --legacy --client=legacy-axios # Test specific legacy client with new servers
pnpm test --legacy --server=legacy-express # Test specific legacy server with new clients

# Production Testing
pnpm test --prod=true -ts            # Test TypeScript in production
pnpm test --network=base -py         # Test Python on base network
```

### Environment Variables

Required environment variables (set in `.env` file):
```bash
CLIENT_EVM_PRIVATE_KEY=0x...  # Private key for client wallet
CLIENT_SVM_PRIVATE_KEY=...    # Solana private key for client
SERVER_EVM_ADDRESS=0x...      # Server's EVM payment address
SERVER_SVM_ADDRESS=...        # Server's Solana payment address

# Optional (for real blockchain facilitator)
EVM_RPC_URL=https://sepolia.base.org  # RPC endpoint for blockchain access (defaults to Base Sepolia)
```

### Environment Options

```bash
-d, --dev                  # Development mode (testnet, no CDP)
-v, --verbose              # Detailed logging
--legacy                   # Include legacy implementations from /legacy directory
--log-file=<path>          # Save output to file
```

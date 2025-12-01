# E2E Tests

End-to-end test suite for validating client-server-facilitator communication across languages and frameworks.

## Usage

### Interactive Test Mode

```bash
pnpm test
```

Launches an interactive CLI where you can select:
- **Facilitators** - Payment verification/settlement services (Go, TypeScript)
- **Servers** - Protected endpoints requiring payment (Express, Gin, Hono, Next.js, FastAPI, Flask, etc.)
- **Clients** - Payment-capable HTTP clients (axios, fetch, httpx, requests, etc.)
- **Extensions** - Additional features like Bazaar discovery
- **Protocols** - EVM and/or SVM networks

Every valid combination of your selections will be tested. For example, selecting 2 facilitators, 3 servers, and 2 clients will generate and run all compatible test scenarios.

### Minimized Test Mode

```bash
pnpm test --min
```

Same interactive CLI, but with intelligent test minimization:
- **90% fewer tests** compared to full mode
- Each selected component is tested at least once across all variations
- Skips redundant combinations that provide no additional coverage
- Example: `legacy-hono` (v1 only) tests once, while `express` (v1+v2, EVM+SVM) tests all 4 combinations

Perfect for rapid iteration during development while maintaining comprehensive coverage.

### Verbose Logging

```bash
pnpm test -v
pnpm test --min -v
```

Add the `-v` flag to any command for verbose output:
- Prints all facilitator logs
- Prints all server logs  
- Prints all client logs
- Shows detailed information after each test scenario

Useful for debugging test failures or understanding the payment flow.

## Environment Variables

Required environment variables (set in `.env` file):

```bash
# Client wallets
CLIENT_EVM_PRIVATE_KEY=0x...        # EVM private key for client payments
CLIENT_SVM_PRIVATE_KEY=...          # Solana private key for client payments

# Server payment addresses
SERVER_EVM_ADDRESS=0x...            # Where servers receive EVM payments
SERVER_SVM_ADDRESS=...              # Where servers receive Solana payments

# Facilitator wallets (for payment verification/settlement)
FACILITATOR_EVM_PRIVATE_KEY=0x...   # EVM private key for facilitator
FACILITATOR_SVM_PRIVATE_KEY=...     # Solana private key for facilitator
```

## Example Session

```bash
$ pnpm test --min

🎯 Interactive Mode
==================

✔ Select facilitators › go, typescript
✔ Select servers › express, hono, legacy-express
✔ Select clients › axios, fetch, httpx
✔ Select extensions › bazaar
✔ Select protocol families › EVM, SVM

📊 Coverage-Based Minimization
Total scenarios: 156
Selected scenarios: 18 (88.5% reduction)

✅ Passed: 18
❌ Failed: 0
```

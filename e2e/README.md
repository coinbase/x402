# E2E Tests

End-to-end test suite for validating client-server-facilitator communication across languages and frameworks.

## Setup

### First Time Setup

Install all dependencies (TypeScript via pnpm, Go, Python):

```bash
pnpm install:all
```

This will:
1. Install TypeScript dependencies via `pnpm install`
2. Run `install.sh` and `build.sh` for all clients, servers, and facilitators
3. Handle nested directories (like `external-proxies/` and `local/`)

For legacy (v1) implementations as well:

```bash
pnpm install:all:legacy
```

### Individual Setup

If you only want to set up v2 implementations:

```bash
pnpm setup
```

Or manually for a specific component:

```bash
cd facilitators/go
bash install.sh
bash build.sh
```

## Usage

### Run All Tests (Headless, Default)

```bash
pnpm test
```

Runs ALL tests headlessly on testnet. No prompts — suitable for CI and agent invocation.

### Interactive Mode

```bash
pnpm test -i
```

Launches an interactive CLI where you can select:
- **Facilitators** - Payment verification/settlement services (Go, TypeScript)
- **Servers** - Protected endpoints requiring payment (Express, Gin, Hono, Next.js, FastAPI, Flask, etc.)
- **Clients** - Payment-capable HTTP clients (axios, fetch, httpx, requests, etc.)
- **Extensions** - Additional features like Bazaar discovery
- **Protocols** - EVM, SVM, Aptos, and/or Stellar networks

Every valid combination of your selections will be tested. For example, selecting 2 facilitators, 3 servers, and 2 clients will generate and run all compatible test scenarios.

### Minimized Test Mode

```bash
pnpm test --min
```

Same as default but with intelligent test minimization:
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

### Filter Tests (Headless)

Run a subset of tests without entering interactive mode:

```bash
pnpm test --facilitators=go --servers=express
pnpm test --testnet --families=evm
pnpm test --mainnet --facilitators=go --servers=express
```

### Parallel Execution

```bash
pnpm test --min --parallel -v
pnpm test --min --parallel --concurrency=8 -v
```

With `--parallel`, test combos run concurrently. The scheduler automatically partitions work by protocol family (EVM, SVM, APTOS, STELLAR) so that each family runs in its own independent lane. Different families never block each other.

Within each family, parallelism is controlled by the number of comma-delimited private keys you provide (see [Plural Keys for Parallelism](#plural-keys-for-parallelism) below). One key pair = one sub-lane within that family.

The `--concurrency=<N>` flag sets an overall cap on how many combos execute simultaneously across all families (default: 4).

## Environment Variables

Required environment variables (set in `.env` file):

```bash
# Client wallets
CLIENT_EVM_PRIVATE_KEY=0x...        # EVM private key for client payments
CLIENT_SVM_PRIVATE_KEY=...          # Solana private key for client payments
CLIENT_APTOS_PRIVATE_KEY=...        # Aptos private key for client payments (hex string)
CLIENT_STELLAR_PRIVATE_KEY=...      # Stellar private key for client payments

# Server payment addresses
SERVER_EVM_ADDRESS=0x...            # Where servers receive EVM payments
SERVER_SVM_ADDRESS=...              # Where servers receive Solana payments
SERVER_APTOS_ADDRESS=0x...          # Where servers receive Aptos payments
SERVER_STELLAR_ADDRESS=...          # Where servers receive Stellar payments

# Facilitator wallets (for payment verification/settlement)
FACILITATOR_EVM_PRIVATE_KEY=0x...   # EVM private key for facilitator
FACILITATOR_SVM_PRIVATE_KEY=...     # Solana private key for facilitator
FACILITATOR_APTOS_PRIVATE_KEY=...   # Aptos private key for facilitator (hex string)
FACILITATOR_STELLAR_PRIVATE_KEY=... # Stellar private key for facilitator
```

### Plural Keys for Parallelism

To run multiple tests within a protocol family concurrently without nonce or gas-estimation collisions, provide comma-delimited key lists. Each pair (client key N + facilitator key N) maps to a unique sub-lane that runs independently.

Plural keys are supported for **all** families:

```bash
# EVM (prevents nonce collisions)
CLIENT_EVM_PRIVATE_KEYS=0xkey1,0xkey2,0xkey3
FACILITATOR_EVM_PRIVATE_KEYS=0xfkey1,0xfkey2,0xfkey3

# SVM
CLIENT_SVM_PRIVATE_KEYS=svmkey1,svmkey2
FACILITATOR_SVM_PRIVATE_KEYS=svmfkey1,svmfkey2

# APTOS
CLIENT_APTOS_PRIVATE_KEYS=aptoskey1,aptoskey2
FACILITATOR_APTOS_PRIVATE_KEYS=aptosfkey1,aptosfkey2

# STELLAR
CLIENT_STELLAR_PRIVATE_KEYS=stellarkey1,stellarkey2
FACILITATOR_STELLAR_PRIVATE_KEYS=stellarfkey1,stellarfkey2
```

Rules:
- The count of client keys and facilitator keys must be equal for each family.
- Singular (`CLIENT_EVM_PRIVATE_KEY`) and plural (`CLIENT_EVM_PRIVATE_KEYS`) are supported; plural takes precedence.
- With N key pairs for a family, up to N tests of that family run concurrently, each using a unique key pair.
- Different families always run in independent lanes (EVM work never blocks SVM, etc.).
- The `--parallel` flag is also required to enable concurrent combo execution.

### Account Setup Instructions

#### Stellar Testnet

You need **three separate Stellar accounts** for e2e tests (client, server, facilitator):

1. Go to [Stellar Laboratory](https://lab.stellar.org/account/create) ➡️ Generate keypair ➡️ Fund account with Friendbot, then copy the `Secret` and `Public` keys so you can use them.
2. Add USDC trustline (required for client and server): go to [Fund Account](https://lab.stellar.org/account/fund) ➡️ Paste your `Public Key` ➡️ Add USDC Trustline ➡️ paste your `Secret key` ➡️ Sign transaction ➡️ Add Trustline.
3. Get testnet USDC from [Circle Faucet](https://faucet.circle.com/) (select Stellar network).

> **Note:** The facilitator account only needs XLM (step 1). Client and server accounts need all three steps.

## Example Session

```bash
$ pnpm test --min

🤖 Programmatic Mode
===================

✅ 18 scenarios selected

✅ Passed: 18
❌ Failed: 0
```

```bash
$ pnpm test -i --min

🎯 Interactive Mode
==================

✔ Select facilitators › go, typescript
✔ Select servers › express, hono, legacy-express
✔ Select clients › axios, fetch, httpx
✔ Select extensions › bazaar
✔ Select protocol families › EVM, SVM, Aptos, Stellar

📊 Coverage-Based Minimization
Total scenarios: 156
Selected scenarios: 18 (88.5% reduction)

✅ Passed: 18
❌ Failed: 0
```

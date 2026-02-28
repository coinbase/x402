# Proxy Signer Example

This example demonstrates the **proxy signer pattern**: a Java server backed by
the [Coinbase CDP SDK](https://github.com/coinbase/cdp-sdk) holds the signing
keys, while TypeScript and Python x402 clients create custom signer classes that
forward signing operations to it over HTTP.

This is useful when:

- Your signing keys live in a separate service (custody, HSM, MPC, etc.)
- You want to use the CDP SDK from a language that doesn't have an x402 SDK
- You want a single signing backend shared across multiple client languages

## Architecture

```
┌─────────────────────────┐
│  TypeScript / Python    │
│  x402 Client            │
│                         │
│  ProxyEvmSigner ────────┼──► POST /evm/sign-typed-data
│  ProxySvmSigner ────────┼──► POST /svm/partial-sign-transaction
└────────────┬────────────┘
             │
             │  HTTP (JSON)
             ▼
┌─────────────────────────┐
│  Java Server (Javalin)  │
│                         │
│  /evm/sign-typed-data   │──► cdp.evm().signTypedData()
│  /svm/partial-sign-tx   │──► cdp.solana().signTransaction()
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  Coinbase CDP SDK       │
│  (server-managed keys)  │
└─────────────────────────┘
```

## What the demo does

Each test script runs two paid requests against the same `/weather` endpoint
(which accepts both EVM and Solana payment):

1. **Request 1** -- uses a `registerPolicy` to prefer **Base Sepolia (EVM)**
2. **Request 2** -- uses a `registerPolicy` to prefer **Solana Devnet**

Both requests use `onBeforePaymentCreation` / `onAfterPaymentCreation` hooks to
log which network was selected and when signing completes.

On first startup the Java server checks USDC balances on both networks and
requests testnet faucet funds if either is below $0.10.

## Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/evm/address` | GET | Returns the EVM account address |
| `/evm/sign-typed-data` | POST | Signs EIP-712 typed data via CDP SDK |
| `/svm/address` | GET | Returns the Solana account address |
| `/svm/partial-sign-transaction` | POST | Partially signs a Solana transaction via CDP SDK |

## Prerequisites

- **Node.js 18+** (for the TypeScript client and resource server)
- **Python 3.10+** (for the Python client)
- A [CDP API Key](https://portal.cdp.coinbase.com/access/api) with wallet secret
- A GitHub personal access token with `read:packages` scope (to pull the CDP SDK
  from GitHub Packages), or `gh` CLI authenticated to `github.com`

Java 21 is required by the CDP SDK but is **downloaded automatically** by the
Gradle wrapper on first run -- no manual install needed.

## Setup

### 1. Create `.env`

All projects share a single `.env` file at the root of `examples/proxy-signer/`:

```bash
cp .env-local .env
```

Fill in your CDP credentials and GitHub credentials:

```
CDP_API_KEY_ID=...
CDP_API_KEY_SECRET=...
CDP_WALLET_SECRET=...
GITHUB_USERNAME=your-github-username
GITHUB_TOKEN=ghp_...
```

If you have `gh` CLI authenticated to `github.com` the test scripts will
auto-detect the GitHub credentials and you can leave those blank.

### 2. Run the test scripts

Each script starts the Java proxy server, the x402 resource server, and the
client, then cleans everything up on exit. Server logs go to `.logs/`.

```bash
# TypeScript client
./test-typescript.sh

# Python client
./test-python.sh
```

## How It Works

### EVM: ProxyEvmSigner

The x402 EVM "exact" scheme needs a signer that can do
[EIP-712 typed data signing](https://eips.ethereum.org/EIPS/eip-712). Instead of
holding a private key locally, `ProxyEvmSigner` forwards the typed data to
`POST /evm/sign-typed-data` on the Java server, which calls
`cdp.evm().signTypedData()` and returns the signature.

```
x402 ExactEvmScheme
  └─ signer.signTypedData({ domain, types, primaryType, message })
       └─ HTTP POST /evm/sign-typed-data  →  CDP SDK  →  signature
```

### SVM: ProxySvmSigner

The x402 SVM "exact" scheme builds a Solana transaction, partially signs it (the
client signs their part, the facilitator signs later), and returns it as base64.

- **TypeScript**: `ProxySvmSigner` implements `TransactionSigner` from
  `@solana/kit`. Its `signTransactions()` serializes each transaction to base64,
  sends it to `POST /svm/partial-sign-transaction`, and decodes the signed
  response.

- **Python**: The `ExactSvmScheme` calls `signer.keypair.sign_message(bytes)`
  internally. `ProxySvmSigner` provides a `_RemoteKeypair` object that intercepts
  this call, wraps the message bytes into a full transaction with placeholder
  signatures, sends it to the proxy for signing, and extracts the resulting
  signature.

```
x402 ExactSvmScheme
  └─ signer.keypair.sign_message(tx_message_bytes)       [Python]
     signer.signTransactions([tx])                        [TypeScript]
       └─ HTTP POST /svm/partial-sign-transaction  →  CDP SDK  →  signed tx
```

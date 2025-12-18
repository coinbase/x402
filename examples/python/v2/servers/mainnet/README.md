# x402 V2 Mainnet Example (Base Mainnet)

This example demonstrates how to run an x402-enabled server on **Base Mainnet** (`eip155:8453`).

## Prerequisites

- [uv](https://github.com/astral-sh/uv) (for package management)
- A Coinbase Developer Platform (CDP) API Key (required for mainnet facilitator access).

## Setup

1. Copy `.env-local` to `.env`:
   ```bash
   cp .env-local .env
   ```
2. Fill in your `ADDRESS` (EVM wallet address to receive payments).
3. Fill in your `CDP_API_KEY_ID` and `CDP_API_KEY_SECRET`.

## Running the Server

```bash
uv run uvicorn main:app --host 0.0.0.0 --port 4021
```

The server will start on port `4021`.

## Features

- **Strict V2 Compliance**: Uses `eip155:8453` network identifier.
- **Facilitator Configuration**: Demonstrates how to pass `facilitator_config` required for mainnet.
- **Client Compatibility**: Works with `@x402/fetch`, `@x402/axios`, and `@x402/evm`.

## Routes

- `GET /weather`: Simple payment ($0.001 USDC).
- `GET /premium/content`: Another example.

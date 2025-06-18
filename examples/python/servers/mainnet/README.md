# x402 Mainnet Example Server

This example demonstrates how to accept real USDC payments on Base mainnet using Coinbase's [hosted x402 facilitator](https://docs.cdp.coinbase.com/x402/docs/welcome).

## Prerequisites

- Python 3.10+
- A valid Ethereum address for receiving payments

## Setup

1. Copy `.env-local` to `.env` and add your Ethereum address to receive payments:

```bash
cp .env-local .env
```

2. Install dependencies:
```bash
uv sync
```

3. Run the server:
```bash
uv run python main.py
```

The server will start on http://localhost:4021

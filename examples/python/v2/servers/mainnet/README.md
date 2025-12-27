# x402 V2 Mainnet Server Example (Python)

This example demonstrates how to integrate **x402 V2** into a FastAPI server to accept real USDC payments on **Base Mainnet**.

Unlike the legacy version, this implementation uses the modular x402 SDK, providing cleaner middleware integration and robust payment verification.

## Prerequisites

- **Python 3.10+** (Python 3.13 recommended)
- **Base Mainnet Funds:** A valid Ethereum address to receive payments.
- **Coinbase CDP Account:** A [Coinbase Developer Platform](https://cdp.coinbase.com/) account is **required** to use the hosted facilitator and receive real payments.

## Configuration

1. **Environment Setup:** Copy the template and configure your environment:
   ```bash
   cp .env-local .env
   ```

2. **Required Variables:** Open `.env` and fill in the following:
   - `ADDRESS`: Your Ethereum address on Base to receive USDC.
   - `CDP_API_KEY_ID`: Your CDP API Key ID.
   - `CDP_API_KEY_SECRET`: Your CDP API Key Secret.

## Getting Started

1. **Install Dependencies:**
   We use `uv` for lightning-fast dependency management:
   ```bash
   uv sync
   ```

2. **Run the Server:**
   ```bash
   uv run python main.py
   ```

The server will start on `http://localhost:4021`.

## How It Works

- **Resource Server:** The `x402ResourceServer` handles the core payment logic and communicates with the facilitator.
- **Scheme Registration:** It registers the `exact` payment scheme (EIP-3009) specifically for `eip155:8453` (Base Mainnet).
- **Payment Middleware:** Intercepts requests to protected routes. If a valid payment signature is missing, it automatically returns a `402 Payment Required` with the necessary payment instructions.
- **Protected Route:** The `/protected` endpoint is only accessible after the middleware successfully verifies the payment from the client.

---
*This example is part of the x402 V2 SDK contributions.*

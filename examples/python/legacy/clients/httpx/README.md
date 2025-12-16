# x402 httpx Client Example

This example demonstrates two different approaches to use the x402 package with httpx to make requests to 402-protected endpoints.

## Setup and Usage

1. Copy `.env-local` to `.env` and add your private key.

```bash
cp .env-local .env
```

2. Install dependencies:
```bash
uv sync
```

3. Run one of the examples:
```bash
# Simple approach
uv run python main.py

# Extensible approach
uv run python extensible.py
```

## Two Integration Approaches

### Simple Approach (main.py)

The simple approach uses `x402HttpxClient`, a pre-configured client that handles payments automatically:

```python
from x402.clients import x402HttpxClient

async with x402HttpxClient(account=account, base_url=base_url) as client:
    response = await client.get(endpoint_path)
```

### Extensible Approach (extensible.py)

The extensible approach uses `x402_payment_hooks` with your own httpx client:

```python
from x402.clients import x402_payment_hooks
import httpx

async with httpx.AsyncClient(base_url=base_url) as client:
    client.event_hooks = x402_payment_hooks(account)
    response = await client.get(endpoint_path)
```

## How it Works

Both examples:
1. Initialize an eth_account.Account instance from a private key
2. Configure the httpx client with x402 payment handling
3. Make a request to a protected endpoint
4. Handle the 402 Payment Required response automatically
5. Print the final response

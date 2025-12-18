# x402 HTTPX Client Example (V2)

This example demonstrates how to use the `httpx` library wrapper (Async) to automatically handle x402 V2 payments.

## Setup

1. Copy keys and URL:
   ```bash
   cp .env-local .env
   # Edit .env with your PRIVATE_KEY and SERVER_URL
   ```

2. Run the client:
   ```bash
   uv run python main.py
   ```

## How it works

```python
from x402.clients.httpx import x402HttpxClient
from eth_account import Account

# 1. Setup account
account = Account.from_key("YOUR_PRIVATE_KEY")

# 2. Use the Async context manager
async with x402HttpxClient(account, base_url="...") as client:
    # 3. Request resource
    # The client automatically handles 402/Payment logic
    response = await client.get("/weather")
```

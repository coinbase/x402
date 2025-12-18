# x402 Requests Client Example (V2)

This example demonstrates how to use the `requests` library wrapper to automatically handle x402 V2 payments.

The wrapper intercepts `402 Payment Required` responses, generates the necessary `PAYMENT-SIGNATURE` using your `eth-account` private key, and retries the request transparently.

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
from x402.clients.requests import x402_requests
from eth_account import Account

# 1. Setup account
account = Account.from_key("YOUR_PRIVATE_KEY")

# 2. Create session (wraps standard requests.Session)
session = x402_requests(account)

# 3. Request protected resource
# If 402 is returned, the session automatically pays and retries!
response = session.get("http://localhost:4021/weather")
```

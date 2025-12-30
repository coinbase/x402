# x402 requests Client Example

This example demonstrates how to use the x402 v2 SDK with requests (sync) to make requests to 402-protected endpoints.

## Setup

1. Copy `.env-example` to `.env` and add your private key:

```bash
cp .env-example .env
```

2. Install dependencies:

```bash
uv sync
```

## Usage

Run the example:

```bash
uv run python main.py
```

## How it Works

The example demonstrates the complete x402 payment flow:

1. **Initialize account** - Create an eth_account from your private key
2. **Create x402 client** - Set up the payment client
3. **Register EVM scheme** - Enable EVM-based payments using `register_exact_evm_client`
4. **Make request** - The `x402_requests` session automatically handles 402 responses:
   - Intercepts 402 Payment Required responses
   - Creates and signs payment payload
   - Retries request with payment header
   - Returns successful response
5. **Extract payment response** - Decode the settlement confirmation from response headers

## Code Overview

```python
from x402 import x402Client
from x402.http.clients.requests import x402_requests
from x402.http.x402_http_client import x402HTTPClient
from x402.mechanisms.evm.exact.register import register_exact_evm_client
from x402.mechanisms.evm.signers import EthAccountSigner

# Setup
account = Account.from_key(private_key)
client = x402Client()
register_exact_evm_client(client, EthAccountSigner(account))

# Make request - payment handling is automatic
with x402_requests(client) as session:
    response = session.get(url)

    # Extract payment settlement info
    http_client = x402HTTPClient(client)
    settle_response = http_client.get_payment_settle_response(
        lambda name: response.headers.get(name)
    )
    print(f"Transaction: {settle_response.transaction}")
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PRIVATE_KEY` | Your EVM private key (with or without 0x prefix) |
| `RESOURCE_SERVER_URL` | Base URL of the x402-protected server |
| `ENDPOINT_PATH` | Path to the protected endpoint |

## Learn More

- [x402 Python SDK](../../../../python/x402/)
- [x402 Protocol](https://x402.org)

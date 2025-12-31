# x402 requests Client Example

This example demonstrates two different approaches to use the x402 package with requests to make requests to 402-protected endpoints.

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
python main.py

# Extensible approach
python extensible.py
```

## Two Integration Approaches

### Simple Approach (main.py)

The simple approach uses `x402_requests`, which returns a pre-configured session that handles payments automatically:

```python
from x402.clients import x402_requests

session = x402_requests(account)
response = session.get(url)
```

### Extensible Approach (extensible.py)

The extensible approach uses `x402_http_adapter` with your own requests session:

```python
from x402.clients import x402_http_adapter
import requests

session = requests.Session()
adapter = x402_http_adapter(account)
session.mount("http://", adapter)
session.mount("https://", adapter)
response = session.get(url)
```

## How it Works

Both examples:
1. Initialize an eth_account.Account instance from a private key
2. Configure the requests session with x402 payment handling
3. Make a request to a protected endpoint
4. Handle the 402 Payment Required response automatically
5. Print the final response

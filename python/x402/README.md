# x402 Python SDK

Python implementation of the x402 payment protocol.

## Installation

Install the core package with your preferred framework/client:

```bash
# HTTP clients (pick one)
uv add x402[httpx]      # Async httpx client
uv add x402[requests]   # Sync requests client

# Server frameworks (pick one)
uv add x402[fastapi]    # FastAPI middleware
uv add x402[flask]      # Flask middleware

# Multiple extras
uv add x402[fastapi,httpx]

# Everything
uv add x402[all]
```

## Quick Start

```python
from x402 import x402Client, x402ResourceServer, x402Facilitator

# Client-side: Create payment payloads
client = x402Client()
client.register("eip155:8453", ExactEvmScheme(signer=my_signer))
payload = client.create_payment_payload(payment_required)

# Server-side: Protect resources
server = x402ResourceServer(facilitator_client)
server.register("eip155:8453", ExactEvmServerScheme())
server.initialize()
requirements = server.build_payment_requirements(config)

# Facilitator: Verify and settle payments
facilitator = x402Facilitator()
facilitator.register(["eip155:8453"], ExactEvmFacilitatorScheme(wallet))
result = facilitator.verify(payload, requirements)
```

## Components

- **x402Client** - Client-side payment creation with policies and hooks
- **x402ResourceServer** - Server-side resource protection
- **x402Facilitator** - Payment verification and settlement

## Documentation

See [x402.org](https://x402.org) for full documentation.

## License

MIT


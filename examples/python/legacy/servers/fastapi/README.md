# x402 fastapi Example Server

This is an example FastAPI server that demonstrates how to use the x402 `fastapi` middleware to implement paywall functionality in your API endpoints.

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

## Extending the Example

To add more paid endpoints, follow this pattern:

```python
# First, configure the payment middleware with your routes
app.middleware("http")(
    require_payment(
        path="/your-endpoint",
        price="$0.10",
        pay_to_address=ADDRESS,
        network=NETWORK,
    )
)

# Then define your routes as normal
@app.get("/your-endpoint")
async def your_endpoint():
    return {
        # Your response data
    }
```

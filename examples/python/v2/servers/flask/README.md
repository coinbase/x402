# x402 V2 Flask Example Server

This is an example Flask server that demonstrates how to use the strict x402 V2 `flask` middleware to implement paywall functionality in your API endpoints.

**Features:**
- Strict V2 standards (CAIP-2 Networks, `PAYMENT-SIGNATURE` headers).
- Compatible with V2 libraries (`@x402/fetch`, `@x402/axios`, `@x402/evm`).

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
# First, initialize the payment middleware
payment_middleware = PaymentMiddleware(app)

# Then add payment configurations for your routes (V2 Style)
payment_middleware.add(
    path="/your-endpoint",
    price="$0.10",
    pay_to_address=ADDRESS,
    network="eip155:84532", # Use proper CAIP-2 identifiers
    description="Premium Content", 
    mime_type="application/json"
)

# Then define your routes as normal
@app.route("/your-endpoint")
def your_endpoint():
    return jsonify({
        # Your response data
    })
```

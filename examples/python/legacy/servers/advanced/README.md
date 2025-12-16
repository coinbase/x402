# x402 Advanced Resource Server Example (Python)

This is an advanced Python example using FastAPI that demonstrates how to implement paywall functionality without using middleware. This approach is useful for more complex scenarios, such as:

- Asynchronous payment settlement
- Custom payment validation logic
- Complex routing requirements
- Integration with existing authentication systems

## Prerequisites

- Python 3.10+
- uv ([https://github.com/astral-sh/uv](https://github.com/astral-sh/uv?tab=readme-ov-file#installation))
- A valid Ethereum address for receiving payments
- Coinbase Developer Platform API Key & Secret (if accepting payments on Base mainnet)
  - Get them here: [https://portal.cdp.coinbase.com/projects](https://portal.cdp.coinbase.com/projects)

## Setup

1. Copy `.env-local` to `.env` and add your Ethereum address:

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

## Implementation Overview

This advanced implementation provides a structured approach to handling payments with:

1. Helper functions for creating payment requirements and verifying payments
2. Support for delayed payment settlement
3. Dynamic pricing capabilities
4. Multiple payment requirement options
5. Proper error handling and response formatting
6. Integration with the x402 facilitator service

## Usage examples:

```python
# USD price (automatically converts to USDC)
payment_req = create_exact_payment_requirements(
    price="$0.001",
    network="base-sepolia",
    resource="https://api.example.com/weather",
    description="Weather data access"
)

# Specific token amount
payment_req = create_exact_payment_requirements(
    price=TokenAmount(
        amount="1000",
        asset=TokenAsset(
            address="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            decimals=6,
            eip712=EIP712Domain(name="USDC", version="2"),
        ),
    ),
    network="base-sepolia",
    resource="https://api.example.com/weather"
)
```

### verify_payment()

Handles payment verification and returns appropriate error responses:

```python
async def verify_payment(
    request: Request,
    payment_requirements: list[PaymentRequirements],
) -> tuple[bool, JSONResponse]:
```

## Testing the Server

You can test the server using one of the example Python clients:

### Using the httpx Client
```bash
cd ../../clients/httpx
# Ensure .env is set up
uv sync
uv run python main.py
```

### Using the requests Client
```bash
cd ../../clients/requests
# Ensure .env is set up
uv sync
uv run python main.py
```

## Example Endpoints

The server includes example endpoints that demonstrate different payment scenarios:

### Delayed Settlement
- `/delayed-settlement` - Demonstrates asynchronous payment processing
- Returns the weather data immediately without waiting for payment settlement
- Processes payment asynchronously in the background using `asyncio.create_task()`
- Useful for scenarios where immediate response is critical and payment settlement can be handled later

### Dynamic Pricing
- `/dynamic-price` - Shows how to implement variable pricing based on request parameters
- Accepts a `multiplier` query parameter to adjust the base price
- Demonstrates how to calculate and validate payments with dynamic amounts
- Useful for implementing tiered pricing or demand-based pricing models

### Multiple Payment Requirements
- `/multiple-payment-requirements` - Illustrates how to accept multiple payment options
- Allows clients to pay using different assets (e.g., USDC or custom tokens)
- Supports multiple networks (e.g., Base and Base Sepolia)
- Useful for providing flexibility in payment methods and networks

## Response Format

### Payment Required (402)
```json5
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "1000",
      "resource": "http://localhost:4021/weather",
      "description": "Access to weather data",
      "mimeType": "application/json",
      "payTo": "0xYourAddress",
      "maxTimeoutSeconds": 60,
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "outputSchema": null,
      "extra": {
        "name": "USD Coin",
        "version": "2"
      }
    }
  ]
}
```

### Successful Response
```json5
// Body
{
  "report": {
    "weather": "sunny",
    "temperature": 70
  }
}
// Headers
{
  "X-PAYMENT-RESPONSE": "..." // Encoded response object
}
```

## Extending the Example

To add more paid endpoints with delayed payment settlement, you can follow this pattern:

```python
@app.get("/your-endpoint")
async def your_endpoint(request: Request) -> Dict[str, Any]:
    resource = str(request.url)
    payment_requirements = [
        create_exact_payment_requirements(
            price="$0.001",  # Your price
            network="base-sepolia",  # Your network
            resource=resource,
            description="Description of your resource"
        )
    ]

    is_valid, error_response = await verify_payment(request, payment_requirements)
    if not is_valid:
        raise HTTPException(status_code=402, detail=error_response.body)

    # Return your protected resource immediately
    response_data = {
        # Your response data
    }

    # Process payment asynchronously
    async def process_payment_async():
        try:
            x_payment = request.headers.get("X-PAYMENT")
            if not x_payment:
                logger.error("X-PAYMENT header missing in async processing")
                return
                
            decoded_payment_dict = decode_payment(x_payment)
            decoded_payment = PaymentPayload(**decoded_payment_dict)
            
            settle_response = await facilitator.settle(decoded_payment, payment_requirements[0])
            response_header = settle_response_header(settle_response)
            
            # In a real application, you would store this response header
            # and associate it with the payment for later verification
            logger.info(f"Payment settled: {response_header}")
        except Exception as e:
            logger.error(f"Payment settlement failed: {e}")
            # In a real application, you would handle the failed payment
            # by marking it for retry or notifying the user

    # Start background task
    asyncio.create_task(process_payment_async())

    return response_data
```

For endpoints that need to set response headers (like the X-PAYMENT-RESPONSE header), use the `Response` parameter:

```python
@app.get("/your-endpoint")
async def your_endpoint(request: Request, response: Response) -> Dict[str, Any]:
    # ... payment verification logic ...

    # Process payment synchronously
    settle_response = await facilitator.settle(decoded_payment, payment_requirements[0])
    response_header = settle_response_header(settle_response)

    # Set the payment response header
    response.headers["X-PAYMENT-RESPONSE"] = response_header

    # Return your data
    return {
        "your": "data"
    }
```

For dynamic pricing or multiple payment requirements, refer to the `/dynamic-price` and `/multiple-payment-requirements` endpoints in the example code for implementation details.

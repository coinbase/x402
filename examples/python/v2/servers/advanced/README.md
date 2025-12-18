# x402 V2 Advanced Server Example (Manual Integration)

This example demonstrates how to integrate x402 **manually** without using the standard middleware. This is useful for complex use cases like:

- **Dynamic Pricing**: Calculating price based on request parameters.
- **Async Settlement**: Verifying payment but settling in the background to reduce latency.
- **Multiple Payment Options**: Offering valid payment paths for different assets.

## V2 Protocol Details

Since this example implements the logic manually, it explicitly handles V2 protocol details that the middleware usually automates:

1.  **Headers**:
    - Request: Checks `PAYMENT-SIGNATURE` (Base64 encoded `PaymentPayload`).
    - Response (402): Returns `PAYMENT-REQUIRED` header (Base64 encoded `x402PaymentRequiredResponse`).
    - Response (200): Returns `PAYMENT-RESPONSE` header (Base64 encoded `SettleResponse`).
2.  **Data Models**:
    - Separates `ResourceInfo` (metadata) from `PaymentRequirements` (pricing).
    - Constructs `x402PaymentRequiredResponse` containing both.

## Setup

```bash
cp .env-local .env
# Fill in your keys/addresses
uv run python main.py
```

> [!IMPORTANT]
> **Mainnet Usage**: If you configure the network to `eip155:8453` (Base Mainnet), you **MUST** authorize the facilitator client using CDP keys.
> 
> Modify `main.py` to use `create_facilitator_config`:
> ```python
> from cdp.x402 import create_facilitator_config
> facilitator_config = create_facilitator_config(CDP_API_KEY_ID, CDP_API_KEY_SECRET)
> ```
> Ensure `cdp-sdk` is installed and keys are in `.env`.

## Endpoints

- `GET /dynamic-price?multiplier=5`: Price scales with multiplier ($0.001 * 5).
- `GET /delayed-settlement`: Returns data immediately, settles on blockchain in background task.
- `GET /multiple-options`: Accepts standard payment OR custom token payment.

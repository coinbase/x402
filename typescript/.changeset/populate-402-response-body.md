---
'@x402/core': minor
---

Populated 402 response body with structured payment information (x402Version, accepts, resource) instead of empty object, enabling agents and programmatic clients to act on payment-required responses without decoding headers. Settlement failure responses now include error context.

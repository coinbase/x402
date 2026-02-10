---
"@x402/core": patch
"@x402/express": patch
"@x402/hono": patch
"@x402/next": patch
---

fix: set PAYMENT-RESPONSE header on settlement failure responses

Per the v2 spec (transports-v2/http.md, lines 117-153), the `PAYMENT-RESPONSE` header
must be present on both successful and failed settlement responses. Previously, the three
TypeScript middleware implementations (Express, Hono, Next.js) only set this header on
success, causing clients to crash with "Payment response header not found" when settlement
failed.

Changes:
- `processSettlement` now returns `headers` on failure responses (encodes the failure
  `SettleResponse` into the `PAYMENT-RESPONSE` header)
- Express middleware sets `PAYMENT-RESPONSE` header before returning 402 on failure
- Hono middleware sets `PAYMENT-RESPONSE` header before returning 402 on failure
- Next.js `handleSettlement` includes `PAYMENT-RESPONSE` in failure response headers
- Updated tests to verify header presence on settlement failure

Fixes #1127

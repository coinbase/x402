---
"@x402/core": minor
"@x402/hono": patch
"@x402/express": patch
"@x402/fastify": patch
"@x402/next": patch
---

Add a configurable per-request timeout to `HTTPFacilitatorClient` (`FacilitatorConfig.timeoutMs`, default 30s, matching the Go and Python facilitator clients; must be a positive integer of at most 2^31 - 1 milliseconds). `verify()`, `settle()`, and each `getSupported()` attempt now reject with a typed `FacilitatorTimeoutError` — a `FacilitatorResponseError` subclass the HTTP middlewares already surface as a 502 — instead of hanging indefinitely when a facilitator accepts a connection but never completes the response. A `settle()` timeout is indeterminate: the facilitator may still have completed the settlement.

The Hono, Express, Fastify, and Next middlewares now attach a rejection handler to the eagerly created facilitator initialization promise, so an initialization failure before the first protected request no longer surfaces as an unhandled rejection; the first protected request still observes the failure and retries initialization.

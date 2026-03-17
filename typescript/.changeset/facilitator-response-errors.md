---
'@x402/core': patch
'@x402/express': patch
'@x402/hono': patch
'@x402/next': patch
---

Treat malformed facilitator success payloads as upstream facilitator errors and return 502 responses from framework middleware instead of flattening them into payment failures.

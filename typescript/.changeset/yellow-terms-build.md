---
'@x402/express': patch
'@x402/fastify': patch
'@x402/hono': patch
'@x402/next': patch
---

Strip internal settlement-overrides header after settlement reads it, so its not exposed to the client

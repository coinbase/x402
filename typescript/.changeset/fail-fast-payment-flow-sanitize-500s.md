---
"@x402/core": minor
"@x402/express": minor
"@x402/hono": minor
"@x402/fastify": minor
"@x402/next": minor
"@x402/mcp": minor
---

Validate unsupported `paymentFlow` / `assetTransferMethod` at HTTP server construction and MCP `createPaymentWrapper` when the scheme is registered, and return a generic internal error from HTTP adapters and MCP wrappers for unexpected failures instead of leaking internal error details to clients.

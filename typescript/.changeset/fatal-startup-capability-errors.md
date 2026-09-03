---
"@x402/core": patch
"@x402/express": patch
"@x402/hono": patch
"@x402/fastify": patch
"@x402/next": patch
---

Exit the process when eager facilitator sync fails with a permanent capability or route-configuration error, instead of staying up until the first paid request. Transient facilitator timeouts remain retryable.

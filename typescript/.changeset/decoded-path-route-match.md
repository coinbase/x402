---
"@x402/core": patch
"@x402/express": patch
"@x402/hono": patch
"@x402/fastify": patch
"@x402/next": patch
---

HTTP resource servers now match protected routes against both the escaped request path and the framework's decoded routing view, requiring payment if either matches. A literal route such as `GET /api/premium` could previously be reached unpaid by encoding its path separator (`/api%2Fpremium`) when the adapter only consulted the escaped path while the framework dispatched on the decoded one.

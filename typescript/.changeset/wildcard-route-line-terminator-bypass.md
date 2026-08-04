---
"@x402/core": patch
"@x402/express": patch
"@x402/hono": patch
"@x402/fastify": patch
"@x402/next": patch
---

Fixed a payment bypass on wildcard (`*`) route patterns: the compiled route regex used `.*?` without the dotAll flag, so a percent-encoded ECMAScript line terminator (e.g. `%E2%80%A8`, `%0A`, `%0D`) surviving path normalization would fail to match, causing `requiresPayment()` to return `false` and the middleware to skip payment verification and settlement entirely. The route regex now compiles with the dotAll flag so wildcard segments match any character, including line terminators.

---
"@x402/core": patch
---

Remove duplicate server-local `ResourceInfo` interface; use the wire-format `ResourceInfo` from `types/payments.ts` directly throughout the server module.

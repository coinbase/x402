---
"@x402/core": patch
---

Fixed trailing wildcard route matching when `normalizePath` strips a trailing slash, so bare prefix paths like `/api/premium` and `/api/premium/` still require payment under a `/*` route pattern.

---
"@x402/core": patch
---

Fixed a paywall bypass where a backslash in a `:param`/`[param]` segment let an unauthenticated request reach a protected handler. `normalizePath` rewrote `\` to `/` after decoding, so the middleware saw more segments than the framework router did, missed the route, and fell through to the handler with nothing settled. Percent-escapes are now decoded one segment at a time and any separator they yield is re-escaped, matching the Go and Python SDKs. Reachable on Express via a raw `\` and on Hono via `%5C`.

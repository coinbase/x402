---
"@x402/core": patch
---

Added support for Express-style `:param` dynamic route parameters in route matching. Routes like `/api/users/:id` and `/api/chapters/:seriesId/:chapterId` now match correctly alongside the existing `[param]` (Next.js) and `*` (wildcard) patterns.

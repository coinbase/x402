---
"@x402/core": patch
---

Added `routePattern` to `HTTPRequestContext` and `pattern` to `CompiledRoute` to thread the matched route pattern through to server extensions, enabling dynamic route support in discovery extensions.

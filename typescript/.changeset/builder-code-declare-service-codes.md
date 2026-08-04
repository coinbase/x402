---
"@x402/extensions": patch
---

`declareBuilderCodeExtension` accepts an optional service code(s) argument so a resource server can attribute its own dependencies (e.g. a server-side SDK) via builder-code `s`. `BuilderCodeClientExtension` and `declareBuilderCodeExtension` now both reject more than `MAX_SERVICE_CODES` codes.

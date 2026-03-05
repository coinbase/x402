---
"@x402/core": patch
---

**fix**: Improve error handling for missing scheme implementations

Replace TODO fallback with proper error throwing in `buildPaymentRequirements()` when no scheme/network server implementation is registered. This provides better developer experience by failing fast with a clear error message that includes guidance to call `register()` before building payment requirements.

**Breaking change**: Previously, calling `buildPaymentRequirements()` without a registered scheme would return an empty array and log a warning. It now throws an error instead. This is technically breaking but improves correctness and developer experience.
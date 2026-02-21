---
"@x402/core": patch
---

Add missing x402Version field to VerifyRequest and SettleRequest types to match specification and implementation behavior. This field is required by facilitators for protocol version detection.
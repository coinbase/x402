---
"@x402/extensions": patch
---

Guard against undefined `resource` in SIWX settle hook to prevent runtime crash when `PaymentPayload.resource` is absent

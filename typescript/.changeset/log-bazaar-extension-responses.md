---
'@x402/core': patch
---

Log the `EXTENSION-RESPONSES` header in resource servers. HTTP facilitator clients now read the header from verify/settle responses and merge decoded extension data into `VerifyResponse`/`SettleResponse` extensions. Resource servers log extension responses after verify/settle using an allowlist of fields (`status`, `rejectedReason`, `reason`, `code`) instead of logging full extension payloads.

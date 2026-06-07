---
'@x402/core': minor
'@x402/axios': minor
'@x402/fetch': minor
---

Add transport-agnostic `parsePaymentResult` and simplify the parsed result to `HTTPResourceResponse` (`{ status, body, header }`), where `header` is the decoded `SettleResponse` (from `PAYMENT-RESPONSE`) or `PaymentRequired` (from `PAYMENT-REQUIRED`, whose `error` carries the server's failure reason). This lets clients surface server-delivered payment errors without branching.

---
"@x402/core": patch
---

Add unit tests for `x402HTTPClient` codec methods: `encodePaymentSignatureHeader` (v1/v2/invalid), `getPaymentRequiredResponse` (header, body, error paths), and `getPaymentSettleResponse` (PAYMENT-RESPONSE, X-PAYMENT-RESPONSE, missing header). 18 new tests.

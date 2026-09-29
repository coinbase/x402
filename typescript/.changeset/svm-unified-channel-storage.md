---
"@x402/svm": minor
---

Unified SVM facilitator channel storage. Upto and batch settlement share one `PaymentChannelStorage`: opens and activity are recorded before broadcast and a failed write does not broadcast. A failed open is reverted; activity is kept. Delegated caller identity and the batch receiver-authorizer binding live on that row. `UptoChannelStorage`, `UptoDelegatedAuthStore`, `BatchReceiverAuthorizerStore`, and `BatchDelegatedAuthStore` are removed. Delegated mode requires a caller-identity callback and writes that identity on the channel row.

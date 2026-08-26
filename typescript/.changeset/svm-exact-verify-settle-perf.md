---
"@x402/svm": minor
---

Verify SVM exact payments without a fee-payer signing round trip: required signatures are checked locally, `simulateTransaction` always runs with `sigVerify` off, and `sendTransaction` skips preflight. Settle checks the duplicate cache before verification, decodes the transaction once (including address lookup tables), and smart-wallet settle fetches a single pre-balance. Confirmation polling starts at 250ms.

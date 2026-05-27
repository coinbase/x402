---
"@x402/svm": patch
"x402": patch
---

Fixed SVM exact facilitator deduplication to key on the transaction message hash rather than the full signed-transaction bytes, preventing an attacker from bypassing the cache by randomizing the mutable fee-payer signature slot.

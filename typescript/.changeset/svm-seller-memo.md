---
'@x402/svm': minor
---

Add optional `extra.memo` support to SVM exact scheme. When a seller provides `extra.memo` in PaymentRequirements, the client uses it as the Memo instruction data instead of a random nonce, and the facilitator verifies the memo content matches. Enables payment reconciliation without unique deposit addresses.

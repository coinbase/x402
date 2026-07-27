---
"@x402/svm": patch
---

Added support for resource servers to include recent blockhash hints in SVM exact payment requirements. Clients use valid hints without a blockhash RPC call and fetch their own blockhash when a hint is absent or malformed.

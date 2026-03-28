---
'github.com/coinbase/x402/go': patch
---

Replace insecure math/rand with cryptographically secure crypto/rand in SVM facilitators for fee payer selection. Eliminates predictable pseudo-random selection that could be exploited for load balancing attacks on multi-signer facilitator deployments.
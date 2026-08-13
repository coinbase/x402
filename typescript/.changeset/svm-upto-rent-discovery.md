---
'@x402/svm': minor
---

Add onchain `getProgramAccounts` discovery for SVM `upto` rent cleanup so Distributed channels
missing from offchain storage remain reclaimable, and run each managed signer's reclaim batches
concurrently instead of serially.

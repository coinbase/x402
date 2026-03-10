---
'@x402/evm': minor
'@x402/extensions': minor
---

Replaced `sendRawApprovalAndSettle` with a generic `sendTransactions` signer method that accepts an array of pre-signed serialized transactions or unsigned call intents. The signer owns execution strategy (sequential, batched, or atomic bundling). Closed fail-open verification paths, aligned Permit2 amount check to exact match, and added `signerForNetwork` to the extensions package.

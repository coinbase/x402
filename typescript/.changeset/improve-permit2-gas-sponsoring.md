---
'@x402/evm': minor
'@x402/extensions': minor
---

Consolidated ERC-20 approval + Permit2 settlement into a single `sendRawApprovalAndSettle` signer method, enabling atomic bundling for smart accounts. Closed fail-open verification paths, aligned Permit2 amount check to exact match, and added `signerForNetwork` to the extensions package.

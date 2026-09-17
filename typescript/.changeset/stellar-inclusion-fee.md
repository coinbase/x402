---
"@x402/stellar": minor
---

The Stellar exact facilitator accepts an `inclusionFeeStroops` option for the settlement transaction and the fee bump. It used to always bid the 100-stroop minimum, which mainnet often does not include for Soroban transactions, so settlements could time out after a successful verify. The default stays at 100, and verify counts the configured bid against `maxTransactionFeeStroops`.

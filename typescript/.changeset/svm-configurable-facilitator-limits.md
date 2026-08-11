---
"@x402/svm": minor
---

Add operator-configurable transaction limits to `ExactSvmSchemeOptions` for the static verification path: `maxPriorityFeeMicroLamports` (was hardcoded to `MAX_COMPUTE_UNIT_PRICE_MICROLAMPORTS`), `maxComputeUnits` (previously unbounded), and `maxRequiredSignatures` (previously unchecked). The facilitator pays the transaction fee, so these bound the fee a payer can make it pay. All three default to existing behavior.

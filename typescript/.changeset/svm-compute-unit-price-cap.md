---
"@x402/svm": patch
---

Fixed a security issue in the SVM exact facilitator where the compute unit price cap was silently bypassed. `verifyComputePriceInstruction` read `parsedInstruction.microLamports` (always `undefined`) instead of the correct `parsedInstruction.data.microLamports`, causing the comparison against the 5 µLamport/CU maximum to always evaluate to false. An attacker could include an arbitrarily large `SetComputeUnitPrice` instruction and the facilitator would sign as fee payer, paying the inflated priority fee.

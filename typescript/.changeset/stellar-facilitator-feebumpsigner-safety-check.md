---
"@x402/stellar": patch
---

Extend the Stellar facilitator's safety checks (`unsafe_tx_or_op_source`, `facilitator_is_payer`, `facilitator_in_auth`) to also cover `feeBumpSigner`, not just `signingAddresses`. `feeBumpSigner` is now checked via a separate `facilitatorSafetyAddresses` set rather than merged into `signingAddresses`, since `signerMap`-based signer selection in `settle()` does not expect it there. Fixes #3332.

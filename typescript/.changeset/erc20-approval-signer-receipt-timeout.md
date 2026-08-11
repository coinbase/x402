---
"@x402/extensions": patch
---

Add an optional `timeout` to `Erc20ApprovalGasSponsoringSigner.waitForTransactionReceipt`, keeping this mirrored interface in parity with `FacilitatorEvmSigner`. EVM settlement passes the configured `confirmationTimeoutMs` on this argument so the receipt wait can be bounded below a platform request deadline; a signer that ignores the field behaves as before.

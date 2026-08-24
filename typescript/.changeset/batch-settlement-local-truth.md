---
"@x402/evm": patch
---

Stop persisting untrusted batch-settlement `channelState` from PAYMENT-RESPONSE. Successful payment responses update local storage from previous state plus capped `chargedAmount` and any client-signed deposit, except when a present extra `chargedCumulativeAmount` does not equal that next cumulative — then the charge write is skipped. Onchain snapshot diffs and a missing extra cumulative do not block the write. Refunds cap the signed amount to the locally refundable balance. Failed settlements leave local state unchanged. A disagreeing server is handled by existing corrective recovery.

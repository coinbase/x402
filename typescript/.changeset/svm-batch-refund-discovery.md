---
"@x402/svm": patch
---

Batch-settlement client refund flow adds `NoBatchChannelToRefundError`, `clientSignedRefundRequirements`, and `locateRefundChannel` so discovery works when the 402 advertises server-signed mode but the open channel is client-signed or only visible on chain.

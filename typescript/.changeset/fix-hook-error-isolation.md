---
'@x402/core': patch
---

Fix error isolation for lifecycle hooks. Wrap afterVerify, afterSettle, onVerifyFailure, onSettleFailure, beforeVerify, and beforeSettle hooks in try/catch blocks to prevent hook errors from incorrectly triggering payment failure handlers when payments actually succeed.
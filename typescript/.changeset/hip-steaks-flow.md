---
'@x402/next': minor
---

Fixed a bug in handleSettlement which never forwarded response headers to processSettlement, so setSettlementOverrides was ignored breaking dynamic pricing for upto and batch-settlement

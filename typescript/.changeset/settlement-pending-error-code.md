---
"@x402/evm": minor
---

Add a `settlement_pending` error reason for the `exact` and `upto` EVM schemes. Previously, a receipt-wait failure after a settlement transaction broadcast (e.g. an RPC error or timeout) was indistinguishable from a terminal settlement failure, even though the transaction may still confirm on chain. The EIP-3009 and Permit2 facilitator settle paths (shared by `exact` and `upto`) now catch `waitForTransactionReceipt` failures and return `settlement_pending` with the broadcast transaction hash and network, so callers can reconcile on chain before deciding whether to retry. Settle now also validates the broadcast transaction hash before waiting on it, so a signer that reports success without a usable hash fails terminally rather than reporting `settlement_pending` without a hash to reconcile against. `upto` settle responses now report `amount` only when settlement succeeded, matching the Go and Python SDKs.

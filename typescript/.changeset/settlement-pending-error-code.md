---
"@x402/evm": minor
---

Add a `settlement_pending` error reason for the `exact` and `upto` EVM schemes. Previously, a receipt-wait failure after a settlement transaction broadcast (e.g. an RPC error or timeout) was indistinguishable from a terminal settlement failure, even though the transaction may still confirm on chain. The EIP-3009 and Permit2 facilitator settle paths (shared by `exact` and `upto`) now catch `waitForTransactionReceipt` failures and return `settlement_pending` with the broadcast transaction hash and network, so callers can reconcile on chain before deciding whether to retry. The ERC-20 approval gas sponsoring settle paths also now guard against proceeding to wait on an empty transaction hash if the extension signer returns no hashes without throwing.

---
"@x402/svm": minor
---

Route SVM `upto` facilitator RPC through `toFacilitatorSvmSigner` instead of scheme config: claim settlement simulates before `skipPreflight` send, deposit composite sim uses `replaceRecentBlockhash` without an extra blockhash fetch, and claim overlaps channel read with blockhash prefetch. `UptoSvmFacilitatorConfig.rpc` / `rpcUrl` are removed — pass a paced RPC client or `{ defaultRpcUrl }` to the signer factory (#3183).

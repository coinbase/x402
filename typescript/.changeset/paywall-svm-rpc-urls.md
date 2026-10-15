---
"@x402/paywall": minor
---

Added `rpcUrls` to `PaywallConfig`: a map of RPC endpoints keyed by CAIP-2 network. The Solana paywall uses it for the balance check and for building the payment transaction, so mainnet payments no longer depend on `api.mainnet-beta.solana.com`, which rejects browser-origin requests. Networks without an entry keep the public default.

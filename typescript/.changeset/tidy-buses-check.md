---
"@x402/evm": patch
---

Made toClientEvmSigner resolve a hoisted account's address and throw a descriptive error when the signer has no address, instead of silently building payment authorizations for address "undefined" when handed a viem WalletClient

---
"@x402/extensions": patch
---

Add token-gate extension for ERC-20/ERC-721 token-holder access control

Grants free or discounted access to x402-protected resources for on-chain token holders. The server registers a global `onProtectedRequest` hook that verifies an EIP-191 signed proof and checks on-chain balance via viem `readContract`. The client `onPaymentRequired` hook reads the `token-gate` extension from 402 responses, checks ownership, and retries with a signed proof header. Results are cached (5 min TTL) to avoid repeated RPC calls.

---
"@x402/extensions": minor
---

Add token-gate extension for ERC-20/ERC-721/SPL token-holder access control

Grants free or discounted access to x402-protected resources for on-chain token holders. Server hook verifies an EIP-191 (EVM) or ed25519 (Solana) signed proof of wallet ownership, then checks on-chain balance via `balanceOf`/`ownerOf` (EVM) or `getTokenAccountsByOwner` (Solana). Token holders get free access or a discount — non-holders fall through to normal x402 payment. Client hook reads the `token-gate` extension from 402 responses and retries with a signed proof; ownership verification is intentionally server-side only. Balance results are cached in-process for 5 minutes (configurable via `ownershipCacheTtl`) to avoid repeated RPC calls.

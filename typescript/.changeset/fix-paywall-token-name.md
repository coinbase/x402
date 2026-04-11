---
"@x402/paywall": patch
---

fix(paywall): read token name from payment requirements instead of hardcoding "USDC"

The EVM paywall now reads the token name from `extra.name` in payment requirements
and uses it for all display text. Falls back to "Token" (generic) when `extra.name`
is absent. This fixes mislabeled token names for non-USDC chains (MegaUSD, USDT0,
Mezo USD, etc.).

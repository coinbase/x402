---
"@x402/paywall": minor
"@x402/evm": minor
---

fix(paywall): use dynamic token decimals instead of hardcoding 6

The EVM paywall no longer assumes all tokens have 6 decimal places. Server-side
amount conversion in `evmPaywall.generateHtml`:

- Resolves the token's decimal precision via a new `getDefaultTokenDecimals`
  helper that looks up the network in `@x402/evm`'s `DEFAULT_STABLECOINS`
  registry — the same source the scheme `getAssetDecimals` methods read from
  and the inline scheme dispatch in `@x402/core`'s `x402ResourceServer` uses.
  Falls back to 6 (USDC default) when the network is unknown.
- Replaces the lossy `parseFloat(amount) / 10**decimals` math with
  `Number(formatUnits(BigInt(amount), decimals))`, preserving precision
  through the atomic-to-display conversion.

`@x402/evm` now publicly re-exports `DEFAULT_STABLECOINS` from
`./shared/defaultAssets` so consumers can read the canonical default-asset
registry directly.

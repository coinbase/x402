---
"@x402/paywall": patch
---

chore(paywall): regenerate EVM/SVM/AVM bundles for viem 2.47.12

The bundled paywall templates were last regenerated against a viem version
that predates chain definitions for Mezo (`eip155:31612`), Mezo Testnet
(`eip155:31611`), MegaETH (`eip155:4326`), MegaETH Testnet (`eip155:6343`),
Stable (`eip155:988`), Stable Testnet (`eip155:2201`), Radius
(`eip155:723487`), Radius Testnet (`eip155:72344`), and 33 other chains. The
lockfile moved to viem 2.47.12 in PR #2013 but the bundle was not
regenerated, so @x402/paywall hard-threw `Unsupported chain ID` at component
init for payments on those chains.

This commit regenerates all nine generated files (TypeScript, Python, and
Go templates for EVM/SVM/AVM) against the current lockfile. Total unique
chain IDs in the EVM bundle goes from 635 to 676.

No source code changes. Paired with a new PR-time drift check
(`.github/workflows/check_paywall_template.yml`) so this stays fresh
across future viem bumps.

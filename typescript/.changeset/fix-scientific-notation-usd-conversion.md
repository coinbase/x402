---
"@x402/evm": patch
"@x402/svm": patch
---

Fixed a bug where USD prices with 7+ decimal places of precision (e.g. `$0.0000001`) were parsed by `parseFloat` into scientific notation and then had token decimals appended as a raw string (e.g. `"1e-7000000"`), producing a corrupt `amount` in `PaymentRequirements`. The `convertToTokenAmount` function now operates on plain decimal strings only, and the `defaultMoneyConversion` path expands any scientific notation from JavaScript number coercion via string manipulation before conversion. Additionally, a non-zero price that rounds down to zero atomic units (i.e. the price is smaller than the token's minimum representable unit) now throws an error rather than silently charging nothing.

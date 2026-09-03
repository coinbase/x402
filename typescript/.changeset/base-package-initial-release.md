---
"@x402/base": minor
---

Introduce `@x402/base`, a Base-scoped (`eip155:8453` mainnet / `eip155:84532` Sepolia) mechanism providing `exact`, `upto`, `auth-capture`, and `batch-settlement` `BaseScheme` client/server/facilitator wrappers around `@x402/evm`. Each wrapper takes the same constructor arguments as its `@x402/evm` counterpart and delegates entirely, with all public types re-exported under a `Base`-prefixed alias so nothing `Evm`-named leaks through the public API. Value-affecting methods (`createPaymentPayload`, `verify`, `settle`, `parsePrice`, `enhancePaymentRequirements`, `buildChannelConfig`, `createChannelManager`) reject any network outside Base's scope, metadata reads (`getAssetDecimals`, `getExtra`, `getSigners`) fail closed, and `validateFacilitatorSupport` fails server startup for a mis-registered network instead of surfacing at first payment.

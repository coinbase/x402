---
"@x402/evm": minor
---

Align the EVM auth-capture **client** with the v1.1 spec: commerce-payments deployment selection via optional `extra.authCaptureEscrow` (v1.1 default), salt binding when `extra.receiverAuthorizer` or `extra.policy` is non-zero, and v1.0/v1.1 canonical addresses in `@x402/evm/auth-capture/client`. 

**Breaking (client):** the default commerce-payments deployment is now v1.1 (escrow + token collectors), so PaymentInfo hashes and signatures differ from the previous v1.0-only client unless the server sets `extra.authCaptureEscrow` to the v1.0 escrow. When `extra.receiverAuthorizer` or `extra.policy` is non-zero, collect payloads also include `saltNonce` alongside the derived `salt` (salt binding).

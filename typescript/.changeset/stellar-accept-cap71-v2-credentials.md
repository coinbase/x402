---
'@x402/stellar': minor
---

Accept CAP-71 V2 address credentials (`SOROBAN_CREDENTIALS_ADDRESS_V2`) in the facilitator's auth-entry validation and in `gatherAuthEntrySignatureStatus`. Stellar Protocol 28 (testnet 2026-08-27, mainnet vote 2026-09-16) activates the V2 arm on the network, and stellar-sdk v17 clients emit V2-signed auth entries by default (`useUpgradedAuth`/`authV2` default to `true` there); previously the facilitator rejected them (`invalid_exact_stellar_payload_unsupported_credential_type`) and signature-status gathering silently skipped them, so any V2 payment failed verification. Source-account and delegated (`addressWithDelegates`) credentials remain rejected. Also raises the `@stellar/stellar-sdk` floor to `^16.3.0`, the v16 LTS release that backports the Protocol 28 XDR (CAP-83/CAP-85 arms) without v17's breaking XDR API rewrite.

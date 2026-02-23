---
"@x402/xrp": minor
---

Add XRP (Ripple Ledger) support to x402

Introduces a new mechanism package `@x402/xrp` for XRP Ledger integration using
the Exact payment scheme with native XRP Payment transactions.

**Features:**
- Full client, server, and facilitator implementations
- Support for mainnet, testnet, and devnet networks
- Native XRP Payment transaction handling (no smart contracts required)
- Destination tag support for shared wallet addresses
- X-address compatibility
- Comprehensive test suite (91 tests covering unit and integration scenarios)

**APIs:**
- `ExactXrpScheme` for client, server, and facilitator roles
- `toClientXrpSigner()` / `toFacilitatorXrpSigner()` for wallet integration
- `FacilitatorXrpClient` for XRPL connection management
- `createXrpClient()` builder for convenient setup

**Networks:**
- `xrp:mainnet` - Production XRP Ledger
- `xrp:testnet` - Test network
- `xrp:devnet` - Development network

See the [XRP implementation spec](https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_xrp.md) for detailed protocol documentation.

# @x402/aptos

## 2.4.0

### Minor Changes

- 57a5488: Add Aptos blockchain support to x402 payment protocol

  - Introduces new `@x402/aptos` package with full client, server, and facilitator scheme implementations
  - Supports exact payment mechanism for Aptos using native APT and fungible assets
  - Includes sponsored transaction support where facilitator pays gas fees
  - Provides `registerExactAptosScheme` helpers for easy client and server integration
  - Adds Aptos network constants for mainnet and testnet
  - Updates core types to support Aptos-specific payment flows

### Patch Changes

- Updated dependencies [57a5488]
- Updated dependencies [018181b]
- Updated dependencies [3fb55d7]
  - @x402/core@2.4.0

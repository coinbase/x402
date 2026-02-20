---
"@x402/aptos": minor
"@x402/core": minor
---

Add Aptos blockchain support to x402 payment protocol

- Introduces new `@x402/aptos` package with full client, server, and facilitator scheme implementations
- Supports exact payment mechanism for Aptos using native APT and fungible assets
- Includes sponsored transaction support where facilitator pays gas fees
- Provides `registerExactAptosScheme` helpers for easy client and server integration
- Adds Aptos network constants for mainnet and testnet
- Updates core types to support Aptos-specific payment flows

## v2.3.0 - 2026-02-20
### Added
- Added payment-identifier extension — Enables idempotent payment requests.
### Changed
- Increased EVM validAfter buffer from 30 seconds to 10 minutes for consistency with TypeScript SDK
- Upgraded facilitator extension registration from string keys to FacilitatorExtension objects. Added FacilitatorContext to SchemeNetworkFacilitator functions
### Fixed
- Add validAfter and validBefore timing validation to EIP-3009 verification in the Go facilitator SDK

## 2.2.0 - 2026-02-11
### Added
- Added MCP transport integration for x402 payment protocol
- Add MegaETH mainnet (chain ID 4326) support with USDM as the default stablecoin
- Added memo instruction with random nonce to SVM transactions to ensure uniqueness and prevent duplicate transaction attacks

## 2.1.0 - 2026-01-09
### Added
- Fixed interopability bug
- Added extensions support

## 2.0.0 - 2025-10-12
### Added
- Implements x402 v2 for the Go SDK.

## 1.0.0 - 2025-09-12
### Added
- Implements x402 v1 for the Go SDK.


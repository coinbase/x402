## v2.5.0 - 2026-03-06
### Added
- Add route configuration validation during Initialize() to catch scheme/facilitator mismatches at startup
- Added assetTransferMethod and supportsEip2612 flag to defaultAssets
- Added `onProtectedRequest` hook to HTTP resource server
- Add WithBazaar facilitator client decorator for querying /discovery/resources endpoint from bazaar in go
- Added dynamic function for servers to generate custom response for settlement failures defaulting to empty
- Add in-memory SettlementCache to prevent duplicate SVM transaction settlement during on-chain confirmation window
### Changed
- Separated v1 legacy network name resolution from v2 CAIP-2 resolution; v1 code now uses evm/v1 package, shared utils only accept eip155:CHAIN_ID format
- GetSupported retries up to 3 times with exponential backoff on 429 rate limit responses
- Add pluggable PaywallProvider interface for custom paywall HTML generation with PaywallBuilder pattern

## 2.4.1 - 2026-02-25
### Fixed
- Fixed changelog generation to include version extension and eliminate trailing dots which prevent go from importing

## v2.4.0 - 2026-02-25
### Changed
- Update Permit2 witness struct (remove extra field), contract addresses, and error names for post-audit x402 proxy contracts on Base Sepolia
- Pre-compile constant regex patterns in http server for better performance
### Fixed
- preserve query params in paywall redirect

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


# x402 Python SDK Changelog

<!-- towncrier release notes start -->

## [2.2.0] - 2026-02-20

### Fixed

- Fixed SVM V1 client transaction signing to use `VersionedTransaction.populate()` with explicit signature slots, matching the V2 approach and fixing "not enough signers" errors. ([#v1-svm-signers](https://github.com/coinbase/x402/pull/v1-svm-signers))
- Added payment-identifier extension for tracking and validating payment identifiers ([#1111](https://github.com/coinbase/x402/pull/1111))

### Added

- Upgraded facilitator extension registration from string keys to FacilitatorExtension dataclass. Added FacilitatorContext passed through SchemeNetworkFacilitator.verify/settle for mechanism access to extension capabilities. ([#facilitator-extension-objects](https://github.com/coinbase/x402/pull/facilitator-extension-objects))
- Increased EVM validAfter buffer from 30 seconds to 10 minutes for consistency with TypeScript SDK. ([#validafter-buffer](https://github.com/coinbase/x402/pull/validafter-buffer))


## [2.1.0] - 2026-02-11

### Added

- Add MegaETH mainnet (chain ID 4326) support with USDM as the default stablecoin ([#megaeth-support](https://github.com/coinbase/x402/pull/megaeth-support))
- Added memo instruction with random nonce to SVM transactions to ensure uniqueness and prevent duplicate transaction attacks ([#1048](https://github.com/coinbase/x402/pull/1048))
- Added MCP transport integration for x402 payment protocol ([#1131](https://github.com/coinbase/x402/pull/1131))


## 2.0.0
- Implements x402 2.0.0 for the Python SDK.

## 1.0.0
- Implements x402 1.0.0 for the Python SDK.

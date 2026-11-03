## unreleased
### Added
- Implemented EIP-2612 gasless Permit2 approval extension for the exact EVM scheme, enabling clients to sign off-chain permits and facilitators to settle via `settleWithPermit`
- Added EIP-3009 `ReceiveWithAuthorization` support to the v2 EVM `upto` scheme, including canonical proxy settlement, strict payload validation, partial settlement, and pending transaction reconciliation

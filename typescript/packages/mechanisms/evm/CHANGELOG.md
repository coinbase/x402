# @x402/evm Changelog

## 2.4.0

### Minor Changes

- 018181b: Implement EIP-2612 gasless Permit2 approval extension

  - Implemented EIP-2612 gas sponsoring for the exact EVM scheme — clients automatically sign EIP-2612 permits when Permit2 allowance is insufficient, and facilitators route to `settleWithPermit` when the extension is present

### Patch Changes

- Updated dependencies [57a5488]
- Updated dependencies [018181b]
- Updated dependencies [3fb55d7]
  - @x402/core@2.4.0
  - @x402/extensions@2.4.0

## 2.3.1

### Patch Changes

- 0c6064d: Add MegaETH mainnet (chain ID 4326) support with USDM as the default stablecoin
- Updated dependencies [9ec9f15]
  - @x402/core@2.3.1

## 2.3.0

### Minor Changes

- 51b8445: Bumped @x402/core dependency to 2.3.0
- 51b8445: Upgraded exact evm to support permit2 payments

### Patch Changes

- adb1b55: Improved error messages for insufficient funds. The `invalidMessage` field now includes the required amount, available balance, asset denomination, and actionable guidance when payment fails due to insufficient funds.
- Updated dependencies [51b8445]
- Updated dependencies [51b8445]
  - @x402/core@2.3.0

## 2.0.0

- Implements x402 2.0.0 for the TypeScript SDK.

## 1.0.0

- Implements x402 1.0.0 for the TypeScript SDK.

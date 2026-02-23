# @x402/extensions Changelog

## 2.4.0

### Minor Changes

- 018181b: Implement EIP-2612 gasless Permit2 approval extension

  - Added `eip2612GasSponsoring` extension types, resource service declaration, and facilitator validation utilities

- 664285e: Add MCP tool discovery support to the bazaar extension system

### Patch Changes

- 3fb55d7: Upgraded facilitator extension registration from string keys to FacilitatorExtension objects. Added FacilitatorContext threaded through SchemeNetworkFacilitator.verify/settle for mechanism access to extension capabilities
- Updated dependencies [57a5488]
- Updated dependencies [018181b]
- Updated dependencies [3fb55d7]
  - @x402/core@2.4.0

## 2.3.1

### Patch Changes

- f93fc09: Added solanakit support for siwx
- Updated dependencies [9ec9f15]
  - @x402/core@2.3.1

## 2.3.0

### Minor Changes

- fe42994: Added Sign-In-With-X (SIWX) extension for wallet-based authentication. Clients can prove previous payment by signing a message, avoiding re-payment. Supports EVM and Solana signature schemes with multi-chain support, lifecycle hooks for servers and clients, and optional nonce tracking for replay protection.
- 51b8445: Added payment-identifier extension for tracking and validating payment identifiers

### Patch Changes

- Updated dependencies [51b8445]
- Updated dependencies [51b8445]
  - @x402/core@2.3.0

## 2.0.0

- Implements x402 2.0.0 for the TypeScript SDK.

## 1.0.0

- Implements x402 1.0.0 for the TypeScript SDK.

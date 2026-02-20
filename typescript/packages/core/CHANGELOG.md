# @x402/core Changelog

## 2.4.0

### Minor Changes

- 57a5488: Add Aptos blockchain support to x402 payment protocol

  - Introduces new `@x402/aptos` package with full client, server, and facilitator scheme implementations
  - Supports exact payment mechanism for Aptos using native APT and fungible assets
  - Includes sponsored transaction support where facilitator pays gas fees
  - Provides `registerExactAptosScheme` helpers for easy client and server integration
  - Adds Aptos network constants for mainnet and testnet
  - Updates core types to support Aptos-specific payment flows

- 018181b: Implement EIP-2612 gasless Permit2 approval extension

  - Added extension enrichment hooks to `x402Client`, enabling scheme clients to inject extension data (e.g. EIP-2612 permits) into payment payloads when the server advertises support

### Patch Changes

- 3fb55d7: Upgraded facilitator extension registration from string keys to FacilitatorExtension objects. Added FacilitatorContext threaded through SchemeNetworkFacilitator.verify/settle for mechanism access to extension capabilities

## 2.3.1

### Patch Changes

- 9ec9f15: Loosened zod optional any types to be nullable for Python interopability

## 2.3.0

### Minor Changes

- 51b8445: Added new hooks on clients & servers to improve extension extensibility
- 51b8445: Added new zod exports for type validation

## 2.0.0

- Implements x402 2.0.0 for the TypeScript SDK.

## 1.0.0

- Implements x402 1.0.0 for the TypeScript SDK.

---
"@x402/avm": patch
---

test(ts/avm): add unit tests for AVM utility functions

Add 38 unit tests for pure utility functions in `typescript/packages/mechanisms/avm/src/utils.ts` that previously had no dedicated test file:

- `encodeTransaction` / `decodeTransaction`: round-trip, empty array, large array, single-byte
- `getNetworkFromCaip2`: mainnet, testnet, unknown hash, non-algorand namespaces, empty string
- `isAlgorandNetwork`: prefixed/non-prefixed, wrong-case, EVM/Solana inputs
- `isTestnetNetwork`: mainnet vs testnet CAIP-2, non-algorand input
- `convertFromTokenAmount`: whole, fractional, sub-unit, zero, bigint, trailing-zero strip, large amounts
- `getGenesisHashFromTransaction`: mainnet/testnet round-trip, undefined/missing genesisHash throws
- `validateGroupId`: empty array and single-element short-circuit paths

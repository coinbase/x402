---
"@x402/aptos": patch
---

test(ts/aptos): add unit tests for Aptos utility functions

Add 22 unit tests for exported utility functions in
`typescript/packages/mechanisms/aptos/src/utils.ts` that previously had
no dedicated test file:

- `encodeAptosPayload`: round-trip through base64 JSON, empty arrays,
  deterministic output, byte-value preservation (0/128/255), large arrays,
  distinct output for different inputs
- `isEntryFunctionPayload`: returns true for objects with `entryFunction`
  key (including null/undefined values), false for script/multisig/empty
  payloads and objects without the key
- `createAptosClient`: creates client instances for mainnet and testnet,
  accepts custom RPC URL, returns new instance each call, throws for
  unsupported networks (aptos:99, eip155:1, empty string)

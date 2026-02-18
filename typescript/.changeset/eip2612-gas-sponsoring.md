---
"@x402/core": minor
"@x402/evm": minor
"@x402/extensions": minor
---

Implement EIP-2612 gasless Permit2 approval extension

- **@x402/core**: Added extension enrichment hooks to `x402Client`, enabling scheme clients to inject extension data (e.g. EIP-2612 permits) into payment payloads when the server advertises support
- **@x402/evm**: Implemented EIP-2612 gas sponsoring for the exact EVM scheme — clients automatically sign EIP-2612 permits when Permit2 allowance is insufficient, and facilitators route to `settleWithPermit` when the extension is present
- **@x402/extensions**: Added `eip2612GasSponsoring` extension types, resource service declaration, and facilitator validation utilities

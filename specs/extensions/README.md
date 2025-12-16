# Extensions

This directory contains **optional x402 protocol extensions**.

Extensions add functionality on top of existing x402 flows without changing
payment execution or settlement semantics.

## Scope

Documents in this folder specify optional capabilities such as:
- Service receipts
- Attestations
- Correlation or tracing metadata
- Post-payment artifacts

Extensions:
- Are optional and composable
- May apply to any settlement or scheme
- Must not alter fund movement or settlement correctness

## Relationship to Other Specs

- **Settlements** define payment execution and verification.
- **Extensions** may reference settlements but must not redefine them.
- **Schemes** and **transports** remain unaffected by extensions unless explicitly stated.

## Stability

Extensions are designed to evolve independently and should be ignored safely by
implementations that do not support them.


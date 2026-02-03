# Scheme: `upto`

## Summary

`upto` is a scheme that authorizes a transfer of up to a **maximum amount** of funds from a client to a resource server. The actual amount charged is determined at settlement time based on resource consumption during the request.

This scheme is ideal for usage-based pricing models where the final cost is not known until after the resource has been consumed.

## Example Use Cases

- Paying for LLM token generation (charge per token generated)
- Bandwidth or data transfer metering (charge per byte)
- Time-based API access (charge per minute/second of usage)
- Dynamic compute pricing (charge based on actual resources consumed)
- Streaming media consumption (charge based on content delivered)

## Appendix

## Critical Validation Requirements

While implementation details vary by network, facilitators MUST enforce security constraints:

### EVM

- Permit2 Only: The `upto` scheme uses Permit2 exclusively
- Maximum enforcement: `settledAmount` MUST be `<= amount`
- Destination correctness: the receiver MUST match the `witness.to` address
- Balance verification: client MUST have balance >= `amount` at verification time

### Settlement Amount Rules

- The settled amount MAY be 0 (no charge for zero usage)
- The settled amount is determined by the resource server
- Clients must trust servers to charge fair amounts based on actual usage

Network-specific rules and implementation details are defined in the per-network scheme documents. For EVM chains, see `scheme_upto_evm.md`.

# Scheme: `7710`

## Summary

`7710` is a scheme that extends x402 to support ERC-7710 smart contract delegations. Unlike the `exact` scheme which uses EIP-3009's `transferWithAuthorization`, this scheme leverages delegated capabilities through a Delegation Manager contract, which is any contract that exposes the `redeemDelegations` method and is able to initiate internal messages on behalf of the user's account. This enables payments from smart contract accounts (including ERC-4337 accounts, other smart accounts, multi-sig wallets, and even EOAs via EIP-7702) that may not support EIP-3009 but do support ERC-7710 delegations.

## Example Use Cases

- AI agents with bounded payment authority
- Smart wallet users paying for API access
- Multi-sig wallets authorizing recurring payments
- Long-lived payment sessions with constrained permissions

## Appendix

## Critical Validation Requirements

Facilitators MUST validate delegations by simulating the `redeemDelegations` call to ensure it would successfully transfer the required funds to the specified recipient. The simulation MUST verify:

- The `payTo` address receives at least `amount` of the specified `asset`
- The funds originate from the `authorization.from` address (the delegator)

### EVM

Network-specific rules and implementation details are defined in the per-network scheme documents. For EVM, see `scheme_7710_evm.md`.

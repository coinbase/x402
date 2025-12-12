# Scheme: `7710`

## Summary

`7710` is a scheme that extends x402 to support ERC-7710 smart contract delegations. Unlike the `exact` scheme which uses EIP-3009's `transferWithAuthorization`, this scheme leverages delegated capabilities through a Delegation Manager contract. This enables payments from smart contract accounts (including ERC-4337 accounts, smart wallets, and multi-sig wallets) that may not support EIP-3009 but do support ERC-7710 delegations.

## Example Use Cases

- AI agents with bounded payment authority
- Smart wallet users paying for API access
- Multi-sig wallets authorizing recurring payments
- Long-lived payment sessions with constrained permissions

## Key Differences from `exact`

| Aspect | `exact` (EIP-3009) | `7710` (ERC-7710) |
|--------|-------------------|-------------------|
| Payer Type | EOA or EIP-3009 compatible | Any ERC-7710 compatible account |
| Authorization | `transferWithAuthorization` signature | Delegation + permission context |
| Execution | Direct token transfer | Delegation Manager executes via delegator |
| Smart Account Support | Limited | Native |
| Flexibility | Single transfer only | Extensible via caveats/policies |

## Appendix

### Critical Validation Requirements

Facilitators MUST validate delegations by simulating the `redeemDelegations` call to ensure it would successfully transfer the required funds to the specified recipient.

### Network Support

- **EVM**: See `scheme_7710_evm.md` for EVM-specific implementation details

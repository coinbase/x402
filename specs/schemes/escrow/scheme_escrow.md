# Scheme: `escrow`

## Summary

The `escrow` scheme enables pre-funded, usage-based payments. Clients deposit funds into an escrow contract which locks them until settlement conditions are met.

This complements the `exact` scheme for scenarios where payment amounts are determined after resource consumption rather than before.

## Use Cases

- Metered API access (pay per request)
- LLM inference (pay per token)
- Compute services (pay per second)
- Multi-call agent workflows

## Lifecycle

```
DEPOSIT → LOCK → USE → SETTLE → DISTRIBUTE
```

1. **Deposit**: Client deposits funds into escrow, receives session ID
2. **Lock**: Escrow locks funds for the session
3. **Use**: Provider serves requests, tracks usage
4. **Settle**: Session closes, funds distributed based on usage
5. **Refund**: Unused portion returned to client

## PaymentRequirements

Escrow-accepting servers advertise with scheme `escrow`:

```json
{
  "scheme": "escrow",
  "network": "eip155:84532",
  "escrow": "0x...",
  "minDeposit": "1000000",
  "maxDeposit": "100000000",
  "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "extra": {
    "pricePerUnit": "10000",
    "unitDescription": "API request"
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `scheme` | Yes | Must be "escrow" |
| `network` | Yes | CAIP-2 network identifier |
| `escrow` | Yes | Escrow contract address |
| `minDeposit` | Yes | Minimum deposit accepted |
| `maxDeposit` | No | Maximum deposit accepted |
| `asset` | Yes | Token contract address |

## Security Considerations

### Fund Safety

- Funds held in audited escrow contract
- Neither party can unilaterally withdraw locked funds
- Time-locked auto-settlement prevents indefinite lockup

### Usage Integrity

- On-chain usage: Provider records directly to contract
- Off-chain usage: Provider signs attestations, disputable
- Disputes: Arbiter-mediated resolution

### Replay Prevention

- Session IDs include timestamp, nonce, and participant addresses
- Settlements verify session has not been previously processed

## Appendix

### Relationship to `exact`

| Aspect | `exact` | `escrow` |
|--------|---------|----------|
| Payment timing | Immediate per-request | Deferred batch settlement |
| Amount known | Before request | After usage |
| On-chain transactions | Per request | Per session |
| Use case | Fixed-price resources | Variable-price services |

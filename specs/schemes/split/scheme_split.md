# Scheme: `split`

## Summary

`split` is a scheme that transfers a specific total amount of funds from a client to multiple recipients in configurable proportions. The resource server specifies the total price and an array of recipients with basis point allocations (1 bps = 0.01%, 10000 bps = 100%).

The facilitator receives a single payment authorization from the client and distributes funds to N recipients. Distribution may happen on-chain (individual transfers or via a splitter contract) or off-chain (internal ledger credits) depending on the facilitator's capabilities.

`split` is a superset of `exact` — a single recipient at 10000 bps is equivalent to an `exact` payment.

## Example Use Cases

- Music streaming royalty splits (artist, producer, label, platform)
- Marketplace payments with platform fees
- Multi-party service payments (e.g., driver + platform in ride-sharing)
- DAO treasury distributions
- Affiliate commission payments
- Content creator revenue sharing

## PaymentRequirements Extensions

The `split` scheme adds a `recipients` field to `PaymentRequirements.extra`:

```json
{
  "scheme": "split",
  "network": "eip155:84532",
  "amount": "100000",
  "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "payTo": "0xFacilitatorEscrow...",
  "maxTimeoutSeconds": 120,
  "extra": {
    "recipients": [
      { "address": "0xArtist...", "bps": 7000, "label": "artist" },
      { "address": "0xProducer...", "bps": 2000, "label": "producer" },
      { "address": "0xPlatform...", "bps": 1000, "label": "platform" }
    ]
  }
}
```

### Recipient Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | string | Yes | Recipient wallet address (network-specific format) |
| `bps` | integer | Yes | Basis points allocation (1-10000) |
| `label` | string | No | Human-readable label for the recipient |

### Validation Rules

- `recipients` array MUST contain at least 1 entry
- Sum of all `bps` values MUST equal exactly 10000
- Each `bps` value MUST be between 1 and 10000 (inclusive)
- `payTo` MUST be the facilitator's escrow/clearing address
- `amount` is the TOTAL payment amount (not per-recipient)

## Appendix

### Rounding

When splitting amounts, integer division may produce remainders. The facilitator MUST:
1. Calculate each recipient's share as `floor(totalAmount * bps / 10000)`
2. Allocate the remainder (dust) to the last recipient in the array
3. Ensure the sum of all distributed amounts equals the total amount exactly

### Settlement Methods

Facilitators MAY use any combination of:
- **On-chain transfers**: Individual `transfer` calls per recipient
- **Batch contracts**: A single multicall or splitter contract
- **Internal ledger**: Off-chain credits for recipients who have accounts with the facilitator

The settlement method SHOULD be indicated in the `SettleResponse.extra` field.

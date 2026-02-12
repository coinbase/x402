# Scheme: `split` `stellar`

## Summary

Stellar implementation of the `split` payment scheme. Uses Soroban `transfer(from, to, amount)` on SEP-41 token contracts with the facilitator's escrow address as the recipient. The facilitator then distributes funds to N recipients via internal ledger credits, individual transfers, or batch invocations.

The client constructs the same Soroban payload as `exact` — the split is transparent to the client.

## `X-Payment` Header Payload

```json
{
  "x402_version": 2,
  "scheme": "split",
  "network": "stellar:testnet",
  "payload": {
    "transaction": "AAAAAgAAAABriIN4poutFUmHfB6FbFJu8GgXoPPTGQWREqFpPfvO1AAAAAAAAAAAAAAAAAAAAA..."
  }
}
```

Key difference from `exact`: the `to` field is the facilitator's escrow address, not a final recipient. The facilitator handles distribution.

## Verification

1. Parse `X-Payment` header and decode Stellar payload
2. Validate scheme is `"split"` and network matches `stellar:*`
3. Verify transaction structure (single `invokeHostFunction` calling `transfer`)
4. Verify auth entry signatures and expiration
5. Verify `to` matches `payTo` (facilitator escrow)
6. Verify `value` >= `amount` (total payment)
7. Apply facilitator safety checks (facilitator not in from/source/auth entries)
8. Validate `recipients` in requirements:
   - At least 1 recipient
   - All `bps` sum to exactly 10000
   - All addresses are valid Stellar addresses

## Settlement

1. Execute Soroban `transfer` to move funds to facilitator escrow (same as `exact` on Stellar)
2. For each recipient in the split rule:
   a. Calculate share: `floor(totalAmount * bps / 10000)`
   b. Distribute via one of:
      - **Internal credit**: Add to recipient's facilitator-side balance
      - **On-chain transfer**: Execute `transfer(escrow, recipient, share)` on the token contract
      - **Batch**: Use multiple invocations for gas efficiency
3. Return `SettleResponse` with per-recipient breakdown:

```json
{
  "success": true,
  "transaction": "a1b2c3d4e5f6...",
  "network": "stellar:testnet",
  "payer": "GBHEGW3...",
  "extra": {
    "splits": [
      { "address": "GART1ST...", "amount": "7000000", "method": "internal" },
      { "address": "GPRODUC...", "amount": "2000000", "method": "internal" },
      { "address": "GPLATFM...", "amount": "1000000", "method": "internal" }
    ]
  }
}
```

## Appendix

### Compatibility with `exact`

A `split` payment with a single recipient at 10000 bps is functionally identical to an `exact` payment. Facilitators SHOULD optimize this case by skipping the escrow step.

### Gas Considerations

| Method | Cost (Stroops) | Latency |
|--------|---------------|---------|
| Internal credit | 0 | <1ms |
| Individual transfers | ~100k per recipient | ~5s per tx |
| Batch invocations | ~70k per recipient | ~5s total |

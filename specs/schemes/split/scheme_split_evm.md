# Scheme: `split` `evm`

## Summary

EVM implementation of the `split` payment scheme. Uses EIP-3009 `transferWithAuthorization` for the single on-chain transfer, with the facilitator's escrow address as the recipient. The facilitator then distributes funds to N recipients via internal ledger credits, individual transfers, or batch multicall.

## `X-Payment` Header Payload

The client constructs the same EIP-3009 payload as `exact` — the split is transparent to the client:

```json
{
  "x402_version": 2,
  "scheme": "split",
  "network": "eip155:84532",
  "payload": {
    "authorization": {
      "from": "0xPayer...",
      "to": "0xFacilitatorEscrow...",
      "value": "100000",
      "validAfter": "0",
      "validBefore": "1739300000",
      "nonce": "0x..."
    },
    "signature": "0x..."
  }
}
```

Key difference from `exact`: the `to` field is the facilitator's escrow address, not a final recipient. The facilitator handles distribution.

## Verification

1. Parse `X-Payment` header and decode split payload
2. Validate scheme is `"split"` and network matches `eip155:*`
3. Verify EIP-712 signature (same as `exact`)
4. Verify `to` matches `payTo` (facilitator escrow)
5. Verify `value` >= `amount` (total payment)
6. Validate `recipients` in requirements:
   - At least 1 recipient
   - All `bps` sum to exactly 10000
   - All addresses are valid EVM addresses

## Settlement

1. Execute `transferWithAuthorization` to move funds to facilitator escrow (same as `exact`)
2. For each recipient in the split rule:
   a. Calculate share: `floor(totalAmount * bps / 10000)`
   b. Distribute via one of:
      - **Internal credit**: Add to recipient's facilitator-side balance
      - **On-chain transfer**: Execute `transfer(recipient, share)` on the token contract
      - **Batch**: Use multicall contract for gas efficiency
3. Return `SettleResponse` with per-recipient breakdown:

```json
{
  "success": true,
  "transaction": "0x...",
  "network": "eip155:84532",
  "payer": "0xPayer...",
  "extra": {
    "splits": [
      { "address": "0xArtist...", "amount": "70000", "method": "internal" },
      { "address": "0xProducer...", "amount": "20000", "method": "internal" },
      { "address": "0xPlatform...", "amount": "10000", "method": "internal" }
    ]
  }
}
```

## Appendix

### Compatibility with `exact`

A `split` payment with a single recipient at 10000 bps is functionally identical to an `exact` payment. Facilitators SHOULD optimize this case by skipping the escrow step and transferring directly to the recipient.

### Gas Considerations

| Method | Gas Cost | Latency |
|--------|----------|---------|
| Internal credit | 0 | <1ms |
| Individual transfers | ~50k per recipient | ~3s per tx |
| Batch multicall | ~30k per recipient | ~3s total |

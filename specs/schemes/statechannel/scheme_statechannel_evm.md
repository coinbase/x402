# Scheme: `statechannel` on `EVM`

## Summary

This document defines EVM payload, verification, and settlement rules for:

- `statechannel-hub-v1`
- `statechannel-direct-v1`

Both profiles use off-chain signed channel state transitions as payment proof.

## `PAYMENT-SIGNATURE` Header Payload

### `statechannel-hub-v1`

The client sends a hub-issued ticket plus a channel proof:

```json
{
  "x402Version": 2,
  "accepted": {
    "scheme": "statechannel-hub-v1",
    "network": "eip155:8453",
    "amount": "1000000",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "payTo": "pay.eth",
    "maxTimeoutSeconds": 60
  },
  "payload": {
    "paymentId": "pay_01JY0R8J6M2W2M5F5J35B5XW2A",
    "invoiceId": "inv_01JY0R8H8GY6Q9B5CZ7GRDCCJ8",
    "ticket": {
      "ticketId": "tkt_01JY0R8P2Q9MM1E3FC0S53X8GX",
      "payer": "0x1111111111111111111111111111111111111111",
      "payee": "0x2222222222222222222222222222222222222222",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "amount": "1000000",
      "feeCharged": "0",
      "stateHash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "expiry": 1771000000,
      "hubSig": "0x..."
    },
    "channelProof": {
      "channelId": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "stateNonce": "101",
      "stateHash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "sigA": "0x..."
    }
  }
}
```

### `statechannel-direct-v1`

The client sends the signed channel update directly:

```json
{
  "x402Version": 2,
  "accepted": {
    "scheme": "statechannel-direct-v1",
    "network": "eip155:8453",
    "amount": "1000000",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "payTo": "0x2222222222222222222222222222222222222222",
    "maxTimeoutSeconds": 60
  },
  "payload": {
    "paymentId": "pay_01JY0R8J6M2W2M5F5J35B5XW2A",
    "channelState": {
      "channelId": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "stateNonce": "101",
      "balA": "9000000",
      "balB": "1000000",
      "stateExpiry": 1771000000,
      "contextHash": "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    },
    "sigA": "0x..."
  }
}
```

## Verification

Facilitators (hub profile) and payees (direct profile) MUST validate:

1. `accepted.scheme` is one of the two statechannel profile identifiers.
2. `accepted.network` is supported and matches channel domain configuration.
3. `accepted.asset` matches the channel asset lane.
4. Signature recovery from the signed state matches the expected payer address.
5. `stateNonce` is strictly greater than the previously accepted nonce for the same channel.
6. State/ticket expiry has not elapsed.
7. Debited value in this transition is greater than or equal to `accepted.amount`.

Additional hub checks:

1. `ticket.hubSig` is valid for a known hub signer.
2. `ticket.stateHash` equals `channelProof.stateHash`.
3. Ticket identifiers are idempotent and not replayed.

## Settlement

### Hub profile

Per-request settlement is off-chain:

1. Hub validates and records latest signed state.
2. Hub returns a signed ticket consumed by the payee.
3. On-chain settlement occurs later via channel close or rebalance.

### Direct profile

Per-request settlement is also off-chain:

1. Payee validates and stores the highest nonce state.
2. On dispute or close, the payee can submit the highest signed state to the channel contract.

## Appendix

- Reference architecture and examples:
  `https://github.com/Keychain-Inc/x402s/blob/main/docs/X402S_SPEC_V2.md`

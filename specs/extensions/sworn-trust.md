# Extension: `sworn-trust`

## Summary

The `sworn-trust` extension integrates the SWORN Trust Protocol with x402, enabling trust-gated pricing and agent verification for HTTP 402 payment flows. Servers can require a minimum trust score before accepting payment, offer tiered pricing based on agent reputation, and invoke on-chain dispute resolution for contested transactions.

This is a **Server ↔ Client** extension. The Facilitator is not directly involved in trust verification — it relies on on-chain state read from the SWORN program on Solana.

## PaymentRequired

A Server advertises SWORN trust support by including the `sworn-trust` key in the `extensions` object of the `402 Payment Required` response.

```json
{
  "x402Version": "2",
  "accepts": [
    {
      "scheme": "exact",
      "network": "solana:mainnet",
      "amount": "10000",
      "asset": "USDC",
      "payTo": "0x...",
      "maxTimeoutSeconds": 60,
      "extra": {
        "name": "USDC",
        "version": "2"
      }
    }
  ],
  "extensions": {
    "sworn-trust": {
      "info": {
        "programId": "SWRNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        "minTrustScore": 50,
        "pricingTiers": [
          { "minScore": 0,  "maxScore": 49, "rejected": true },
          { "minScore": 50, "maxScore": 74, "amount": "10000" },
          { "minScore": 75, "maxScore": 89, "amount": "7500" },
          { "minScore": 90, "maxScore": 100, "amount": "5000" }
        ],
        "disputeWindow": 86400,
        "requireVerifiedAgent": false
      }
    }
  }
}
```

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `programId` | `string` | Yes | The SWORN program address on Solana |
| `minTrustScore` | `number` | No | Minimum trust score (0-100) required to transact. Default: 0 (no minimum) |
| `pricingTiers` | `array` | No | Trust-based pricing tiers. Each tier defines a score range and the corresponding payment amount. If omitted, a flat rate from `accepts.amount` is used |
| `disputeWindow` | `number` | No | Seconds after settlement during which a dispute can be raised. Default: 86400 (24h) |
| `requireVerifiedAgent` | `boolean` | No | If `true`, only agents with a verified on-chain identity PDA can transact. Default: `false` |

## PaymentPayload

When a Client sends payment, it includes SWORN trust data in the `extensions` field of the `PaymentPayload`.

```json
{
  "x402Version": "2",
  "scheme": "exact",
  "network": "solana:mainnet",
  "payload": {
    "signature": "...",
    "authorization": "..."
  },
  "extensions": {
    "sworn-trust": {
      "agentPda": "AGNTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "trustScore": 82,
      "verified": true,
      "trustProof": {
        "slot": 285000000,
        "signature": "SWORN_PROOF_xxxxxxxxxx"
      }
    }
  }
}
```

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `agentPda` | `string` | Yes | The agent's Program Derived Address on the SWORN program |
| `trustScore` | `number` | Yes | The agent's current trust score (0-100) |
| `verified` | `boolean` | Yes | Whether the agent has a verified on-chain identity |
| `trustProof.slot` | `number` | Yes | The Solana slot at which the trust score was read |
| `trustProof.signature` | `string` | Yes | Cryptographic proof of the trust score at the given slot |

## Server Verification Flow

1. Server receives `PaymentPayload` with `sworn-trust` extension
2. Server reads the agent's trust score from the SWORN program at the specified slot
3. Server verifies the `trustProof.signature` matches the on-chain state
4. Server checks `trustScore >= minTrustScore` (if configured)
5. Server determines the applicable pricing tier and validates the payment amount
6. If `requireVerifiedAgent` is `true`, server checks `verified == true`
7. If all checks pass, server forwards payment to the Facilitator for settlement

## Dispute Resolution

After settlement, either party may invoke on-chain dispute resolution within the `disputeWindow`:

1. **Initiate dispute**: Client or Server calls `initiate_dispute` on the SWORN program, referencing the x402 transaction ID
2. **Evidence submission**: Both parties submit evidence (hashes) within a configurable evidence window
3. **Arbitration**: The SWORN arbitration mechanism (staked arbiters or DAO vote) resolves the dispute
4. **Resolution**: If the dispute is upheld, the SWORN program triggers a refund instruction. The Facilitator listens for `DisputeResolved` events to process refunds

### Dispute Payload

```json
{
  "transactionId": "x402_tx_...",
  "disputeType": "service_not_delivered",
  "evidenceHash": "sha256:...",
  "requestedResolution": "full_refund"
}
```

## Security Considerations

- Trust scores are read from on-chain state and verified against slot-specific proofs to prevent replay attacks
- The `disputeWindow` creates a settlement delay during which funds may be clawed back — Facilitators should account for this in their settlement flow
- Servers should cache trust scores with a reasonable TTL (recommended: 60 seconds) to avoid excessive RPC calls
- The `trustProof.signature` must be validated against the SWORN program's signing authority to prevent spoofing

## Reference Implementation

- SWORN Trust Protocol: [https://sworn.chitacloud.dev](https://sworn.chitacloud.dev)
- SWORN Explorer: [https://sworn-explorer.chitacloud.dev](https://sworn-explorer.chitacloud.dev)
- Anchor Program: Solana Devnet (program ID published at `sworn.chitacloud.dev/.well-known/agent-registration.json`)

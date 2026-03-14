# Scheme: `pause-commit`

## Summary

`pause-commit` is a security-enhanced payment scheme that enables **cancellable payments** with **risk assessment** for high-value x402 transactions. Unlike traditional schemes where funds are transferred immediately upon payment authorization, `pause-commit` uses **off-chain signatures** and **atomic settlement** to provide payer protection and address screening.

The scheme operates in two phases:
1. **PAUSE Phase**: Client signs an off-chain EIP-712 payment intent (zero gas cost), funds remain in client wallet
2. **COMMIT Phase**: Server claims the payment on-chain via atomic settlement, or client revokes if service is not delivered

## Key Features

- **Risk Assessment**: Every payment is automatically risk-scored using 11 Bayesian signals before signature creation
- **Cancellable Payments**: Clients can revoke unclaimed payment intents with zero loss
- **Zero Client Gas**: Payment authorization uses off-chain EIP-712 signatures
- **Atomic Settlement**: Server claims payment atomically on-chain with built-in protections
- **Address Screening**: Automatic screening of `payTo` addresses prevents payments to high-risk destinations

## Example Use Cases

- High-value AI model inference ($10+ per request)
- Enterprise data access with compliance requirements
- Financial intelligence APIs requiring payer protection
- Any x402 service where cancellation capability is valuable
- Services requiring address risk assessment for regulatory compliance

## Risk Assessment

Before any payment signature is created, the scheme automatically performs address risk assessment using 11 independent Bayesian signals:

| Signal | Weight | Detection |
|--------|---------|-----------|
| Mixer Exposure | 0.45 | Tornado Cash interaction |
| Draining Pattern | 0.30 | Wallet drainer behavior |
| Exchange Cluster | 0.25 | Exchange wallet proximity |
| Sweep Pattern | 0.25 | Funds consolidation |
| TX Burst Anomaly | 0.20 | Bot-like transaction spikes |
| Scam Graph | 0.20 | Community-reported scam connections |
| Dusting Attack | 0.15 | Micro-transaction tracking |
| ENS Authenticity | 0.15 | Domain ownership verification |
| Rival Consensus | 0.15 | External scoring cross-reference |
| Wallet Age | 0.10 | Account age and activity |
| Balance Volatility | 0.10 | Abnormal balance patterns |

Addresses scoring below 40/100 are automatically blocked before signature creation.

## Payment Flow

### 1. Initial Request
Client makes request to x402-protected resource.

### 2. Payment Required Response
Server responds with 402 status and payment requirements:

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
PAYMENT-REQUIRED: x402 {"url":"https://api.example.com/premium","version":2,"accept":["pause-commit"],"amount":"50000000","asset":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","payTo":"0x742d35Cc6634C0532925a3b8D951D75aC1FDF3fC","network":"eip155:8453","timeout":"2026-01-01T00:00:00Z"}
```

### 3. Risk Assessment
Client extracts `payTo` address and performs risk assessment via PAUSE Risk Engine. High-risk addresses (score < 40) are blocked.

### 4. Payment Intent Signing
Client signs EIP-712 PaymentIntent off-chain (zero gas):

```json
{
  "types": {
    "EIP712Domain": [
      {"name": "name", "type": "string"},
      {"name": "version", "type": "string"},
      {"name": "chainId", "type": "uint256"},
      {"name": "verifyingContract", "type": "address"}
    ],
    "PaymentIntent": [
      {"name": "from", "type": "address"},
      {"name": "to", "type": "address"},
      {"name": "amount", "type": "uint256"},
      {"name": "asset", "type": "address"},
      {"name": "nonce", "type": "bytes32"},
      {"name": "deadline", "type": "uint256"}
    ]
  },
  "primaryType": "PaymentIntent",
  "domain": {
    "name": "PAUSECommit",
    "version": "2",
    "chainId": 8453,
    "verifyingContract": "0x604152D82Fd031cCD8D27F26C5792AC2CD328bF4"
  },
  "message": {
    "from": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
    "to": "0x742d35Cc6634C0532925a3b8D951D75aC1FDF3fC",
    "amount": "50000000",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "nonce": "0x1234567890abcdef",
    "deadline": "1735689600"
  }
}
```

### 5. Payment Signature Header
Client retries request with signed payment intent:

```http
PAYMENT-SIGNATURE: x402 {"signature":"0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a1283259764173608a2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c","intent":{"from":"0x857b06519E91e3A54538791bDbb0E22373e36b66","to":"0x742d35Cc6634C0532925a3b8D951D75aC1FDF3fC","amount":"50000000","asset":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","nonce":"0x1234567890abcdef","deadline":"1735689600"}}
```

### 6. Settlement
Server validates signature and calls `PAUSECommit.commit()` for atomic settlement (~85k gas).

### 7. Service Delivery
Server delivers the requested resource to client.

## Cancellation

If the server fails to deliver service within the deadline, the client can revoke the payment intent:

```solidity
PAUSECommit.revoke(
    paymentIntent,
    signature
);
```

This prevents the server from claiming the payment later and ensures zero loss for the client.

## Security Properties

1. **Pre-payment Risk Assessment**: All `payTo` addresses are risk-scored before any signature creation
2. **Non-custodial**: Clients maintain control of funds until atomic settlement
3. **Atomic Settlement**: Payment and service delivery are atomically linked
4. **Deadline Protection**: Payment intents expire automatically
5. **Revocation Capability**: Clients can cancel unclaimed payments
6. **Gas Efficiency**: Clients pay zero gas for payment authorization
7. **Signature Replay Protection**: Cryptographic nonces prevent double-spending

## Comparison with Other Schemes

| Property | exact | upto | pause-commit |
|----------|-------|------|--------------|
| Payment timing | Before delivery | Before delivery | After delivery |
| Cancellable | No | No | **Yes** |
| Risk scoring | None | None | **11 Bayesian signals** |
| Payer gas cost | ~21k | ~21k | **Zero** (off-chain signing) |
| Claimer gas cost | N/A | N/A | ~85k |
| Address screening | None | None | **Automatic** |
| Best for | Micropayments | Metered usage | **High-value + safety** |

## Requirements

- **Asset**: Must be ERC-20 compatible with sufficient client balance and allowance
- **Network**: EVM-compatible blockchain with PAUSECommit contract deployed
- **Facilitator**: Must support `pause-commit` scheme and have sufficient gas for settlement
- **Client**: Must implement EIP-712 signing and risk assessment integration

## Extensions

The scheme supports optional extensions:

- **Custom Risk Thresholds**: Clients can configure minimum risk scores per service
- **Multi-signature**: Support for multi-sig wallets via EIP-1271
- **Batch Operations**: Multiple payment intents in single transaction
- **Cross-chain**: Future support for cross-chain payment intents

## Implementation Notes

- Reference implementation available via `@pausesecure/x402-commit` npm package
- Smart contract deployed on Ethereum mainnet at `0x604152D82Fd031cCD8D27F26C5792AC2CD328bF4`
- Facilitator service available at `https://facilitator.pausesecure.com`
- Risk engine accessible via x402-protected API at `https://api.pausescan.com`

## Network-Specific Implementations

- [`scheme_pause_commit_evm.md`](./scheme_pause_commit_evm.md) - Complete EVM implementation details
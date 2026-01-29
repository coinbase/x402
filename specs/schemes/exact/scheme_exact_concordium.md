# Scheme: `exact` on `Concordium`

## Summary

The `exact` scheme on Concordium chains uses a **client-broadcast model** where the client directly broadcasts a CCD transfer or CIS-2 token transfer to the Concordium blockchain. The facilitator verifies the transaction on-chain and waits for ConcordiumBFT finalization before granting access. This approach differs from EVM's `EIP-3009` model because Concordium does not have an equivalent authorization-based transfer mechanism.

## PaymentPayload `payload` Field

The `payload` field of the `PaymentPayload` must contain the following fields:

- `txHash`: The transaction hash of the broadcasted transfer on Concordium.
- `sender`: The account address that sent the payment.
- `blockHash` (optional): The block hash containing the transaction.

Example `payload`:

```json
{
  "txHash": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
  "sender": "3kBx2h5Y2veb4hZvAE2c1Zr6DYJwWbPr9xQJJBPWyFnXHF9UuN",
  "blockHash": "b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567890"
}
```

Full `PaymentPayload` object for native CCD:

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://api.example.com/premium-data",
    "description": "Access to premium market data",
    "mimeType": "application/json"
  },
  "accepted": {
    "scheme": "exact",
    "network": "ccd:4221332d34e1694168c2a0c0b3fd0f27",
    "amount": "1000000",
    "asset": "",
    "payTo": "4FmiTW2L4RvCsSVTjFAavYvrgnPLGNj43eiwPYmbhNqtAcMbWW",
    "maxTimeoutSeconds": 60,
    "extra": {}
  },
  "payload": {
    "txHash": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
    "sender": "3kBx2h5Y2veb4hZvAE2c1Zr6DYJwWbPr9xQJJBPWyFnXHF9UuN"
  }
}
```

Full `PaymentPayload` object for PLT token (EURR):

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://api.example.com/premium-data",
    "description": "Access to premium market data",
    "mimeType": "application/json"
  },
  "accepted": {
    "scheme": "exact",
    "network": "ccd:9dd9ca4d19e9393877d2c44b70f89acb",
    "amount": "5000000",
    "asset": "EURR",
    "payTo": "4FmiTW2L4RvCsSVTjFAavYvrgnPLGNj43eiwPYmbhNqtAcMbWW",
    "maxTimeoutSeconds": 60,
  },
  "payload": {
    "txHash": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
    "sender": "3kBx2h5Y2veb4hZvAE2c1Zr6DYJwWbPr9xQJJBPWyFnXHF9UuN",
    "blockHash": "b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567890"
  }
}
```

## Asset Format

| Asset Type | Format       | Example  |
|------------|--------------|----------|
| Native CCD | Empty string | `""`     |
| PLT Token  | `tokenName`  | `"EURR"` |

## Network Identifiers

Concordium uses CAIP-2 format with the `ccd` namespace:

| Network | CAIP-2 Identifier | V1 Name (legacy) |
|---------|-------------------|------------------|
| Mainnet | `ccd:9dd9ca4d19e9393877d2c44b70f89acb` | `concordium` |
| Testnet | `ccd:4221332d34e1694168c2a0c0b3fd0f27` | `concordium-testnet` |

## Verification

Steps to verify a payment for the `exact` scheme on Concordium:

1. Extract the Concordium-specific payload from `PaymentPayload.payload`
2. Verify `payload.txHash` is present and non-empty
3. Verify `payload.sender` is present and non-empty
4. Return `isValid: true` with the `payer` address

Note: Full transaction validation is deferred to the settlement phase to allow for transaction propagation and block confirmation.
```typescript
// PaymentPayload.payload structure for Concordium
interface ExactConcordiumPayloadV2 {
  txHash: string;   // Transaction hash from client broadcast
  sender: string;   // Sender's Concordium address (base58)
  asset?: string;   // Asset symbol ("" for CCD, "EURR" for PLT)
}
```
## Settlement

Settlement on Concordium differs from EVM because the client has already broadcast the transaction. The facilitator validates the on-chain transaction and waits for finalization.

Steps to settle a payment:

1. Extract `txHash` and `sender` from `PaymentPayload.payload`
2. Extract `network` from `PaymentPayload.accepted.network`
3. Query the Concordium node and wait for transaction finalization
4. Verify the transaction exists and status is `finalized`
5. Verify the transaction `sender` matches `payload.sender`
6. Verify the transaction `recipient` matches `PaymentRequirements.payTo`
7. Verify the transaction `amount` ≥ `PaymentRequirements.amount` (in smallest units)
8. Verify the transaction `asset` matches `PaymentRequirements.asset`
9. Return success with the transaction hash

### Amount Handling

| Asset Type | Requirements.amount | Transaction Amount | Unit |
|------------|--------------------|--------------------|------|
| Native CCD | `"10000000"` | `10000000n` | microCCD (10⁻⁶ CCD) |
| PLT Token | `"1"` | `1000000n` | Smallest unit (10⁻⁶ tokens) |

For native CCD, amounts are stored in microCCD (6 decimals).
For PLT tokens, `requirements.amount` is in full tokens; the client converts to smallest units before broadcast.

## Payment Flow
```
┌─────────┐      ┌─────────┐      ┌─────────────┐      ┌────────────┐
│  Client │      │  Server │      │ Facilitator │      │ Concordium │
└────┬────┘      └────┬────┘      └──────┬──────┘      └─────┬──────┘
     │                │                   │                   │
     │  1. GET /resource                  │                   │
     │────────────────>                   │                   │
     │                │                   │                   │
     │  2. 402 + PaymentRequirements      │                   │
     │<────────────────                   │                   │
     │                │                   │                   │
     │  3. Broadcast CCD/PLT transfer     │                   │
     │────────────────────────────────────────────────────────>
     │                │                   │                   │
     │  4. txHash returned                │                   │
     │<────────────────────────────────────────────────────────
     │                │                   │                   │
     │  5. Build PaymentPayload:          │                   │
     │     - payload: { txHash, sender }  │                   │
     │     - accepted: { scheme, network, payTo, ... }        │
     │                │                   │                   │
     │  6. GET /resource + X-PAYMENT header                   │
     │────────────────>                   │                   │
     │                │                   │                   │
     │                │  7. verify(payload, requirements)     │
     │                │───────────────────>                   │
     │                │                   │                   │
     │                │  8. VerifyResponse { isValid: true }  │
     │                │<───────────────────                   │
     │                │                   │                   │
     │                │  9. settle(payload, requirements)     │
     │                │───────────────────>                   │
     │                │                   │                   │
     │                │                   │  10. waitForFinalization()
     │                │                   │───────────────────>
     │                │                   │                   │
     │                │                   │  11. TransactionInfo
     │                │                   │<───────────────────
     │                │                   │                   │
     │                │                   │  12. Validate:    │
     │                │                   │      - status     │
     │                │                   │      - sender     │
     │                │                   │      - recipient  │
     │                │                   │      - amount     │
     │                │                   │      - asset      │
     │                │                   │                   │
     │                │  13. SettleResponse { success: true } │
     │                │<───────────────────                   │
     │                │                   │                   │
     │  14. 200 OK + Resource             │                   │
     │<────────────────                   │                   │
```

## Comparison with EVM

| Aspect | EVM (`EIP-3009`) | Concordium |
|--------|------------------|------------|
| Authorization | Signed `transferWithAuthorization` | Direct transaction |
| Who Broadcasts | Facilitator | Client |
| Payload Content | Signature + authorization params | txHash + sender |
| Facilitator Role | Execute transfer | Verify transfer |
| Finality | Block confirmations | ConcordiumBFT (~10s) |
| Gas/Fee Payer | Facilitator | Client |

## Transaction Status Mapping

| Concordium Status | Internal Status | Description |
|-------------------|-----------------|-------------|
| `received` | `pending` | Transaction received by node |
| `committed` | `committed` | Transaction in a block |
| `finalized` | `finalized` | Transaction finalized by ConcordiumBFT |
| `reject` | `failed` | Transaction rejected |

## Security Considerations

### Finalization Requirement

Concordium uses ConcordiumBFT consensus which provides deterministic finality. Unlike probabilistic finality on PoW chains, once a transaction is `finalized` on Concordium, it cannot be reverted. The facilitator should:

- **Always require finalization** for production use (`requireFinalization: true`)
- Configure appropriate timeout (`finalizationTimeoutMs`, default 60000ms)
- Average finalization time is ~10 seconds

### Double-Spend Prevention

Because the client broadcasts the transaction before sending the payload, there's no risk of signature replay. Each transaction hash is unique and can only be used once on-chain.

### Amount Verification

The facilitator must verify `txAmount >= requiredAmount` (not strict equality) to handle:
- Rounding differences
- Overpayment scenarios

## Appendix

### Why Client-Broadcast?

Concordium does not have an equivalent to EIP-3009 (`transferWithAuthorization`). The available options are:

1. **Client-broadcast (chosen)**: Client sends transaction, facilitator verifies
2. **Sponsored transactions**: Concordium supports sponsored transactions, but requires additional infrastructure

Client-broadcast was chosen for simplicity and alignment with Concordium's standard transaction model.

### gRPC Interface

The facilitator queries Concordium nodes via gRPC:

```typescript
interface ConcordiumNodeClient {
  getTransactionStatus(txHash: string): Promise<ConcordiumTransactionInfo | null>;
  waitForFinalization(txHash: string, timeoutMs?: number): Promise<ConcordiumTransactionInfo | null>;
}
```
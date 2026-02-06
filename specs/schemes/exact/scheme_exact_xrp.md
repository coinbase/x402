# Scheme: `exact` on `XRP` (Ripple Ledger)

## Summary

The `exact` scheme on XRP executes a transfer where the Facilitator (server) pays the transaction fee, but the Client (user) controls the exact flow of funds via cryptographic signatures.

XRP uses native Payment transactions—no smart contracts are required. The Facilitator cannot modify the amount or destination. They serve only as the transaction broadcaster.

## Key Differences from EVM

| Feature | EVM | XRP |
|---------|-----|-----|
| **Transfer Method** | Smart contract calls (EIP-3009/Permit2) | Native Payment transaction |
| **Signature Algorithm** | ECDSA (secp256k1) | secp256k1 or ed25519[^1] |
| **Replay Protection** | Nonce-based | Sequence numbers per account |
| **Transaction Fees** | Paid to validators (gas) | Destroyed (burned), not paid |
| **Metadata** | Calldata/Events | "Memos" field in transactions |
| **Minimum Balance** | None | Base reserve (10 XRP mainnet, 1 XRP testnet) |
| **Destination Tag** | N/A | Numeric identifier for recipients |

[^1]: x402 uses secp256k1 for easier compatibility with existing Ethereum wallets.

---

## Network Identifier Format

XRP networks use the CAIP-2 format with the `xrp` namespace:

| Network | CAIP-2 Identifier |
|---------|-------------------|
| Mainnet | `xrp:mainnet` |
| Testnet | `xrp:testnet` |
| Devnet  | `xrp:devnet` |

The wildcard `xrp:*` matches all XRP networks.

---

## Phase 1: `PAYMENT-SIGNATURE` Header Payload

The `payload` field must contain:

- `signedTransaction`: The fully signed XRP Payment transaction blob as a hexadecimal string
- `transaction`: The decoded transaction parameters for verification

**Example PaymentPayload:**

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
    "network": "xrp:testnet",
    "amount": "10000",
    "asset": "XRP",
    "payTo": "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
    "maxTimeoutSeconds": 60,
    "extra": {
      "destinationTag": 12345,
      "memo": {
        "memoType": "x402_payment",
        "memoData": "a1b2c3d4e5f6"
      }
    }
  },
  "payload": {
    "signedTransaction": "1200002280000000240000001E6140000000000027108114A7B097D7F5C3C90C9A4E3E7C7A9B5D4E3F2A1B08314B7A6C5D4E3F2A1B0C9D8E7F6A5B4C3D2E1F0A9B8C7D6E5F40000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    "transaction": {
      "TransactionType": "Payment",
      "Account": "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
      "Destination": "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
      "Amount": "10000",
      "Fee": "12",
      "Sequence": 30,
      "LastLedgerSequence": 9000000,
      "DestinationTag": 12345,
      "Memos": [
        {
          "Memo": {
            "MemoType": "x402_payment",
            "MemoData": "a1b2c3d4e5f6"
          }
        }
      ]
    }
  }
}
```

### Transaction Fields

| Field | Type | Description |
|-------|------|-------------|
| `TransactionType` | String | Always `"Payment"` |
| `Account` | String | Sender's XRP address (r... format) |
| `Destination` | String | Recipient's XRP address |
| `Amount` | String | Drops of XRP (1 XRP = 1,000,000 drops) |
| `Fee` | String | Transaction cost in drops (typically 12-100) |
| `Sequence` | Number | Account sequence number for replay protection |
| `LastLedgerSequence` | Number | Maximum ledger index for transaction validity |
| `DestinationTag` | Number (optional) | Recipient identifier for shared addresses |
| `Memos` | Array (optional) | Metadata including x402 payment reference |

### Memo Format

X402 payment references are stored in the `Memos` array:

```json
{
  "Memos": [
    {
      "Memo": {
        "MemoType": "x402_payment",
        "MemoData": "<hex-encoded-payment-reference>"
      }
    }
  ]
}
```

---

## Phase 2: Verification Logic

The verifier must execute these checks in order:

1. **Verify** the `signedTransaction` is a valid XRP transaction blob.
2. **Verify** the signature is valid and recovers to the `transaction.Account` address.
3. **Verify** the `transaction.Amount` matches the `requirements.amount` (in drops).
4. **Verify** the `transaction.Destination` matches the `requirements.payTo`.
5. **Verify** the `transaction.DestinationTag` matches `requirements.extra.destinationTag` (if specified).
6. **Verify** the `transaction.Fee` is reasonable (typically 0.000012 - 0.01 XRP).
7. **Verify** the client has sufficient balance:
   - Total needed = Amount + Fee + Base Reserve (if new account)
8. **Verify** the `transaction.Sequence` is valid (next sequence for the account or a queued sequence).
9. **Verify** `transaction.LastLedgerSequence` is in the future.

### Signature Verification

XRP supports both secp256k1 and ed25519 signatures. The verifier should:

1. Decode the transaction blob
2. Determine the signing algorithm from the signature format
3. Recover/verify the public key matches `transaction.Account`
4. Verify the transaction hash signature

---

## Phase 3: Settlement Logic

Settlement is performed by submitting the `signedTransaction` to the XRPL.

### Submission Flow

1. **Pre-submission Check** (Optional but recommended):
   - Simulate the transaction using `tx` method with `fail_hard: true`
   - Verify no `tec` (Transaction Engine Code) errors

2. **Submit Transaction**:
   ```json
   {
     "method": "submit",
     "params": [
       {
         "tx_blob": "<signedTransaction_hex>"
       }
     ]
   }
   ```

3. **Wait for Validation**:
   - Poll `tx` method with transaction hash
   - Wait for `validated: true` and `meta.TransactionResult: "tesSUCCESS"`

4. **Return Result**:
   - Transaction hash for client reference
   - Success/failure status

### Transaction States

| Status | Description |
|--------|-------------|
| `tesSUCCESS` | Transaction validated and applied |
| `tecPATH_DRY` | Insufficient liquidity (rare on native XRP) |
| `tecUNFUNDED_PAYMENT` | Sender has insufficient balance |
| `tecNO_DST` | Destination account doesn't exist, insufficient XRP to create it |
| `tefPAST_SEQ` | Sequence number too old |
| `tefMAX_LEDGER` | LastLedgerSequence passed |

---

## Phase 4: Error Handling

### Verification Errors (412 Precondition Failed)

| Error Code | Reason | Message |
|------------|--------|---------|
| `INVALID_TRANSACTION` | Malformed blob | Transaction blob could not be decoded |
| `INVALID_SIGNATURE` | Bad signature | Signature verification failed |
| `AMOUNT_MISMATCH` | Amount differs | Transaction amount does not match requirements |
| `DESTINATION_MISMATCH` | Wrong recipient | Transaction destination does not match payTo |
| `DESTINATION_TAG_MISMATCH` | Tag mismatch | Destination tag does not match requirements |
| `INSUFFICIENT_BALANCE` | Low funds | Account balance insufficient for payment + fees |
| `SEQUENCE_INVALID` | Bad sequence | Sequence number is not valid |
| `EXPIRED` | Deadline passed | LastLedgerSequence is in the past |

### Settlement Errors (402 Payment Required or 500)

| Error Code | Reason | Message |
|------------|--------|---------|
| `SUBMIT_FAILED` | XRPL rejected | Transaction rejected by XRPL |
| `ALREADY_PROCESSED` | Duplicate | Transaction already validated |
| `TIMEOUT` | Not validated | Transaction did not validate within expected time |
| `UNFUNDED` | No balance | Sender lacks funds (race condition) |
| `DESTINATION_NOT_FOUND` | Missing account | Destination does not exist and cannot be created |

---

## Annex

### XRP Ledger Endpoints

| Network | JSON-RPC Endpoint | WebSocket Endpoint |
|---------|-------------------|-------------------|
| Mainnet | `https://mainnet.xrpl-labs.com` | `wss://mainnet.xrpl-labs.com` |
| Testnet | `https://testnet.xrpl-labs.com` | `wss://testnet.xrpl-labs.com` |
| Devnet  | `https://devnet.xrpl-labs.com` | `wss://devnet.xrpl-labs.com` |

### Conversion Reference

| Unit | Drops | XRP |
|------|-------|-----|
| 1 XRP | 1,000,000 | 1 |
| 1 drop | 1 | 0.000001 |

### Base Reserve Requirements

| Network | Minimum Balance | Owner Reserve (per object) |
|---------|----------------|---------------------------|
| Mainnet | 10 XRP | 2 XRP |
| Testnet | 1 XRP | 0.2 XRP |
| Devnet  | 1 XRP | 0.2 XRP |

### X-address Encoding

XRP modern addresses support X-address format (encodes address + destination tag):
- `X7m1kaW4K3RWMnSWEtTH4gyAYYqR9hT8hC` (encodes r-address + tag)

Facilitators should accept both r-addresses and X-addresses, normalizing internally.

---

## Implementation Notes

### Client Responsibilities

1. Fetch current account sequence from XRPL
2. Set appropriate `LastLedgerSequence` (current + 20 is typical)
3. Set appropriate `Fee` (can query `fee` method for current rates)
4. Sign the complete transaction blob
5. Include any required `DestinationTag` in `extra`

### Facilitator Responsibilities

1. Maintain XRPL connection for transaction submission
2. Monitor account sequence for pending transactions
3. Handle duplicate submission gracefully (idempotent)
4. Poll for transaction validation
5. Clean up unvalidated transactions after `LastLedgerSequence` passes

### Security Considerations

1. **Sequence Management**: Facilitators should be aware of pending transactions to avoid sequence conflicts
2. **Replay Protection**: The `Sequence` + `Account` + network combination provides replay protection
3. **Finality**: XRP Ledger provides finality after validation (typically 4-6 seconds)
4. **Fee Burning**: XRP fees are destroyed—not sent to validators—making the network cheaper but requiring different economic incentives

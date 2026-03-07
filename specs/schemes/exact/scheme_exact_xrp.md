# Exact Payment Scheme for XRP Ledger (`exact`)

This document specifies the `exact` payment scheme for the x402 protocol on the XRP Ledger. This scheme facilitates payments of a specific amount of native XRP using signed-but-unbroadcast XRP Payment transactions.

## Scheme Name

`exact`

## Supported Networks

| Network | CAIP-2 Identifier |
| ------- | ----------------- |
| XRPL Mainnet | `xrpl:0` |
| XRPL Testnet | `xrpl:1` |
| XRPL Devnet | `xrpl:2` |

Wildcard: `xrpl:*` matches all XRP Ledger networks.

## Supported Assets

| Token | Asset Identifier | Decimals | Smallest Unit |
| ----- | ---------------- | -------- | ------------- |
| XRP | `xrp` | 6 | drop |

1 XRP = 1,000,000 drops.

## Protocol Flow

The protocol flow for `exact` on XRP Ledger is client-driven:

1. Client makes an HTTP request to a Resource Server.
2. Resource Server responds with a `402 Payment Required` status containing `PaymentRequirements` with an `accepts` array that includes the `exact` scheme on an `xrpl:*` network.
3. Client reads the `PaymentRequirements`, noting the `asset`, `amount`, `payTo`, and `maxTimeoutSeconds`.
4. Client connects to an XRP Ledger node and fetches account info (sequence number, balance).
5. Client constructs an XRP Payment transaction with `Destination` set to `payTo`, `Amount` set to `amount` (in drops), and `LastLedgerSequence` for expiry.
6. Client signs the transaction using their secp256k1 private key via `Wallet.sign()`, producing a `tx_blob` (hex-encoded signed transaction) and `hash` (transaction ID).
7. The client does NOT broadcast the transaction. The signed `tx_blob` is passed to the facilitator via the payment payload.
8. Client constructs the `PaymentPayload` containing the `tx_blob`, transaction `hash`, and payer's address, base64-encodes it, and sends it in the `X-PAYMENT` header with the original HTTP request.
9. Resource Server receives the request and forwards the `PaymentPayload` and `PaymentRequirements` to a Facilitator's `/verify` endpoint.
10. Facilitator performs all verification checks (see Facilitator Verification Rules below).
11. If verification passes, Facilitator returns `{ "isValid": true }` to the Resource Server.
12. Resource Server serves the requested resource to the Client.
13. Resource Server (or Facilitator) calls the Facilitator's `/settle` endpoint.
14. Facilitator submits the `tx_blob` to the XRP Ledger via `submit()`.
15. Facilitator returns the `SettlementResponse` containing the on-chain transaction hash.

## PaymentRequirements

```json
{
  "scheme": "exact",
  "network": "xrpl:0",
  "amount": "1000000",
  "asset": "xrp",
  "payTo": "rMerchantXRPAddress...",
  "maxTimeoutSeconds": 60,
  "extra": {
    "name": "XRP",
    "decimals": 6
  }
}
```

- **`scheme`**: MUST be `"exact"`.
- **`network`**: A CAIP-2 identifier for the XRP Ledger network.
- **`amount`**: The amount to be transferred in drops as a string. `"1000000"` = 1 XRP.
- **`asset`**: MUST be `"xrp"` for native XRP payments.
- **`payTo`**: The XRP Ledger address (classic `r...` format) of the resource server receiving the funds.
- **`maxTimeoutSeconds`**: Maximum time in seconds the payment authorization remains valid.

## PaymentPayload

```json
{
  "x402Version": 2,
  "scheme": "exact",
  "network": "xrpl:0",
  "payload": {
    "tx_blob": "1200002200000000240000...",
    "hash": "A1B2C3D4E5F6...",
    "from": "rPayerXRPAddress..."
  }
}
```

### Payload Fields

- **`tx_blob`**: Hex-encoded signed XRP Payment transaction. Contains the complete signed transaction including the signature. The facilitator decodes this to verify all transaction fields.
- **`hash`**: The transaction hash (ID) computed from the signed transaction. Used for replay protection and tracking.
- **`from`**: The payer's XRP Ledger address (classic `r...` format). Used for informational purposes and balance verification.

## SettlementResponse

```json
{
  "success": true,
  "transaction": "A1B2C3D4E5F6...",
  "network": "xrpl:0",
  "payer": "rPayerXRPAddress..."
}
```

- **`transaction`**: The XRP Ledger transaction hash of the submitted transaction.
- **`payer`**: The XRP address of the client that signed the transaction.

## Facilitator Verification Rules (MUST)

A facilitator verifying an `exact`-scheme XRP Ledger payment MUST enforce all of the following checks before submitting the transaction.

### 1. Transaction Format Validity

- The payload MUST contain a `tx_blob` field that is a valid hex string.
- The `tx_blob` MUST decode successfully using `ripple-binary-codec`.
- The decoded transaction MUST be of type `Payment` (`TransactionType` = "Payment").

### 2. Signature Verification

- The facilitator MUST verify the transaction signature using `xrpl.verifySignature()` or equivalent.
- The signature MUST be valid for the decoded transaction data.
- The `SigningPubKey` MUST correspond to the `Account` field in the transaction.

### 3. Recipient Address Verification

- The `Destination` field in the decoded transaction MUST match the `payTo` address from `PaymentRequirements`.
- Address comparison MUST be exact (case-sensitive for XRP classic addresses).

### 4. Transfer Amount Verification

- The `Amount` field in the decoded transaction MUST be greater than or equal to the `amount` in `PaymentRequirements`.
- For native XRP, the amount is in drops (string representation).

### 5. Transaction Expiration

- The `LastLedgerSequence` field MUST be present to bound the transaction's validity.
- The facilitator SHOULD verify that `LastLedgerSequence` has not yet been exceeded by the current validated ledger.

### 6. Sender Balance Verification

- The facilitator MUST query the sender's XRP balance via `account_info`.
- The balance MUST be sufficient to cover the payment amount plus the XRP reserve requirement (currently 10 XRP base reserve + 2 XRP per owned object).
- The facilitator SHOULD re-query balance immediately before broadcast (TOCTOU mitigation).

### 7. Replay Protection

- The facilitator MUST maintain a set of recently seen transaction `hash` values and reject any payment whose hash has already been processed.
- The XRP Ledger provides built-in sequence-number-based replay protection, but application-layer tracking is still required.

### 8. Network Match

- The `network` field in the `PaymentPayload` MUST match the `network` in the `PaymentRequirements`.
- The network MUST be a recognized CAIP-2 XRP Ledger identifier.

### 9. Scheme Match

- The `scheme` field MUST be `"exact"`.

### 10. Amount Consistency

- The `amount` in `PaymentPayload.accepted` (if present) MUST match the `amount` in the original `PaymentRequirements`.

### 11. No Partial Payments

- The `tfPartialPayment` flag (0x00020000) MUST NOT be set in the `Flags` field. Partial payments could result in less than the required amount being delivered.

### 12. No Destination Tags (Unless Required)

- If the `payTo` requirements do not specify a destination tag, the facilitator SHOULD verify no unexpected `DestinationTag` is set that could redirect funds.

## Settlement

Upon settlement, the facilitator:

1. **Re-verifies sender balance** — The facilitator SHOULD re-query the sender's XRP balance immediately before submitting to detect balance changes since verification.
2. **Submits the `tx_blob`** to the XRP Ledger network via `submit()`.
3. **Checks the submission result** — The `engine_result` MUST be `"tesSUCCESS"` for immediate success, or a `tec`/`ter` class result for conditional handling.
4. **Waits for validation** — The facilitator SHOULD wait for the transaction to appear in a validated ledger.
5. **Returns the SettlementResponse** with the transaction hash.

The facilitator pays no XRP fees — the transaction fee is embedded in the signed transaction by the client (the `Fee` field, typically 12 drops).

## Settlement Failure Modes

| Failure | Cause | Outcome |
| ------- | ----- | ------- |
| `tecUNFUNDED_PAYMENT` | Sender lacks sufficient XRP | Transaction fails on-chain. No funds move. |
| `tefPAST_SEQ` | Transaction sequence already used | Transaction rejected. Client must sign new transaction. |
| `tefMAX_LEDGER` | `LastLedgerSequence` exceeded | Transaction expired. Client must sign new transaction. |
| `tecNO_DST` | Destination account does not exist | Transaction fails. Facilitator should return error. |
| Network error | XRP Ledger node unavailable | Facilitator retries or returns settlement failure. |

## Security Considerations

### Trust Model

The XRP Ledger exact scheme provides strong trust-minimization guarantees through the signed transaction model:

**Recipient Lock (Signed Transaction).** The `Destination` address is embedded in the signed transaction. The recipient cannot be changed without invalidating the ECDSA signature. The facilitator can only submit the transaction as-is.

**Amount Lock (Signed Transaction).** The `Amount` field (in drops) is committed by the signature. The facilitator cannot alter the payment amount.

| Property | Guarantee |
| -------- | --------- |
| Recipient | Locked by signature — facilitator cannot redirect funds |
| Amount | Locked by signature — facilitator cannot alter the transfer value |
| Timing | Bounded by `LastLedgerSequence` — transaction expires after a specific ledger |
| Scope | Single payment — facilitator cannot add operations |
| Gas | Embedded `Fee` field — client pays transaction fee (typically 12 drops) |

### Replay Protection

XRP Ledger transactions include an `Account` `Sequence` number that MUST be unique and monotonically increasing. Once a transaction is included in a validated ledger, no transaction with the same account and sequence can be replayed. Facilitators MUST additionally maintain an in-memory or persistent set of processed transaction hashes for application-layer replay protection.

### Address Format

XRP Ledger addresses use the classic `r...` format (base58check encoding with the XRP alphabet). Addresses are case-sensitive. Implementations MUST validate address format before processing. X-addresses (which encode destination tags) are also supported but MUST be decoded to classic format for comparison.

### Double-Spend Risk

Because the client signs a complete transaction, they could theoretically spend their XRP elsewhere between verification and settlement. The `LastLedgerSequence` field bounds the window during which the transaction is valid. Facilitators SHOULD minimize the time between verification and settlement. If submission fails due to insufficient funds, no funds move and no resource is served. The system fails closed.

### Transaction Malleability

XRP Ledger transactions are uniquely identified by their hash, which is computed from the canonical binary serialization of the signed transaction. The hash cannot be altered without invalidating the signature.

## Differences from EVM Exact Scheme

| Feature | EVM (`eip155:*`) | XRP Ledger (`xrpl:*`) |
| ------- | ---------------- | --------------------- |
| Transaction model | Account-based (ERC-20) | Account-based (native XRP) |
| Meta-transactions | EIP-3009 `transferWithAuthorization` | Signed Payment transaction (`tx_blob`) |
| Gas model | ETH gas fees (paid by facilitator) | Fee embedded in transaction (12 drops, paid by client) |
| Signing | EIP-712 typed data | secp256k1 ECDSA over canonical binary encoding |
| Address format | 0x-prefixed hex (20 bytes) | `r...` base58check (25 bytes) |
| Block time | ~2s (Base L2) | ~3-5 seconds |
| Primary asset | USDC (ERC-20) | XRP (native) |
| Replay protection | Nonce-based (EIP-3009) | Sequence-number-based + `LastLedgerSequence` |
| Expiration | `validBefore` timestamp | `LastLedgerSequence` (ledger index) |
| Finality | Probabilistic (reorg possible) | Deterministic (validated ledger is final) |

## Reference Implementation

| Component | Location |
| --------- | -------- |
| npm package | [`@erudite-intelligence/x402-xrp`](https://www.npmjs.com/package/@erudite-intelligence/x402-xrp) |
| GitHub | [EruditeIntelligence/x402-xrp](https://github.com/EruditeIntelligence/x402-xrp) |
| Facilitator | Erudite Intelligence LLC (FinCEN-registered MSB #31000283503553) |

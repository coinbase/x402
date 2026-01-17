# Exact Payment Scheme for XRP Ledger (XRPL) (`exact`)

This document specifies the `exact` payment scheme for the x402 protocol v2 on the XRP Ledger.

This scheme facilitates payments of a specific amount of XRP or an issued currency (IOU) on the XRP Ledger using a **payer-signed `Payment` transaction**.

## Scheme Name

`exact`

## Payment Model

| Aspect | Description |
|--------|-------------|
| **Payment authorization** | The payer signs a standard XRPL `Payment` transaction |
| **Settlement** | The facilitator submits the signed transaction to XRPL |
| **Fee payer** | The payer pays the XRPL transaction fee (embedded in the signed transaction) |

## Network Identifier (CAIP-2)

x402 v2 requires CAIP-2 network identifiers. For XRPL, the format is:

```
xrpl:{network_id}
```

Where `network_id` is the XRPL numeric NetworkID (uint32).

| Network | Identifier |
|---------|------------|
| Mainnet | `xrpl:0` |
| Testnet | `xrpl:1` |
| Devnet | `xrpl:2` |


## Protocol Flow

The protocol flow for `exact` on XRPL is client-driven.

1. **Client** makes a request to a **Resource Server**.
2. **Resource Server** responds with a payment required signal containing `PaymentRequired` in the `PAYMENT-REQUIRED` header (base64-encoded JSON).
3. **Client** creates a `Payment` transaction to the resource server's XRPL address for the specified amount.
4. **Client** signs the transaction with their wallet, producing a fully-signed transaction blob.
5. **Client** encodes the signed transaction as a hex string.
6. **Client** sends a new request to the resource server with the `PAYMENT-SIGNATURE` header containing the base64-encoded `PaymentPayload`.
7. **Resource Server** receives the request and forwards the `PaymentPayload` and `PaymentRequirements` to a **Facilitator Server's** `/verify` endpoint.
8. **Facilitator** decodes the `signedTxBlob` and deserializes the proposed transaction.
9. **Facilitator** inspects the transaction to ensure it is valid and matches the expected payment parameters.
10. **Facilitator** returns a `VerifyResponse` to the **Resource Server**.
11. **Resource Server**, upon successful verification, forwards the payload to the facilitator's `/settle` endpoint.
12. **Facilitator Server** submits the signed transaction to the XRPL network.
13. Upon successful on-chain validation, the **Facilitator Server** responds with a `SettlementResponse` to the **Resource Server**.
14. **Resource Server** grants the **Client** access to the resource via the `PAYMENT-RESPONSE` header.

## x402 v2 Headers

| Direction | Header | Content |
|-----------|--------|---------|
| Server → Client (challenge) | `PAYMENT-REQUIRED` | Base64-encoded JSON `PaymentRequired` |
| Client → Server (payment) | `PAYMENT-SIGNATURE` | Base64-encoded JSON `PaymentPayload` |
| Server → Client (result) | `PAYMENT-RESPONSE` | Base64-encoded JSON settlement response |

> **Note:** Legacy header names (`X-PAYMENT`, `X-PAYMENT-RESPONSE`) are deprecated and SHOULD NOT be used for new integrations.

## `PaymentRequirements` for `exact`

The resource server advertises payment requirements in the `accepts` array:

### XRP (Native) Example

```json
{
  "scheme": "exact",
  "network": "xrpl:0",
  "asset": "XRP",
  "payTo": "rN7n3473SaZBCG4dFL83w7a1RXtXtbk2D9",
  "amount": "1000000",
  "maxTimeoutSeconds": 600,
  "extra": {
    "invoiceId": "INV-2025-001"
  }
}
```

### IOU (Issued Currency) Example

```json
{
  "scheme": "exact",
  "network": "xrpl:0",
  "asset": "524C555344000000000000000000000000000000",
  "payTo": "rN7n3473SaZBCG4dFL83w7a1RXtXtbk2D9",
  "amount": "10.50",
  "maxTimeoutSeconds": 600,
  "extra": {
    "issuer": "rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q",
    "invoiceId": "INV-2025-002",
    "destinationTag": 12345
  }
}
```

### Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scheme` | string | Yes | Must be `"exact"` |
| `network` | string | Yes | CAIP-2 identifier (e.g., `"xrpl:0"`) |
| `asset` | string | Yes | `"XRP"` for native, or currency code for IOUs |
| `payTo` | string | Yes | XRPL classic address (destination) |
| `amount` | string | Yes | Payment amount (see Amount Formatting) |
| `maxTimeoutSeconds` | integer | Yes | Maximum validity window for payment attempt |
| `extra.invoiceId` | string | Yes | Unique invoice identifier for binding |
| `extra.destinationTag` | integer | No | DestinationTag for hosted accounts |
| `extra.issuer` | string | IOU only | Classic address of the IOU issuer |

### Asset Field Values

| Asset Type | Format | Example |
|------------|--------|---------|
| Native XRP | `"XRP"` | `"XRP"` |
| 3-char IOU | 3-character code | `"USD"` |
| 160-bit IOU | 40 hex characters | `"524C555344000000000000000000000000000000"` |

## Amount Formatting

### XRP (Native)

XRP amounts are specified in **drops** (1 XRP = 1,000,000 drops):

| Human Amount | `amount` Value |
|--------------|----------------|
| 1 XRP | `"1000000"` |
| 0.1 XRP | `"100000"` |
| 0.000001 XRP | `"1"` |

### IOU (Issued Currency)

IOU amounts are specified as **decimal strings**:

| Human Amount | `amount` Value |
|--------------|----------------|
| 10.50 USD | `"10.50"` |
| 0.01 RLUSD | `"0.01"` |

## `PaymentPayload` for `exact`

The `PAYMENT-SIGNATURE` header contains a base64-encoded `PaymentPayload`:

### XRP Example

```json
{
  "x402Version": 2,
  "accepted": {
    "scheme": "exact",
    "network": "xrpl:0",
    "asset": "XRP",
    "payTo": "rN7n3473SaZBCG4dFL83w7a1RXtXtbk2D9",
    "amount": "1000000",
    "maxTimeoutSeconds": 600,
    "extra": {
      "invoiceId": "INV-2025-001"
    }
  },
  "payload": {
    "signedTxBlob": "1200002280000000240000000361D4838D7EA4C6800000000000000000000000000000555344000000000042D60F33B4EC19C2DB2E855D1AC42A3E1DD4665068400000000000000A732103AB40A0490F9B7ED8DF29D246BF2D6269820A0EE7742ACDD457BEA7C7D0931EDB74473045022100..."
  }
}
```

### IOU Example

```json
{
  "x402Version": 2,
  "accepted": {
    "scheme": "exact",
    "network": "xrpl:0",
    "asset": "524C555344000000000000000000000000000000",
    "payTo": "rN7n3473SaZBCG4dFL83w7a1RXtXtbk2D9",
    "amount": "10.50",
    "maxTimeoutSeconds": 600,
    "extra": {
      "issuer": "rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q",
      "invoiceId": "INV-2025-002"
    }
  },
  "payload": {
    "signedTxBlob": "1200002280000000240000000361D4838D7EA4C6800000000000000000000000000000555344000000000042D60F33B4EC19C2DB2E855D1AC42A3E1DD4665068400000000000000A732103AB40A0490F9B7ED8DF29D246BF2D6269820A0EE7742ACDD457BEA7C7D0931EDB74473045022100..."
  }
}
```

### Payload Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `signedTxBlob` | string | Yes | Hex-encoded signed XRPL transaction blob |

## Facilitator Verification Rules (MUST)

A facilitator verifying an `exact`-scheme XRPL payment MUST enforce all of the following checks:

### 1. Envelope Checks (x402 v2)

The facilitator MUST reject if:

- `paymentPayload.x402Version != 2`
- `paymentPayload.accepted.scheme != "exact"`
- `paymentPayload.accepted.network` is unsupported
- `paymentPayload.accepted` does not match `paymentRequirements` on:
  - `scheme`, `network`, `asset`, `payTo`, `amount`
  - Required `extra` keys (`invoiceId`, and `issuer` for IOU)

### 2. Transaction Decoding

- Decode `signedTxBlob` (hex) into bytes
- Decode bytes using XRPL binary codec to obtain `tx_json`
- If decoding fails, verification MUST fail

### 3. Transaction Type

- `tx_json.TransactionType` MUST equal `"Payment"`

### 4. Destination Validation

- `tx_json.Destination` MUST equal `paymentRequirements.payTo`
- If `paymentRequirements.extra.destinationTag` is present:
  - `tx_json.DestinationTag` MUST be present and equal

### 5. Network Binding

Let `networkId` be the integer parsed from `paymentRequirements.network` (e.g., `"xrpl:1"` → `1`).

| Condition | Requirement |
|-----------|-------------|
| `networkId <= 1024` | `tx_json.NetworkID` MUST be **omitted** |
| `networkId > 1024` | `tx_json.NetworkID` MUST equal `networkId` |

> This prevents cross-network replay attacks and guaranteed on-chain failures.

### 6. Amount Validation

XRPL API v2 uses `DeliverMax`; API v1 uses `Amount`. The facilitator MUST determine the destination amount field:

- If `tx_json.DeliverMax` is present, use it
- Else use `tx_json.Amount`
- If neither is present, REJECT
- If both are present, REJECT (ambiguity)

#### XRP Amount Rules

If `paymentRequirements.asset == "XRP"`:

- Destination amount field MUST be a string of digits (drops)
- `int(destinationAmount) == int(paymentRequirements.amount)`
- `tx_json.SendMax` MUST be omitted
- `tx_json.Paths` MUST be omitted
- `tx_json.DeliverMin` MUST be omitted

#### IOU Amount Rules

If `paymentRequirements.asset != "XRP"`:

- Destination amount field MUST be an issued-currency object:
  ```json
  { "currency": "...", "issuer": "...", "value": "..." }
  ```
- `currency` MUST match `paymentRequirements.asset` (3-char or 160-bit hex)
- `issuer` MUST match `paymentRequirements.extra.issuer`
- `Decimal(value) == Decimal(paymentRequirements.amount)`

##### SendMax Policy (Required for IOU)

To prevent cross-currency behaviors while allowing issuer transfer fees:

- `tx_json.SendMax` MUST be present
- `SendMax` MUST be the same issued currency (same `currency` and `issuer`)
- `Decimal(SendMax.value) >= Decimal(destinationAmount.value)`

The facilitator MUST reject if:

- `Paths` is present
- `DeliverMin` is present
- `Flags` includes `tfPartialPayment` (0x00020000)

### 7. Expiry Validation

- `tx_json.LastLedgerSequence` MUST be present

Recommended policy:

- Convert `maxTimeoutSeconds` to ledgers: `maxLedgerDelta = ceil(maxTimeoutSeconds / 5) + 2`
- Require: `LastLedgerSequence <= currentValidatedLedgerIndex + maxLedgerDelta`

### 8. Invoice Binding (Required)

The signed transaction MUST commit to the invoice via one of:

#### Option A: Memos

The transaction includes a memo where:
- `MemoData` (decoded UTF-8) equals `paymentRequirements.extra.invoiceId`
- Encoding: `MemoData = HEX(UTF-8(invoiceId))`
- Comparison: case-insensitive

#### Option B: InvoiceID Field

The transaction includes:
- `InvoiceID = SHA-256(invoiceId)` as 32-byte hex (64 hex characters)
- Comparison: case-insensitive

The facilitator MUST reject if neither binding is present or if any present binding is mismatched.

### 9. Safety Checks (Recommended)

The facilitator SHOULD reject transactions with:

- Excessive `Fee` (define a max fee policy, e.g., 1 XRP)
- Unsupported transaction features

### 10. Signature Validation

- `/verify` MAY validate the signature offline if the implementation supports XRPL signature verification
- `/settle` MUST handle signature-related failures and report them appropriately

## Settlement

Given verified `(paymentPayload, paymentRequirements)`, the facilitator:

1. Re-runs verification
2. Submits `signedTxBlob` to XRPL via `submit` API
3. Waits for validated result (poll `tx` until `validated=true`)
4. Returns the transaction hash and payer address

### Fee Responsibility

The **payer** pays the XRPL transaction fee because:
- `Fee` is embedded in the signed transaction
- XRPL charges fees to the transaction's `Account` field

### Settlement Timeout

The facilitator SHOULD wait for a validated result before returning success to prevent releasing resources for transactions that never validate.

## `SettlementResponse`

On successful settlement, the `PAYMENT-RESPONSE` header contains:

```json
{
  "success": true,
  "transaction": "A1B2C3D4E5F6...",
  "network": "xrpl:0",
  "payer": "rPayer123..."
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Settlement success status |
| `transaction` | string | XRPL transaction hash (64 hex chars) |
| `network` | string | CAIP-2 network identifier |
| `payer` | string | Payer's XRPL classic address |

Implementations MAY include additional fields (e.g., `invoiceId`, `amount`, `asset`).

## Security Considerations

### Trust Minimization

This scheme is designed with trust minimization:

- The facilitator **cannot redirect funds** because any mutation of the signed transaction invalidates the payer's signature
- The resource server **cannot collect more** than the amount the payer signed for
- Invoice binding ensures the payer's intent is cryptographically committed

### Replay Protection

- `LastLedgerSequence` ensures transactions expire
- `Sequence` number prevents double-submission by the same account
- Network binding prevents cross-network replay

### Partial Payment Protection

- `tfPartialPayment` flag is explicitly rejected
- `Paths` and `DeliverMin` are rejected for XRP
- IOU requires `SendMax` to match destination currency

## References

- [XRPL Payment Transaction](https://xrpl.org/payment.html)
- [XRPL Network IDs](https://xrpl.org/docs/concepts/networks-and-servers/parallel-networks)
- [CAIP-2 Specification](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md)
- [x402 Protocol Specification](https://github.com/coinbase/x402/blob/main/specs/x402-specification-v2.md)

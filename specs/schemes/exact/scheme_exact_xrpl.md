# Scheme: `exact` on `XRPL`

## Summary

This document specifies the `exact` payment scheme implementation for the XRP Ledger (XRPL) within the x402 protocol v2.

The XRPL `exact` scheme uses a **payer-signed XRPL `Payment` transaction** that transfers a **specific, fixed amount** to the `payTo` address declared by the resource server in `PaymentRequirements`. The signed transaction is transmitted as the scheme-specific `payload` inside a standard x402 `PaymentPayload`.

This approach has two properties aligned with x402 trust-minimization goals:
- The facilitator cannot redirect funds because any mutation of a signed XRPL transaction invalidates its signature.
- The resource server cannot collect more than the amount the payer has signed.

This proposal supports the XRPL public networks:
- Mainnet
- Testnet
- Devnet

This proposal excludes sidechains / parallel networks.

## Network identifier (CAIP-2)

x402 v2 requires network identifiers to use CAIP-2 format `namespace:reference`.

This document proposes:
- XRPL mainnet: `xrpl:0`
- XRPL testnet: `xrpl:1`
- XRPL devnet: `xrpl:2`

This is a proposal value. x402 maintainers may prefer a different CAIP-2 reference convention for XRPL.

References:
- x402 v2 CAIP-2 usage: https://github.com/coinbase/x402/blob/main/specs/x402-specification-v2.md
- CAIP-2 definition: https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md

## Asset identifier

Initial scope is restricted to native XRP.

- `asset` MUST be the string literal `XRP`.
- `amount` MUST be a base-10 integer string representing **drops**.

Rationale:
- Direct XRP-to-XRP payments deliver an exact amount deterministically.
- Issued-currency and path-based payments introduce transfer fees, trust line constraints, and partial-payment pitfalls.

## `PaymentRequirements` (XRPL)

The scheme uses the standard x402 v2 `PaymentRequirements` structure and constrains fields as follows.

### Required fields

- `scheme`: MUST be `exact`.
- `network`: MUST be one of `xrpl:0`, `xrpl:1`, or `xrpl:2`.
- `amount`: MUST be a base-10 integer string representing drops.
- `asset`: MUST be `XRP`.
- `payTo`: MUST be a valid XRPL destination address.
- `maxTimeoutSeconds`: REQUIRED by x402 v2.

### XRPL-specific `extra` fields

The following keys are defined inside `PaymentRequirements.extra`.

#### `destinationTag` (optional)

- Type: integer (UInt32)
- If present, the client MUST set `DestinationTag` on the XRPL `Payment` to the same value.

#### `invoiceId` (recommended)

- Type: 256-bit hex string (64 hex characters; case-insensitive)
- If present, the client MUST set `InvoiceID` on the XRPL `Payment` to the same value.

Purpose:
- Provides deterministic request-to-payment correlation.
- Enables replay resistance by permitting a one-time-use policy.

Reference:
- InvoiceID field: https://xrpl.org/payment.html#payment-fields

#### `requireDestinationAccount` (optional; recommended default `true`)

- Type: boolean
- If `true`, verification MUST ensure `Destination` is already funded.

Purpose:
- Prevents payments being interpreted as account creation.

Reference:
- Payment can create accounts: https://xrpl.org/payment.html#creating-accounts

### Example `PaymentRequirements`

```json
{
  "scheme": "exact",
  "network": "xrpl:0",
  "amount": "1000000",
  "asset": "XRP",
  "payTo": "rNnDqkG7y9sZy7LwqQJ3k8q9mWmZJf9ZQW",
  "maxTimeoutSeconds": 60,
  "extra": {
    "destinationTag": 12345,
    "invoiceId": "5F6E0F5E2E2A0F0E5A1B7E1E5A2F6D0B7A7C1D9E6B0A1F2E3D4C5B6A7C8D9E0F",
    "requireDestinationAccount": true
  }
}
```

## PaymentPayload `payload` Field

The `payload` field of the `PaymentPayload` MUST contain the following fields:

- `txBlob`: string
  - A signed XRPL transaction blob encoded as a hex string (as used by XRPL JSON-RPC `submit` under `tx_blob`).

Example `payload`:

```json
{
  "txBlob": "12000022800000002400000001201B00F4240A6140000000000F424068400000000000000C732103ABCD..."
}
```

## XRPL transaction construction

The client MUST construct and sign an XRPL transaction satisfying all of the following.

### Transaction type and semantics

1. `TransactionType` MUST be `Payment`.
2. The payment MUST be a direct XRP-to-XRP payment:
   - Amount MUST be specified as XRP drops (string).
   - `SendMax` MUST be omitted.
   - `Paths` MUST be omitted.
3. The payment MUST NOT be a partial payment:
   - `tfPartialPayment` MUST NOT be set.

References:
- Payment type: https://xrpl.org/payment.html
- Partial payments: https://xrpl.org/payment.html#partial-payments
- Paths: https://xrpl.org/payment.html#paths

### Destination and amount

4. `Destination` MUST equal `PaymentRequirements.payTo`.
5. The XRP amount MUST equal `PaymentRequirements.amount` exactly.

### Correlation fields

6. If `PaymentRequirements.extra.destinationTag` is present, `DestinationTag` MUST match exactly.
7. If `PaymentRequirements.extra.invoiceId` is present, `InvoiceID` MUST match exactly.

### Expiry

8. `LastLedgerSequence` SHOULD be present.
9. If `LastLedgerSequence` is present, it SHOULD constrain the transaction to expire within the `maxTimeoutSeconds` window.

Reference:
- LastLedgerSequence: https://xrpl.org/transaction-common-fields.html

## Verification

Steps to verify a payment for the `exact` scheme on XRPL:

1. Decode the hex-encoded `txBlob` into an XRPL transaction object; reject if parsing fails.
2. Verify `TransactionType == Payment`.
3. Verify the transaction is a direct XRP payment:
   - `SendMax` is absent.
   - `Paths` is absent.
   - Amount is expressed as drops (string).
4. Verify `tfPartialPayment` is not set.
5. Verify `Destination == payTo`.
6. If `destinationTag` is specified in requirements, verify `DestinationTag` matches.
7. If `invoiceId` is specified in requirements, verify `InvoiceID` matches.
8. Verify the XRP amount equals `PaymentRequirements.amount` exactly.
9. Require bounded lifetime:
   - The verifier MUST reject transactions that do not have a finite lifetime.
   - Implementations MAY enforce this by requiring `LastLedgerSequence`.
10. Verify the transaction signature(s) are valid and determine the payer account.
11. If `requireDestinationAccount` is `true`, verify the destination account exists and is funded.

Reference:
- Common fields including signatures: https://xrpl.org/transaction-common-fields.html

## Settlement

Settlement is performed via broadcasting the signed `Payment` transaction to XRPL.

A settler MUST:

1. Submit `txBlob` to XRPL.
2. Wait for a validated ledger result.
3. Consider settlement successful only if the transaction appears in a validated ledger with a success code.

References:
- Transaction results and provisional submit responses: https://xrpl.org/transaction-results.html
- Finality of results: https://xrpl.org/finality-of-results.html

## Appendix

### Notes on initial scope

This proposal intentionally excludes:
- Issued currencies and path payments.
- Any partial payment semantics.
- Sidechains / parallel networks.

The primary reason is to preserve exactness guarantees and keep verification rules deterministic and reviewable.

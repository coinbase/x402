# Exact Payment Scheme for Algorand Virtual Machine (AVM) (`exact`)

This document specifies the `exact` payment scheme for the x402 protocol on Algorand.

This scheme facilitates payments of a specific amount of an Algorand asset (either ALGO or an Algorand Standard Asset) on the Algorand blockchain, leveraging Algorand's native features for enhanced security and efficiency.

## Scheme Name

`exact`

## Protocol Flow

The protocol flow for `exact` on Algorand is client-driven with facilitator fee abstraction:

1. **Client** makes an HTTP request to a **Resource Server**.
2. **Resource Server** responds with a `402 Payment Required` status. The response body contains the `paymentRequirements` for the `exact` scheme. Optional facilitator metadata MAY be carried inside the `extra` object.
3. **Client** creates an Algorand payment or asset transfer transaction that sends the required amount to the resource server's wallet address.

4. If a fee payer address is supplied in the metadata, the **Client** creates a fee-payer transaction (amount=0, fee=cover both) and assigns it the same group ID as the payment transaction (fee=0).
5. **Client** sets the `lease` field of the transaction to the SHA-256 hash of the `paymentRequirements` to as an attestation to payment requirements and bind the transaction to the specific payment request.
6. **Client** signs the transaction with their Algorand wallet.
7. **Client** serializes the signed transaction and encodes it as a Base64 string.
8. **Client** sends a new HTTP request to the resource server with the `X-PAYMENT` header containing the Base64-encoded signed transaction payload.
9. **Resource Server** receives the request and forwards the `X-PAYMENT` header and `paymentRequirements` to a **Facilitator Server's** `/verify` endpoint.
10. **Facilitator** decodes and deserializes the transaction.
11. **Facilitator** verifies the `lease` field matches the SHA-256 hash of the `paymentRequirements`.
12. **Facilitator** inspects the transaction to ensure it is valid and only contains the expected payment instruction.
13. **Facilitator** returns a response to the **Resource Server** verifying the **client** transaction.
14. **Resource Server**, upon successful verification, forwards the payload to the facilitator's `/settle` endpoint.
15. The facilitator submits either the atomic transaction group (fee payer present) or the client transaction alone (no fee payer) to the Algorand network.
16. Upon successful on-chain settlement, the **Facilitator Server** responds to the **Resource Server**.
17. **Resource Server** grants the **Client** access to the resource in its response.

## `PaymentRequirements` for `exact`

In addition to the standard x402 `PaymentRequirements` fields, the `exact` scheme on Algorand uses the following values. Deployments may include additional facilitator metadata inside the `extra` object when necessary:

```json
{
  "scheme": "exact",
  "network": "algorand",
  "maxAmountRequired": "1000",
  "asset": "31566704",
  "payTo": "PAYEEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "resource": "https://example.com/weather",
  "description": "Access to protected content",
  "mimeType": "application/json",
  "maxTimeoutSeconds": 60,
  "outputSchema": null,
  "extra": {
    "decimals": 6,
    "feePayer": "PAYERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
  }
}
```

- `asset`: The ASA ID (for ALGO, use "0").
- `extra.decimals`: Optional number of decimal places for the asset (defaults to 6 for ALGO).
- `extra.feePayer`: Optional public key of the account that will supply pooled fees. When omitted, the client covers transaction fees directly.

## `X-PAYMENT` Header Payload

The `X-PAYMENT` header is base64 encoded and sent in the request from the client to the resource server when paying for a resource.

Once decoded, the `X-PAYMENT` header is a JSON string with the following properties:

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "algorand",
  "payload": {
    "transaction": "AAAAAAAAAAAAA...AAAAAAAAAAAAA=",
    "feeTransaction": "BBBBBBBBBBBBB...BBBBBBBBBBBBB=" (optional, only if feePayer is used in x402 metadata)
  }
}
```

The `payload` field contains `transaction` field, the base64-encoded, serialized, signed Algorand transaction from user address to `payTo` address, with the `lease` field set by the SHA-256 hash of the `paymentRequirements`, including amount equal to `maxAmountRequired` and minimum fee (0.001 Algo, 1000 MicroAlgos).

If feePayer exists (fees payment delegated to feePayer address),the `payload` must contain `feeTransaction` field, the base64-encoded unsigned zero amount payment transaction from `feePayer`, to `feePayer`, grouped with `transaction` and with static fee equal to sum of fees on the two transactions in the group (2 x 0.001 Algo = 0.002 Algo).

## `X-PAYMENT-RESPONSE` Header Payload

The `X-PAYMENT-RESPONSE` header is base64 encoded and returned to the client from the resource server.

Once decoded, the `X-PAYMENT-RESPONSE` is a JSON string with the following properties:

```json
{
  "success": true | false,
  "transaction": "base64 encoded transaction ID",
  "network": "algorand" | "algorand-testnet",
  "payer": "base32 encoded public address of the transaction fee payer"
}
```

## Verification

Steps to verify a payment for the `exact` scheme on Algorand:

1. Verify the transaction is properly signed by the client.
2. Verify the `lease` field matches the SHA-256 hash of the `paymentRequirements`.
3. Verify the transaction type matches the asset being paid (ALGO vs. ASA).
4. Verify the transaction amount matches `paymentRequirements.maxAmountRequired`.
5. Verify the recipient address matches `paymentRequirements.payTo`.
6. Verify the transaction network round is within transaction valid round range.
7. Verify the transaction `CloseRemainderTo` for payments and `AssetCloseTo` for asset transfer, are empty.
8. Verify the transaction is for the correct asset ID when an ASA is required.
9. Verify the client has sufficient balance to cover the payment.
10. Verify the client has opted in to the ASA (if applicable).
    if fee payer is present:
11. Verify the sender and receiver address matches `extra.feePayer`.
12. Verify the fee payer transaction is unsigned, amount=0, and fee covers both transactions (2000 MicroAlgos).
13. Verify that the fee payer transaction field `CloseRemainderTo` is empty.
14. Verify both transactions share the same group ID

## Settlement

Settlement is performed by the facilitator creating an atomic transaction group:

1. **Transaction 1**: Client payment transaction

   - Amount: As specified in `paymentRequirements.maxAmountRequired`
   - Fee: 0 when a fee payer is present, otherwise the minimum Algorand fee
   - Sender: Client address
   - Receiver: `paymentRequirements.payTo`
   - Asset ID: `paymentRequirements.asset`
   - Lease: SHA-256 hash of `paymentRequirements`

2. **Transaction 2** _(optional)_: Facilitator fee-payer transaction (only if `extra.feePayer` is provided)

   - Amount: 0
   - Fee: Covers both transactions in the group
   - Sender: Fee payer address from metadata

When a fee payer is supplied the two transactions are grouped to ensure atomic settlement; otherwise the single client transaction is broadcast with its own fee.

## Replay Protection

Replay protection is part of Algorand's protocol since any transaction can be submitted only once. Once transaction is settled and on Algorand ledger it cannot be replayed.

## ASA Opt-In Requirement

Algorand requires accounts to opt in to ASAs before receiving them. This requirement can be handled in several ways:

1. **Pre-opt-in**: The resource server must opt in to the ASA before accepting payments.
2. **Opt-in verification**: The facilitator verifies that the recipient has opted in to the ASA before settling the payment.

# Scheme: `exact` on `Atto`

## Summary

The `exact` scheme on Atto uses a single native Atto `SEND` transaction to transfer a specific amount of the Atto asset from the payer to the resource server.

Atto is a feeless, account‑chain–style network optimized for high‑frequency micropayments. Instead of gas fees, senders perform a small proof‑of‑work (PoW) locally to prevent spam. This makes Atto a good fit for machine‑to‑machine use cases (AI agents, IoT devices) that need fast, cheap, and frequent payments.

This document describes how to:

* Express payment requirements for the `exact` scheme on Atto using the standard x402 `PaymentRequirements` structure.
* Encode a signed Atto `SEND` transaction in an x402 `PaymentPayload`.
* Verify and settle the payment on the Atto network.


## PaymentRequirements

The `exact` scheme on Atto uses the **standard** x402 `PaymentRequirements` shape defined in the core specification. No additional top‑level fields are introduced; any scheme‑specific metadata must go inside the `extra` object.

For Atto, a `paymentRequirements` object inside the `accepts` array has the following semantics:

* `scheme` — MUST be `"exact"`.
* `network` — Atto network identifier, for example:

  * `"atto-live"` for mainnet.
  * `"atto-beta"` for testnet.
  * `"atto-dev"` for devnet.
* `maxAmountRequired` — String representation of the required amount in **raw Atto units** (the smallest unit).
* `asset` — Identifies the asset being paid. It SHOULD be the literal string `"atto"`.
* `payTo` — Atto destination address for the payment. For example:
  * `"atto://abzekkyvhsos74rfeibubjifbjdzy3bi7habx5o3kt4ot2vcl5uhb2rcrn7hu"`.
* `resource` — URL or identifier of the protected resource.
* `description` — Human‑readable description of what is being purchased.
* `mimeType` — MIME type of the resource response (e.g. `"application/json"`).
* `outputSchema` (optional) — JSON schema describing the response body.
* `maxTimeoutSeconds` — Maximum time the resource server is willing to wait for verification/settlement before considering the payment expired.

### Example PaymentRequirements Response

```json
{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "exact",
      "network": "atto-live",
      "maxAmountRequired": "500000000",
      "asset": "atto",
      "payTo": "atto://abzekkyvhsos74rfeibubjifbjdzy3bi7habx5o3kt4ot2vcl5uhb2rcrn7hu",
      "resource": "https://api.example.com/premium-article",
      "description": "Access Premium Article (0.5 Atto)",
      "mimeType": "application/json",
      "outputSchema": null,
      "maxTimeoutSeconds": 60
    }
  ]
}
```

In this example, the client must pay **exactly** `500000000` raw units of Atto to the `payTo` address on the `atto-live` network to access the resource.

## `X-PAYMENT` header payload

The `X-PAYMENT` header is a Base64‑encoded JSON `PaymentPayload` as defined in the x402 spec. For Atto, the `payload` field wraps a serialized Atto `SEND` transaction.

At a high level:

1. The client reads the `paymentRequirements` and determines the amount:

   * `requiredAmount = paymentRequirements.maxAmountRequired`.
2. The client constructs and signs an Atto `SEND` transaction that:

   * Sends `requiredAmount` to `paymentRequirements.payTo`.
   * Uses the correct Atto network and protocol version.
3. The client serializes the transaction to a 206‑byte binary form and encodes it as Base64.
4. The client builds the x402 `PaymentPayload` JSON and Base64‑encodes that JSON to form the `X-PAYMENT` header.

### 1. Atto transaction payload

The inner Atto payment is a standard `SEND` transaction serialized into a 206‑byte structure:

| Segment | Field           | Size (bytes) | Description                                      |
| ------- | --------------- | ------------ | ------------------------------------------------ |
| Block   | Type            | 1            | Transaction type (`2` for `SEND`).               |
|         | Network         | 1            | Atto network identifier.                         |
|         | Version         | 2            | Atto protocol version.                           |
|         | Algorithm       | 1            | Signature algorithm identifier (e.g. `V1`).      |
|         | Public Key      | 32           | Sender’s public key.                             |
|         | Height          | 8            | Account height / sequence number.                |
|         | Balance         | 8            | New balance after the transfer.                  |
|         | Timestamp       | 8            | Transaction timestamp.                           |
|         | Previous        | 32           | Hash of the previous block in the account chain. |
|         | Receiver Algo   | 1            | Receiver’s algorithm identifier.                 |
|         | Receiver PubKey | 32           | Receiver’s public key (derived from `payTo`).    |
|         | Amount          | 8            | Amount being sent in raw Atto units.          |
| Auth    | Signature       | 64           | Ed25519 signature over the block contents.       |
| PoW     | Work            | 8            | Proof‑of‑work nonce.                             |
| Total   |                 | **206**      | Full serialized Atto `SEND` transaction.         |

The client serializes this structure and encodes it as a Base64 string:

```text
base64Transaction = base64(206-byte-atto-send-transaction)
```

### 2. PaymentPayload JSON

The decoded `X-PAYMENT` header MUST be a JSON object with this shape:

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "atto-live",
  "payload": {
    "transaction": "<Base64-encoded 206-byte Atto SEND transaction>"
  }
}
```

* `scheme` must be `"exact"`.
* `network` must match the selected `paymentRequirements.network`.
* `payload.transaction` is the Base64 string produced in the previous step.

### 3. HTTP header encoding

On the wire, the client sends:

```http
X-PAYMENT: <base64-encoded-PaymentPayload-JSON>
```

Where `<base64-encoded-PaymentPayload-JSON>` is the Base64 encoding of the JSON object above. Header name is case‑insensitive, but `X-PAYMENT` is RECOMMENDED.


## Verification

A facilitator or resource server verifying an Atto `exact` payment SHOULD perform at least the following steps:

1. **Decode `X-PAYMENT` header**

   * Base64‑decode the header value to obtain the `PaymentPayload` JSON.
   * Validate:

     * `x402Version === 1`
     * `scheme === "exact"`
     * `network` matches the `paymentRequirements.network`.

2. **Validate PaymentRequirements**

   * Ensure `paymentRequirements.scheme === "exact"`.
   * Ensure `paymentRequirements.network` is an Atto network the verifier supports (e.g. `"atto-live"`).
   * Confirm `maxAmountRequired`, `asset`, and `payTo` are present and well‑formed.

3. **Decode Atto transaction**

   * Read `payload.transaction` from the `PaymentPayload`.
   * Base64‑decode it to a 206‑byte buffer.
   * Parse fields according to the Atto `SEND` layout above and reject if:

     * Length ≠ 206 bytes.
     * The `Type` field is not `SEND`.
     * Network / version fields are not recognized.

4. **Signature verification**

   * Recompute the block hash per Atto’s rules.
   * Verify the Ed25519 signature using the `Public Key` field.
   * Reject if signature verification fails.

5. **Proof‑of‑Work verification**

   * Derive the PoW target/difficulty from network configuration.
   * Verify the `Work` field meets the required difficulty.
   * Reject if PoW is insufficient.

6. **Replay protection**

   * Check that:
     * `Height` is strictly greater than the last confirmed height for the account.
     * `Timestamp` is within an acceptable window (to prevent very old or far‑future transactions).
     * `Hash` does NOT exist in a persistent store (e.g., database).
   * These checks MUST take place, node transaction publishing is idempotent!

7. **Recipient & asset checks**

   * Derive the expected receiver public key from `paymentRequirements.payTo` using Atto address rules.
   * Confirm the transaction’s `Receiver PubKey` matches this derived key.
   * Confirm `asset` in `paymentRequirements` is `"atto"` (or another Atto asset the verifier explicitly supports).

8. **Amount validation**

   * Interpret the transaction’s `Amount` field as an unsigned long in raw Atto units (`txAmount`).
   * Interpret `paymentRequirements.maxAmountRequired` as `requiredAmount`.
   * Check that `txAmount == requiredAmount`.

If all checks pass, the payment is valid for the selected `paymentRequirements`.

## Settlement

Once a payment has been verified:

1. **Broadcast**

   * The facilitator or resource server submits the validated `SEND` transaction to an Atto node.

2. **Consensus**

   * The transaction is incorporated into Atto’s consensus (e.g., via Open Representative Voting).

3. **Finality**

   * After confirmation, the `SEND` is final and cannot be reversed. Atto is designed for sub‑second deterministic finality.

4. **Receiving wallet handling (optional)**

   * Atto requires a corresponding `RECEIVE` block to update the receiver’s balance.
   * From the perspective of x402 and this scheme, the payment is considered **settled** once the `SEND` block is confirmed on-chain; a later `RECEIVE` block is required to make the amount spendable, but is optional from the payment perspective.

## Appendix: Example

Below is a complete example showing a client paying for a JSON API response with Atto using the `exact` scheme.

### Example PaymentRequirementsResponse

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "atto-live",
      "maxAmountRequired": "500000000",
      "asset": "atto",
      "payTo": "atto://aabaeaqcaibaeaqcaibaeaqcaibaeaqcaibaeaqcaibaeaqcaibaevjhdj47s",
      "resource": "https://api.example.com/premium-article",
      "description": "Access Premium Article (0.5 Atto)",
      "mimeType": "application/json",
      "outputSchema": null,
      "maxTimeoutSeconds": 60,
      "extra": null
    }
  ]
}
```

### Example PaymentPayload (decoded `X-PAYMENT`)

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "atto-live",
  "payload": {
    "transaction": "BASE64_ENCODED_ATTO_SEND_TX=="
  }
}
```

The client sends:

```http
X-PAYMENT: eyJ4NDAyVmVyc2lvbiI6MSwic2NoZW1lIjoiZXhhY3QiLCJuZXR3b3JrIjoiYXR0by1saXZlIiwicGF5bG9hZCI6eyJ0cmFuc2FjdGlvbiI6IkJBU0U2NF9FTkNPREVERF9BVFRPX1NFTkRfVFhfLi4uPSJ9fQ==
```

Where the header value is the Base64 encoding of the `PaymentPayload` JSON above.


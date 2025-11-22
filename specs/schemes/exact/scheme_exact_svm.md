# Exact Payment Scheme for Solana Virtual Machine (SVM) (`exact`)

This document specifies the `exact` payment scheme for the x402 protocol on Solana.

This scheme facilitates payments of a specific amount of an SPL token on the Solana blockchain.

## Scheme Name

`exact`

## Protocol Flow

The protocol flow for `exact` on Solana is client-driven.

1.  **Client** makes an HTTP request to a **Resource Server**.
2.  **Resource Server** responds with a `402 Payment Required` status. The response body contains the `paymentRequirements` for the `exact` scheme. Critically, the `extra` field in the requirements contains a **feePayer** which is the public address of the identity that will pay the fee for the transaction. This will typically be the facilitator.
3.  **Client** creates a transaction that contains a transfer of an asset to the resource server's wallet address for a specified amount.
4.  **Client** signs the transaction with their wallet. This results in a partially signed transaction (since the signature of the facilitator that will sponsor the transaction is still missing).
5.  **Client** serializes the partially signed transaction and encodes it as a Base64 string.
6.  **Client** sends a new HTTP request to the resource server with the `X-PAYMENT` header containing the Base64-encoded partially-signed transaction payload.
7.  **Resource Server** receives the request and forwards the `X-PAYMENT` header and `paymentRequirements` to a **Facilitator Server's** `/verify` endpoint.
8.  **Facilitator** decodes and deserializes the proposed transaction.
9.  **Facilitator** inspects the transaction to ensure it is valid and only contains the expected payment instruction.
10. **Facilitator** returns a response to the **Resource Server** verifying the **client** transaction.
11. **Resource Server**, upon successful verification, forwards the payload to the facilitator's `/settle` endpoint.
12. **Facilitator Server** provides its final signature as the `feePayer` and submits the now fully-signed transaction to the Solana network.
13. Upon successful on-chain settlement, the **Facilitator Server** responds to the **Resource Server**.
14. **Resource Server** grants the **Client** access to the resource in its response.

## `PaymentRequirements` for `exact`

In addition to the standard x402 `PaymentRequirements` fields, the `exact` scheme on Solana requires the following inside the `extra` field:

```json
{
  "scheme": "exact",
  "network": "solana",
  "maxAmountRequired": "1000",
  "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "payTo": "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4",
  "resource": "https://example.com/weather",
  "description": "Access to protected content",
  "mimeType": "application/json",
  "maxTimeoutSeconds": 60,
  "outputSchema": null,
  "extra": {
    "feePayer": "EwWqGE4ZFKLofuestmU4LDdK7XM1N4ALgdZccwYugwGd"
  }
}
```

- `asset`: The public key of the token mint.
- `extra.feePayer`: The public key of the account that will pay for the transaction fees. This is typically the facilitator's public key.

## `X-PAYMENT` Header Payload

The `X-PAYMENT` header is base64 encoded and sent in the request from the client to the resource server when paying for a resource.

Once decoded, the `X-PAYMENT` header is a JSON string with the following properties:

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "solana",
  "payload": {
    "transaction": "AAAAAAAAAAAAA...AAAAAAAAAAAAA="
  }
}
```

The `payload` field contains the base64-encoded, serialized, **partially-signed** versioned Solana transaction.

## `X-PAYMENT-RESPONSE` Header Payload

The `X-PAYMENT-RESPONSE` header is base64 encoded and returned to the client from the resource server.

Once decoded, the `X-PAYMENT-RESPONSE` is a JSON string with the following properties:

```json
{
  "success": true | false,
  "transaction": "base58 encoded transaction signature",
  "network": "solana" | "solana-devnet",
  "payer": "base58 encoded public address of the transaction fee payer"
}
```

## Facilitator Verification Rules (MUST)

A facilitator verifying an `exact`-scheme SVM payment MUST enforce all of the following checks before sponsoring and signing the transaction:

1. Instruction layout

- The decompiled transaction MUST contain 3 instructions in this exact order:
  1. Compute Budget: Set Compute Unit Limit
  2. Compute Budget: Set Compute Unit Price
  4. SPL Token or Token-2022 TransferChecked

2. Fee payer (facilitator) safety

- The configured fee payer address MUST NOT appear in the `accounts` of any instruction in the transaction.
- The fee payer MUST NOT be the `authority` for the TransferChecked instruction.
- The fee payer MUST NOT be the `source` of the transferred funds.

3. Compute budget validity

- The program for instructions (1) and (2) MUST be `ComputeBudget` with the correct discriminators (2 = SetLimit, 3 = SetPrice).
- The compute unit price MUST be bounded to prevent gas abuse. The reference implementation enforces ≤ 5 lamports per compute unit.

4. Transfer intent and destination

- The TransferChecked program MUST be either `spl-token` or `token-2022`.
- Destination MUST equal the Associated Token Account PDA for `(owner = payTo, mint = asset)` under the selected token program.

5. Account existence

- The `source` ATA MUST exist.
- The destination ATA MUST exist if and only if the Create ATA instruction is NOT present in the transaction. If Create ATA is present, the destination ATA MAY be absent prior to execution.

6. Amount

- The `amount` in TransferChecked MUST equal `maxAmountRequired` exactly.

These checks are security-critical to ensure the fee payer cannot be tricked into transferring their own funds or sponsoring unintended actions. Implementations MAY introduce stricter limits (e.g., lower compute price caps) but MUST NOT relax the above constraints.

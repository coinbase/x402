# Exact Payment Scheme for Solana Virtual Machine (SVM) (`exact`)

This document specifies the `exact` payment scheme for the x402 protocol on Solana.

This scheme facilitates payments of a specific amount of an SPL token on the Solana blockchain.

## Scheme Name

`exact`

## Protocol Flow

The protocol flow for `exact` on Solana is client-driven. 

1.  **Client** makes an HTTP request to a **Resource Server**.
2.  **Resource Server** responds with a `402 Payment Required` status. The response body contains the `paymentRequirements` for the `exact` scheme. Critically, the `extra` field in the requirements contains a **feePayer** which is the public address of the identity that will pay the fee for the transaction. This will typically be the facilitator.
3. **Client** creates a transaction that contains a transfer of an asset to the resource server's wallet address for a specified amount.
4.  **Client** signs the transaction with their wallet. This results in a partially signed transaction (since the signature of the facilitator that will sponsor the transaction is still missing).
5.  **Client** serializes the partially signed transaction and encodes it as a Base64 string.
6.  **Client** sends a new HTTP request to the resource server with the `X-PAYMENT` header containing the Base64-encoded partially-signed transaction payload.
7.  **Resource Server** receives the request and forwards the `X-PAYMENT` header and `paymentRequirements` to a **Facilitator Server's** `/verify` endpoint.
8.  **Facilitator** decodes and deserializes the proposed transaction.
9.  **Facilitator** inspects the transaction to ensure it is valid and only contains the expected payment instruction.
10.  **Facilitator** returns a response to the **Resource Server** verifying the **client**  transaction.
11. **Resource Server**, upon successful verification, forwards the payload to the facilitator's `/settle` endpoint.
12. **Facilitator Server** provides its final signature as the `feePayer` and submits the now fully-signed transaction to the Solana network.
13. Upon successful on-chain settlement, the **Facilitator Server** responds to the **Resource Server**.
14. **Resource Server** grants the **Client** access to the resource in its response.


## `PaymentRequirements` for `exact`

In addition to the standard x402 `PaymentRequirements` fields, the `exact` scheme on Solana requires the following inside the `extra` field:

```json
{
  "scheme": "exact",
  "network": "solana-mainnet",
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

-   `asset`: The public key of the token mint.
-   `extra.feePayer`: The public key of the account that will pay for the transaction fees. This is typically the facilitator's public key.


## `X-PAYMENT` Header Payload

The `X-PAYMENT` header is base64 encoded and sent in the request from the client to the resource server when paying for a resource. 

Once decoded, the `X-PAYMENT` header is a JSON string with the following properties:

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "solana-mainnet",
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
  "network": "solana-mainnet" | "solana-devnet",
  "payer": "base58 encoded public address of the transaction fee payer"
}
```
# Scheme: exact on Cardano

## Summary

This document specifies the `exact` payment scheme for the x402 protocol on Cardano.

This scheme facilitates payments of Cardano Native Tokens to a Cardano Wallet or a Smart Contract.

## Protocol Flow

The protocol flow for `exact` on Cardano is server-driven. 

1.  **Client** makes an HTTP request to a **Resource Server**.
2.  **Resource Server** responds with a `402 Payment Required` status. The response body contains the finalised transaction body.
3.  **Client** signs the transaction body with their wallet.
6.  **Client** sends a new HTTP request to the resource server with the `X-PAYMENT` header containing the Base64-encoded partially-signed transaction payload.
7.  **Resource Server** receives the request and forwards the `X-PAYMENT` header and `paymentRequirements` to a **Facilitator Server's** `/verify` endpoint.
9.  **Facilitator** inspects the transaction to ensure it is valid and only contains the expected payment instruction.
10.  **Facilitator** returns a response to the **Resource Server** verifying the **client**  transaction.
11. **Resource Server**, upon successful verification, forwards the payload to the facilitator's `/settle` endpoint.
12. **Facilitator Server** provides its final signature as the `feePayer` and submits the now fully-signed transaction to the Solana network.
13. Upon successful on-chain settlement, the **Facilitator Server** responds to the **Resource Server**.
14. **Resource Server** grants the **Client** access to the resource in its response.

## `X-PAYMENT` Header Payload

The `X-PAYMENT` header is base64 encoded and sent in the request from the client to the resource server when paying for a resource. 

Once decoded, the `X-PAYMENT` header is a JSON string with the following properties:

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "cardano",
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

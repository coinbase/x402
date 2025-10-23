# Scheme: exact on Cardano

## Summary

This document specifies the `exact` payment scheme for the x402 protocol on Cardano.

This scheme facilitates payments of Cardano Native Tokens to a Cardano Wallet or a Smart Contract.

## Protocol Flow

The protocol flow for `exact` on Cardano is server-driven. 

1.  **Client** makes an HTTP request to a **Resource Server**.
3.  **Resource Server** responds with a `402 Payment Required` status. Detiling the Paymsnt Information and specifying which information is still required from the client to create a transaction.
4.  **Client** responds with required information.
5.  **Ressource Server** sends information to Facilitator.
6. **Facilitator** checks validity, constructs transaction body & returns it to Ressource Server.
8.  **Ressource Server** forwards transaction body to client.
9.  **Client** signs the transaction body with their wallet.
11.  **Client** sends a new HTTP request to the resource server with the `X-PAYMENT` header containing signed transaction payload.
12.  **Resource Server** receives the request and forwards the `X-PAYMENT` header and `paymentRequirements` to a **Facilitator Server's** `/verify` endpoint.
13.  **Facilitator** checks that only the required assets are being moved in the transaction & submits transction.
15. Upon successful on-chain settlement, the **Facilitator Server** responds to the **Resource Server**.
16. **Resource Server** grants the **Client** access to the resource in its response.

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

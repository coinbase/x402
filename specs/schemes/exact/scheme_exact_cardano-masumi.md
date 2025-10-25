# Scheme: exact on Cardano-Masumi

## Summary

This document specifies the `exact` payment scheme for the x402 protocol on Cardano. This scheme facilitates payments of Cardano Native Tokens. It utilizes the Masumi Smart Protocol, which offers additional refund mechanics & decision logging mechanisms in a decentralized way.

## Protocol Flow

The protocol flow for `exact` on Cardano is client-driven. 

1.  **Client** makes an HTTP request to a **Resource Server**.
2.  **Resource Server** responds with a `402 Payment Required` status. Detailing the Payment Information 
3.  **Client** constructs transaction body & returns it to Ressource Server.
4.  **Resource Server** receives the request and forwards the `X-PAYMENT` header and `paymentRequirements` to a **Facilitator's** `/verify` endpoint to check if the transaction is valid.
5.  **Facilitator** confirms, then **Resource Server** sends the request to the **Facilitator** `/settle` endpoint.
6.  **Facilitator** submits the transaction.
7. Upon successful on-chain settlement, the **Facilitator** responds to the **Resource Server**.
8. **Resource Server** grants the **Client** access to the resource in its response.

## Expanded `PaymentRequirementsResponse` Schema

The PaymentRequirementsResponse has been expanded with fields in "extra" and needs to return information that is required to create a valid Masumi Smart Contract interaction.

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "cardano-masumi",
      "maxAmountRequired": "10000",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "resource": "https://api.example.com/premium-data",
      "description": "Access to premium market data",
      "mimeType": "application/json",
      "outputSchema": null,
      "maxTimeoutSeconds": 60,
      "extra": {
        "identifierFromPurchaser": "aabbaabb11221122aabb",
        "network": "Mainnet | Preprod",
        "sellerVkey": "sdasdqweqwewewewqe",
        "paymentType": "Web3CardanoV1",
        "blockchainIdentifier": "blockchain_identifier",
        "payByTime": "1713626260",
        "submitResultTime": "1713636260",
        "unlockTime": "1713636260",
        "externalDisputeUnlockTime": "1713636260",
        "agentIdentifier": "agent_identifier",
        "inputHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
      }
    }
  ]
}
```


## `X-PAYMENT` Header Payload

The X-PAYMENT header is base64 encoded and sent in the request from the client to the resource server when paying for a resource.

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "cardano",
  "payload": {
    "identifierFromPurchaser": "aabbaabb11221122aabb",
    "network": "Mainnet | Preprod",
    "sellerVkey": "sdasdqweqwewewewqe",
    "paymentType": "Web3CardanoV1",
    "blockchainIdentifier": "blockchain_identifier",
    "payByTime": "1713626260",
    "submitResultTime": "1713636260",
    "unlockTime": "1713636260",
    "externalDisputeUnlockTime": "1713636260",
    "agentIdentifier": "agent_identifier",
    "inputHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
  }
}
```


## `X-PAYMENT-RESPONSE` Header Payload

The `X-PAYMENT-RESPONSE` header is base64 encoded and returned to the client from the resource server.

Once decoded, the `X-PAYMENT-RESPONSE` is a JSON string with the following properties:

```json
{
  "success": "true | false",
  "network": "cardano",
  "type": "masumi | direct"
}
```

# Exact Payment Scheme for Solana Virtual Machine (SVM) (`exact`)

This document specifies the `exact` payment scheme for the x402 protocol on Solana.

This scheme facilitates payments of a specific amount of an SPL token on the Solana blockchain.

## Scheme Name

`exact`

## Protocol Flow

The protocol flow for `exact` on Solana is a facilitator-led flow. 

The server/facilitator proposes a transaction, which the client then signs to authorize payment.

The client sends the partially signed tx to the server/facilitator to then sign and broadcast to the network.

1.  **Client** makes an HTTP request to a **Resource Server**.
2.  **Resource Server** responds with a `402 Payment Required` status. The response body contains the `paymentRequirements` for the `exact` scheme. Critically, the `extra` field in the requirements contains a **proposed, unsigned, Base64-encoded transaction**.
3.  **Client** decodes and deserializes the proposed transaction.
4.  **Client** inspects the transaction to ensure it is valid and only contains the expected payment instruction.
5.  **Client** signs the transaction with their wallet. This results in a partially signed transaction (since the facilitator's fee payer signature is still missing).
6.  **Client** serializes the partially signed transaction and encodes it as a Base64 string.
7.  **Client** sends a new HTTP request to the resource server with the `X-PAYMENT` header containing the Base64-encoded partially-signed transaction payload.
8.  **Resource Server** receives the request and forwards the `X-PAYMENT` header and `paymentRequirements` to a **Facilitator Server's** `/verify` endpoint.
9.  **Facilitator Server** verifies that the client has correctly signed the transaction it originally proposed.
10. **Resource Server**, upon successful verification, forwards the payload to the facilitator's `/settle` endpoint.
11. **Facilitator Server** provides its final signature as the `feePayer` and submits the now fully-signed transaction to the Solana network.
12. Upon successful on-chain settlement, the **Facilitator Server** responds to the **Resource Server**.
13. **Resource Server** grants the **Client** access to the resource.

## `paymentRequirements` for `exact`

In addition to the standard x402 `paymentRequirements` fields, the `exact` scheme on Solana requires the following inside the `extra` field:

```json
{
  "scheme": "exact",
  "network": "solana-mainnet",
  "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "payTo": "B...",
  "extra": {
    "transaction": "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC...",
    "feePayer": "C..."
  }
}
```

-   `asset`: The public key of the SPL token mint.
-   `extra.transaction`: A Base64-encoded, serialized `VersionedTransaction` proposed by the facilitator. This transaction is unsigned.
-   `extra.feePayer`: The public key of the account that will pay for the transaction fees. This is the facilitator's public key.

## `X-PAYMENT` Header Payload

The `X-PAYMENT` header for the `exact` scheme contains a JSON object with the following structure. The `payload` field contains the Base64-encoded, serialized, **partially-signed** versioned Solana transaction.

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "solana-mainnet",
  "payload": "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC..."
}
```

## Client Responsibilities
-   **Verification**:
    -   Must decode the `extra.transaction` from the `paymentRequirements`.
    -   Must perform **strict transaction introspection** to ensure it only contains the expected SPL token transfer.
    -   The client MUST verify the `source`, `destination`, `amount`, and `feePayer` fields match their expectations before signing. Blindly signing transactions proposed by a server is dangerous.

## Facilitator Responsibilities

-   **Transaction Proposal**:
    -   The facilitator (or resource server) is responsible for constructing the initial, unsigned transaction. This includes fetching a recent blockhash.
-   **Verification (`/verify`)**:
    -   Must decode the `payload` and deserialize it into a `VersionedTransaction`.
    -   Must verify that the client has signed the transaction.
    -   Must ensure the transaction in the payload is identical to the one it originally proposed in the `paymentRequirements`, except for the client's new signature.
-   **Settlement (`/settle`)**:
    -   Must sign the transaction with its `feePayer` keypair.
    -   Must serialize and submit the fully signed transaction to the network.
    -   Must handle potential submission errors, including blockhash expiration (by restarting the flow, as the originally proposed transaction is now invalid). 
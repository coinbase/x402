# Exact Payment Scheme for Hedera Hashgraph (`exact`)

This document specifies the `exact` payment scheme for the x402 protocol on Hedera Hashgraph.

This scheme facilitates payments of a specific amount of HBAR or HTS tokens on the Hedera network.

## Scheme Name

`exact`

## Protocol Flow

The protocol flow for `exact` on Hedera is client-driven, similar to Solana implementation.

1. **Client** makes an HTTP request to a **Resource Server**.
2. **Resource Server** responds with a `402 Payment Required` status. The response body contains the `paymentRequirements` for the `exact` scheme. The `extra` field in the requirements contains a **feePayer** which is the account ID of the identity that will pay the transaction fees. This will typically be the facilitator.
3. **Client** creates a transaction that contains a transfer of HBAR or HTS tokens to the resource server's account ID for a specified amount.
4. **Client** partially signs the transaction with their private key. The facilitator signature is still missing.
5. **Client** serializes the partially signed transaction and encodes it as a Base64 string.
6. **Client** sends a new HTTP request to the resource server with the `X-PAYMENT` header containing the Base64-encoded partially-signed transaction payload.
7. **Resource Server** receives the request and forwards the `X-PAYMENT` header and `paymentRequirements` to a **Facilitator Server's** `/verify` endpoint.
8. **Facilitator** decodes and deserializes the proposed transaction.
9. **Facilitator** inspects the transaction to ensure it is valid and only contains the expected payment instruction.
10. **Facilitator** returns a response to the **Resource Server** verifying the **client** transaction.
11. **Resource Server**, upon successful verification, forwards the payload to the facilitator's `/settle` endpoint.
12. **Facilitator Server** provides its signature as the additional signer and submits the fully-signed transaction to the Hedera network.
13. Upon successful on-chain settlement, the **Facilitator Server** responds to the **Resource Server**.
14. **Resource Server** grants the **Client** access to the resource in its response.

## `PaymentRequirements` for `exact`

In addition to the standard x402 `PaymentRequirements` fields, the `exact` scheme on Hedera requires the following inside the `extra` field:

```json
{
  "scheme": "exact",
  "network": "hedera-mainnet",
  "maxAmountRequired": "100000000",
  "asset": "0.0.0",
  "payTo": "0.0.12345",
  "resource": "https://example.com/weather",
  "description": "Access to protected content",
  "mimeType": "application/json",
  "maxTimeoutSeconds": 60,
  "outputSchema": null,
  "extra": {
    "feePayer": "0.0.98765"
  }
}
```

- `asset`: The token ID for HTS tokens or "0.0.0" for HBAR.
- `payTo`: The Hedera account ID to receive the payment (format: shard.realm.account).
- `extra.feePayer`: The account ID that will pay for the transaction fees. This is typically the facilitator's account ID.

## `X-PAYMENT` Header Payload

The `X-PAYMENT` header is base64 encoded and sent in the request from the client to the resource server when paying for a resource.

Once decoded, the `X-PAYMENT` header is a JSON string with the following properties:

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "hedera-mainnet",
  "payload": {
    "transaction": "AAAAAAAAAAAAA...AAAAAAAAAAAAA="
  }
}
```

The `payload` field contains the base64-encoded, serialized, **partially-signed** Hedera transaction.

## `X-PAYMENT-RESPONSE` Header Payload

The `X-PAYMENT-RESPONSE` header is base64 encoded and returned to the client from the resource server.

Once decoded, the `X-PAYMENT-RESPONSE` is a JSON string with the following properties:

```json
{
  "success": true | false,
  "transaction": "0.0.12345@1234567890.123456789",
  "network": "hedera-mainnet" | "hedera-testnet",
  "payer": "0.0.98765"
}
```

## Implementation Notes

### Transaction Types
- **HBAR Transfers**: Use `TransferTransaction` for native HBAR payments
- **Token Transfers**: Use `TokenTransferTransaction` for HTS token payments

### Account ID Format
Hedera uses the format `shard.realm.account` (e.g., `0.0.12345`) for account identifiers.

### Transaction Serialization
Hedera transactions are serialized using the SDK's `toBytes()` method and encoded as Base64 for transmission.

### Fee Sponsorship
The facilitator acts as an additional signer to sponsor transaction fees, similar to how Solana's fee payer works.

### Network Support
- `hedera-testnet`: Hedera Testnet
- `hedera-mainnet`: Hedera Mainnet

### Error Handling
Hedera-specific error codes include:
- `invalid_exact_hedera_payload_transaction_amount_mismatch`
- `invalid_exact_hedera_payload_transaction_recipient_mismatch` 
- `invalid_exact_hedera_payload_transaction_asset_mismatch`
- `settle_exact_hedera_transaction_failed`
- `settle_exact_hedera_transaction_confirmation_timeout`
# Scheme: `exact` on `Aptos`

## Summary

The `exact` scheme on Aptos transfers a specific amount of a fungible asset (such as APT or stablecoins like USDC) from the payer to the resource server using the Aptos fungible asset transfer function (`0x1::primary_fungible_store::transfer`). The approach requires the payer to construct a complete signed transaction ensuring that the facilitator cannot alter the transaction or redirect funds to any address other than the one specified by the resource server in paymentRequirements.

**Version Support:** This specification supports x402 v2 protocol only.

**Current Implementation:** Uses the standard Aptos account transfer function for simplicity.

## Protocol Sequencing

The following sequence outlines the flow of the `exact` scheme on Aptos:

1. Client makes a request to a `resource server` and receives a `402 Payment Required` response.
2. If the server/facilitator supports sponsorship and the client wants to make use of sponsorship, it can make a request to the provided sponsorship service (gas station) to construct a sponsored transaction.
3. Client constructs and signs a transaction to be used as payment, transferring the fungible asset to the resource server's address.
4. Client serializes the signed transaction using BCS (Binary Canonical Serialization) and encodes it as Base64.
5. Client resends the request to the `resource server` including the payment in the `X-PAYMENT` header.
6. `resource server` passes the payment payload to the `facilitator` for verification.
7. `facilitator` validates the transaction structure, signature, and payment details.
8. `resource server` does the work to fulfill the request.
9. `resource server` requests settlement from the `facilitator`.
10. If sponsorship was used, the `facilitator` provides its signature as the fee payer before submission.
11. `facilitator` submits the transaction to the `Aptos` network for execution and reports back to the `resource server` the result of the transaction.
12. `resource server` returns the response to the client.

## Network Format

X402 v2 uses CAIP-2 format for network identifiers:

- **Mainnet:** `aptos:1` (CAIP-2 format using Aptos chain ID 1)
- **Testnet:** `aptos:2` (CAIP-2 format using Aptos chain ID 2)

## `PaymentRequirements` for `exact`

In addition to the standard x402 `PaymentRequirements` fields, the `exact` scheme on Aptos requires the following:

```json
{
  "scheme": "exact",
  "network": "aptos:1",
  "amount": "1000000",
  "asset": "0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b",
  "payTo": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  "maxTimeoutSeconds": 60,
  "extra": {
    "gasStation": "https://facilitator.example.com/gas-station"
  }
}
```

### Field Descriptions

- `scheme`: Always `"exact"` for this scheme
- `network`: CAIP-2 network identifier - `aptos:1` (mainnet) or `aptos:2` (testnet)
- `amount`: The exact amount to transfer in atomic units (e.g., `"1000000"` = 1 APT)
- `asset`: The metadata address of the fungible asset (e.g., USDC on Aptos mainnet: `0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b`)
- `payTo`: The recipient address (32-byte hex string with `0x` prefix)
- `maxTimeoutSeconds`: Maximum time in seconds before the payment expires
- `extra.gasStation`: (Optional) URL of the gas station endpoint for sponsored transactions

## `X-PAYMENT` Header Payload

The client constructs the payment payload and includes it in the `X-PAYMENT` header. The payload structure follows x402 v2 format:

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://example.com/weather",
    "description": "Access to protected content",
    "mimeType": "application/json"
  },
  "accepted": {
    "scheme": "exact",
    "network": "aptos:1",
    "amount": "1000000",
    "asset": "0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b",
    "payTo": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    "maxTimeoutSeconds": 60
  },
  "payload": {
    "transaction": "AQDy8fLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vIC..."
  }
}
```

### Field Descriptions

- `x402Version`: Always `2` for this specification
- `resource`: Information about the protected resource being accessed
  - `url`: The protected resource URL
  - `description`: Human-readable description of the resource
  - `mimeType`: Expected MIME type of the resource response
- `accepted`: The `PaymentRequirements` that the client is fulfilling with this payment
- `payload.transaction`: Base64 encoded BCS-serialized signed Aptos transaction (includes the signature embedded within the transaction structure)

## Verification

Steps to verify a payment for the `exact` scheme:

1. **Extract requirements**: Use `payload.accepted` to get the payment requirements being fulfilled.
2. Verify `x402Version` is `2`.
3. Verify the network matches the agreed upon chain (CAIP-2 format: `aptos:1` or `aptos:2`).
4. Deserialize the BCS-encoded transaction and verify the signature is valid.
5. Verify the transaction sender has sufficient balance of the `asset` to cover the required amount.
6. Verify the transaction contains a fungible asset transfer operation (`0x1::primary_fungible_store::transfer`).
7. Verify the transfer is for the correct asset (matching `requirements.asset`).
8. Verify the transfer amount matches `requirements.amount`.
9. Verify the transfer recipient matches `requirements.payTo`.
10. Simulate the transaction using the Aptos REST API to ensure it would succeed and has not already been executed/committed to the chain.
11. Verify the transaction has not expired (check sequence number and expiration timestamp). Note: A buffer time should be considered to account for network propagation delays and processing time.

## Settlement

Settlement is performed via the facilitator submitting the transaction to the Aptos network for execution.

### For Non-Sponsored Transactions:

- The facilitator submits the fully-signed transaction directly to the network.

### For Sponsored Transactions:

1. The facilitator adds its signature as the fee payer sponsor (the facilitator must be the designated sponsor in the transaction).
2. The facilitator submits the fee payer transaction with the client as the sender and the facilitator as the sponsor to the network.

The settlement response includes the transaction hash which can be used to track the transaction on-chain.

## `X-PAYMENT-RESPONSE` Header Payload

The `X-PAYMENT-RESPONSE` header is base64 encoded and returned to the client from the resource server.

Once decoded, the `X-PAYMENT-RESPONSE` is a JSON string with the following properties:

```json
{
  "success": true,
  "transaction": "0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890",
  "network": "aptos:1",
  "version": "12345678"
}
```

- `transaction`: The transaction hash
- `version`: The transaction version number (ledger version)

## Appendix

### Sponsored Transactions

Aptos supports sponsored (gasless) transactions via an interactive transaction construction protocol with a gas station. If a facilitator supports sponsoring of transactions, it should communicate this to the client by providing a URL via the `paymentRequirements.extra.gasStation` field.

#### Sponsored Transaction Flow:

1. Client makes request and gets 402 response from the service.
2. Client constructs a transaction payload to transfer the fungible asset to the resource server.
3. Client sends the transaction payload to the gas station at `paymentRequirements.extra.gasStation`.
4. Gas station constructs a fee payer transaction and returns it to the client.
5. Client signs the transaction as the primary sender.
6. Client sends the signed transaction along with its request, with `sponsored: true` in the payload.
7. When the facilitator goes to settle the transaction, it recognizes it as the sponsor and provides its own signature as the fee payer before broadcasting to the network for execution.

### Transaction Structure

Aptos transactions consist of:

- **Sender**: The account initiating the transaction (the payer in our case)
- **Sequence Number**: Incremental counter for the sender's account
- **Payload**: The operation to execute (fungible asset transfer)
- **Max Gas Amount**: Maximum gas units willing to spend
- **Gas Unit Price**: Price per gas unit
- **Expiration Timestamp**: When the transaction expires
- **Chain ID**: Identifier for the network

For sponsored transactions, an additional **Fee Payer** field is included, designating the account that will pay for gas.

### Fungible Asset Transfer

The payment transaction uses the Aptos Fungible Asset framework, specifically the `primary_fungible_store::transfer` function:

```move
public entry fun transfer<T: key>(
    sender: &signer,
    from: Object<T>,
    to: address,
    amount: u64,
)
```

Where:

- `from`: The fungible asset metadata object (e.g., USDC metadata address)
- `to`: The resource server's address
- `amount`: The exact amount specified in `paymentRequirements.amount`

### Signature Schemes

Aptos supports:

- **Ed25519**: Single signature scheme (most common)
- **MultiEd25519**: Multi-signature scheme for accounts requiring multiple signatures
- **SingleKey**: Single signature scheme for accounts with a single key, either Ed25519, Secp256k1, or Secp256r1
- **MultiKey**: Multi-signature scheme for accounts with multiple keys, either Ed25519, Secp256k1, or Secp256r1

The facilitator must verify signatures according to the sender's authentication key and signature scheme.

**Note**: Additional signature schemes (such as Secp256k1 and other types) may need to be supported in future implementations as Aptos adds new authentication methods.

### BCS Serialization

All Aptos transactions are serialized using BCS (Binary Canonical Serialization) before being transmitted. The TypeScript SDK provides utilities for:

- Serializing transaction payloads
- Deserializing received transactions
- Encoding/decoding to/from Base64

### Network Identifiers

CAIP-2 format is used for network identifiers:

- `aptos:1`: Mainnet (Chain ID: 1)
- `aptos:2`: Testnet (Chain ID: 2)

### Account Addresses

Aptos account addresses are 32-byte hex strings, represented with a `0x` prefix. All addresses in the x402 protocol must use the long form (64 hex characters) for consistency and ease of validation.

Example: `0x0000000000000000000000000000000000000000000000000000000000000001` (64 hex characters)

## Recommendation

- Use the spec defined above and only support payments of specific amounts.
- Support both non-sponsored (client pays gas) and sponsored (facilitator pays gas) transaction modes.
- For sponsored transactions, implement the gas station protocol to enable gasless payments for clients.
- Leverage the Aptos TypeScript SDK for transaction construction, serialization, and simulation.
- Future versions could explore deferred settlement patterns or usage-based payments if Aptos introduces new primitives that enable such flows.

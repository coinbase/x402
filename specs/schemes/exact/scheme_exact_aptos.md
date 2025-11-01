# Scheme: `exact` on `Aptos`

## Summary

The `exact` scheme on Aptos transfers a specific amount of APT (Aptos Coin) from the payer to the resource server using the standard Aptos transfer function (`0x1::aptos_account::transfer`). The approach requires the payer to form a complete signed transaction which results in the facilitator having no ability to adjust the transaction and direct funds anywhere but the address specified by the resource server in paymentRequirements.

**Current Implementation:** Uses the standard Aptos account transfer function for simplicity.

**Future Enhancement:** Will be upgraded to use a custom x402 payment contract (similar to Sui's implementation) that:
1. Validates the exact payment amount matches the requirement
2. Emits a `PaymentMade` event containing an invoice ID, amount, recipient, and asset
3. Transfers the fungible asset from payer to recipient

The contract-based approach will ensure payments can be uniquely identified and verified on-chain through the invoice ID, preventing confusion between x402 payments and regular transfers.

## Protocol Sequencing

The following outlines the flow of the `exact` scheme on `Aptos`:

1. Client makes a request to a `resource server` and gets back a `402 Payment Required` response.
2. If the server/facilitator supports sponsorship, and the client wants to make use of sponsorship, it can make a request to the provided sponsorship service (gas station) to construct a sponsored transaction.
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

## `PaymentRequirements` for `exact`

In addition to the standard x402 `PaymentRequirements` fields, the `exact` scheme on Aptos requires the following:

```json
{
  "scheme": "exact",
  "network": "aptos-mainnet",
  "maxAmountRequired": "1000000",
  "asset": "0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b",
  "payTo": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  "resource": "https://example.com/weather",
  "description": "Access to protected content",
  "mimeType": "application/json",
  "maxTimeoutSeconds": 60,
  "outputSchema": null,
  "extra": {
    "gasStation": "https://facilitator.example.com/gas-station"
  }
}
```

- `asset`: The metadata address of the fungible asset (e.g., USDC on Aptos mainnet: `0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b`)
- `network`: One of `aptos-mainnet`, `aptos-testnet`, or `aptos-devnet`
- `extra.gasStation`: (Optional) URL of the gas station endpoint for sponsored transactions

## `X-PAYMENT` Header Payload

The `payload` field of the `X-PAYMENT` header must contain the following fields:

- `transaction`: The Base64 encoded BCS-serialized signed Aptos transaction (includes the signature embedded within the transaction structure).

Example:

```json
{
  "transaction": "AQDy8fLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vIC..."
}
```

Full `X-PAYMENT` header:

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "aptos-mainnet",
  "payload": {
    "transaction": "AQDy8fLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vIC..."
  }
}
```

## Verification

Steps to verify a payment for the `exact` scheme:

1. Verify the network is for the agreed upon chain.
2. Deserialize the BCS-encoded transaction and verify the signature is valid.
3. Verify the transaction sender has sufficient balance of the `asset` to cover `paymentRequirements.maxAmountRequired`.
4. Verify the transaction contains a fungible asset transfer operation.
5. Verify the transfer is for the correct asset (matching `paymentRequirements.asset`).
6. Verify the transfer amount matches `paymentRequirements.maxAmountRequired`.
7. Verify the transfer recipient matches `paymentRequirements.payTo`.
8. Simulate the transaction using the Aptos REST API to ensure it would succeed and has not already been executed/committed to the chain.
9. Verify the transaction has not expired (check sequence number and expiration timestamp).

## Settlement

Settlement is performed via the facilitator submitting the transaction to the Aptos network for execution.

### For Non-Sponsored Transactions:
- The facilitator submits the fully-signed transaction directly to the network.

### For Sponsored Transactions:
1. The facilitator adds its signature as the fee payer sponsor.
2. The facilitator submits the multi-agent transaction (client as sender, facilitator as sponsor) to the network.

The settlement response includes the transaction hash which can be used to track the transaction on-chain.

## `X-PAYMENT-RESPONSE` Header Payload

The `X-PAYMENT-RESPONSE` header is base64 encoded and returned to the client from the resource server.

Once decoded, the `X-PAYMENT-RESPONSE` is a JSON string with the following properties:

```json
{
  "success": true,
  "transaction": "0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890",
  "network": "aptos-mainnet",
  "version": "12345678"
}
```

- `transaction`: The transaction hash
- `version`: The transaction version number (ledger version)

## Appendix

### Sponsored Transactions

Aptos supports sponsored (gasless) transactions via an interactive transaction construction protocol with a gas station, similar to Sui. If a facilitator supports sponsoring of transactions, it should communicate this to the client by providing a URL via the `paymentRequirements.extra.gasStation` field.

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
- `amount`: The exact amount specified in `paymentRequirements.maxAmountRequired`

### Signature Schemes

Aptos supports:
- **Ed25519**: Single signature scheme (most common)
- **MultiEd25519**: Multi-signature scheme for accounts requiring multiple signatures

The facilitator must verify signatures according to the sender's authentication key and signature scheme.

### BCS Serialization

All Aptos transactions are serialized using BCS (Binary Canonical Serialization) before being transmitted. The TypeScript SDK provides utilities for:
- Serializing transaction payloads
- Deserializing received transactions
- Encoding/decoding to/from Base64

### Network Identifiers

Valid network identifiers:
- `aptos-mainnet`: Mainnet (Chain ID: 1)
- `aptos-testnet`: Testnet (Chain ID: 2)
- `aptos-devnet`: Devnet (Chain ID: varies)

### Account Addresses

Aptos account addresses are 32-byte hex strings, typically represented with a `0x` prefix. Addresses can be in short form (without leading zeros) or long form (64 hex characters).

Example: `0x1` (short) = `0x0000000000000000000000000000000000000000000000000000000000000001` (long)

### Recommendation

- Use the spec defined above for the first version of the protocol and only support payments of specific amounts.
- Support both non-sponsored (client pays gas) and sponsored (facilitator pays gas) transaction modes.
- For sponsored transactions, implement the gas station protocol to enable gasless payments for clients.
- Leverage the Aptos TypeScript SDK for transaction construction, serialization, and simulation.
- Future versions could explore deferred settlement patterns or usage-based payments if Aptos introduces new primitives that enable such flows.

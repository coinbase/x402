# Scheme: `exact` on `Aptos`

## Summary

The `exact` scheme on Aptos transfers a specific amount of a fungible asset (such as APT or stablecoins like USDC) from the payer to the resource server using the Aptos fungible asset transfer function (`0x1::primary_fungible_store::transfer`). The approach requires the payer to construct a complete signed transaction ensuring that the facilitator cannot alter the transaction or redirect funds to any address other than the one specified by the resource server in paymentRequirements.

**Version Support:** This specification supports x402 v2 protocol only.

**Current Implementation:** Uses the standard Aptos account transfer function for simplicity.

## Protocol Sequencing

The protocol flow for `exact` on Aptos is client-driven. When the facilitator supports sponsorship, it sets `extra.sponsored` to `true` in the payment requirements. This signals to the client that sponsored (gasless) transactions are available.

1. Client makes a request to a `resource server` and receives a `402 Payment Required` response. The `extra.sponsored` field indicates sponsorship is available.
2. Client constructs a fee payer transaction to transfer the fungible asset to the resource server's address. The client can set the fee payer address to `0x0` as a placeholder.
3. Client signs the transaction.
4. Client serializes the signed transaction using BCS (Binary Canonical Serialization) and encodes it as Base64.
5. Client resends the request to the `resource server` including the payment in the `PAYMENT-SIGNATURE` header.
6. `resource server` passes the payment payload to the `facilitator` for verification.
7. `facilitator` validates the transaction structure, signature, and payment details.
8. `resource server` does the work to fulfill the request.
9. `resource server` requests settlement from the `facilitator`.
10. `facilitator` ensures the transaction is sponsored (fee payer signature added) and submitted to the `Aptos` network. See [Aptos Sponsored Transactions](https://aptos.dev/build/guides/sponsored-transactions) for details.
11. `facilitator` reports back to the `resource server` the result of the transaction.
12. `resource server` returns the response to the client with the `PAYMENT-RESPONSE` header.

**Security Note:** The sponsorship mechanism does not give the fee payer possession or ability to alter the client's transaction. The client's signature covers the entire transaction payload (recipient, amount, asset). The fee payer can only add its own signature - any attempt to modify the transaction would invalidate the client's signature and cause the transaction to fail.

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
    "sponsored": true
  }
}
```

### Field Descriptions

- `scheme`: Always `"exact"` for this scheme
- `network`: CAIP-2 network identifier - `aptos:1` (mainnet) or `aptos:2` (testnet)
- `amount`: The exact amount to transfer in atomic units (e.g., `"100000000"` = 1 APT, since APT has 8 decimals)
- `asset`: The metadata address of the fungible asset (e.g., USDC on Aptos mainnet: `0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b`)
- `payTo`: The recipient address (32-byte hex string with `0x` prefix)
- `maxTimeoutSeconds`: Maximum time in seconds before the payment expires
- `extra.sponsored`: (Optional) Boolean indicating whether the facilitator will sponsor gas fees. When `true`, the client can construct a fee payer transaction without including gas payment. When absent or `false`, the client must pay their own gas fees.

## PaymentPayload `payload` Field

The `payload` field of the `PaymentPayload` must contain the following fields:

- `transaction`: Base64 encoded BCS-serialized signed Aptos transaction

Example `payload`:

```json
{
  "transaction": "AQDy8fLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vIC..."
}
```

Full `PaymentPayload` object:

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
    "maxTimeoutSeconds": 60,
    "extra": {
      "sponsored": true
    }
  },
  "payload": {
    "transaction": "AQDy8fLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vIC..."
  }
}
```

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

Settlement is performed by sponsoring and submitting the transaction:

1. Facilitator receives the client-signed transaction.
2. Fee payer address is set on the transaction.
3. Fee payer signs the transaction.
4. Fully-signed transaction is submitted to the Aptos network.
5. Transaction hash is returned to the resource server.

The facilitator may act as the fee payer directly, or delegate to a gas station service. See the [Sponsored Transactions](#sponsored-transactions) appendix for implementation options.

Aptos supports [fee payer transactions](https://aptos.dev/build/guides/sponsored-transactions) where a sponsor pays gas fees on behalf of the sender. This is a native Aptos feature that maintains transaction integrity.

The settlement response includes the transaction hash which can be used to track the transaction on-chain.

## `PAYMENT-RESPONSE` Header Payload

The `PAYMENT-RESPONSE` header is base64 encoded and returned to the client from the resource server.

Once decoded, the `PAYMENT-RESPONSE` is a JSON string following the standard `SettlementResponse` schema:

```json
{
  "success": true,
  "transaction": "0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890",
  "network": "aptos:1",
  "payer": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
}
```

### Field Descriptions

- `success`: Boolean indicating whether the payment settlement was successful
- `transaction`: The transaction hash (64 hex characters with `0x` prefix)
- `network`: The CAIP-2 network identifier
- `payer`: The address of the payer's wallet

For Aptos-specific information like the ledger version, clients can query the transaction details using the transaction hash via the [Aptos REST API](https://aptos.dev/build/apis).

## Appendix

### Sponsored Transactions

When `extra.sponsored` is `true`, the facilitator will pay gas fees on behalf of the client using Aptos's native [fee payer mechanism](https://aptos.dev/build/guides/sponsored-transactions).

Facilitators can implement sponsorship in two ways:

**Direct Fee Payer:**
The facilitator maintains a wallet and signs transactions as the fee payer directly at settlement time. This is the simplest approach.

**Gas Station Service:**
The facilitator operates (or integrates with) a gas station service that handles fee payment. This approach enables additional features:

- Rate limiting per account or globally
- Function allowlists to restrict which operations can be sponsored
- Budget controls and usage tracking
- Abuse prevention policies

Both approaches are transparent to the client - they simply see `sponsored: true` and construct their transaction accordingly.

### Non-Sponsored Transactions

If `extra.sponsored` is absent or `false`, the client must pay their own gas fees:

1. Client constructs a regular transaction including gas payment from their own account.
2. Client fully signs the transaction.
3. At settlement, the facilitator submits the fully-signed transaction directly to the Aptos network.

This mode may be useful for facilitators that do not wish to sponsor transactions or for testing purposes.

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
- Implement sponsored transactions to enable gasless payments for clients (recommended).
- Leverage the Aptos TypeScript SDK for transaction construction, serialization, and simulation.
- Future versions could explore deferred settlement patterns or usage-based payments if Aptos introduces new primitives that enable such flows.

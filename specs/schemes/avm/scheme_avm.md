# Scheme: `avm`

## Variants

### 1. `avm` (Basic)
Standard Algorand payment and asset transfer transactions.

### 2. `avm-exact`
Exact payment verification with signed authorizations for enhanced security.

## Summary

The `avm` scheme enables secure and verifiable payments on the Algorand blockchain through the x402 protocol. It leverages Algorand's native transaction types and Atomic Transfers to ensure atomic payment verification and settlement.

## Use Cases

1. **dApp Access Control**: Pay-per-use access to Algorand-based dApps and services
2. **Content Unlocking**: Unlock premium content or features after payment verification
3. **API Rate Limiting**: Grant API access based on payment verification
4. **Microtransactions**: Enable micro-payments for digital goods and services

## Payment Flow

1. **Client Request**: Client requests a protected resource
2. **Payment Requirements**: Server responds with payment requirements including:
   - `payTo`: Algorand address to receive payment
   - `assetId`: Algorand Standard Asset ID (0 for ALGO, >0 for ASA)
   - `amount`: Amount in base units (microAlgos for ALGO, base units for ASA)
   - `appId`: (Optional) Application ID if using an Algorand Smart Contract
   - `validRounds`: Number of rounds the payment is valid for
   - `note`: (Optional) Additional metadata or reference

3. **Payment Construction**: Client constructs and signs an Algorand payment or asset transfer transaction
4. **Payment Submission**: Client includes the signed transaction in the `X-Payment` header
5. **Verification**: Server verifies the transaction's validity and signature
6. **Resource Access**: If verification passes, the server grants access to the requested resource

## `X-Payment` Header Payload

### Basic AVM Scheme
For the basic `avm` scheme, include:
- `signedTxn`: Base64-encoded signed transaction blob
- `txnId`: Transaction ID
- `signer`: Signer's Algorand address
- `groupIndex`: (Optional) Atomic group index

Example:
```json
{
  "x402Version": 1,
  "scheme": "avm",
  "network": "algorand-testnet",
  "payload": {
    "signedTxn": "gqNzaWfEQ...",
    "txnId": "TXID1234567890",
    "signer": "ALGORANDADDRESS1234567890"
  }
}
```

### AVM-Exact Scheme
For `avm-exact`, include:
- `signedTxn`: Base64-encoded transaction
- `authorization`: Signed payment details
- `signature`: Signature of authorization

Example:
```json
{
  "x402Version": 1,
  "scheme": "avm-exact",
  "network": "algorand-testnet",
  "payload": {
    "signedTxn": "gqNzaWfEQ...",
    "authorization": {
      "from": "ALGORANDADDRESS1234567890",
      "to": "RESOURCEPROVIDERADDRESS",
      "amount": "1000000",
      "assetId": 0,
      "validRounds": 1000,
      "nonce": "a1b2c3d4"
    },
    "signature": "base64signature..."
  }
}
```

The `payload` field of the `X-PAYMENT` header must contain the following fields:

- `signedTxn`: Base64-encoded signed transaction blob
- `txnId`: Transaction ID for reference
- `signer`: Address that signed the transaction
- `groupIndex`: (Optional) Index of the transaction in the atomic group, if applicable

Example:

```json
{
  "x402Version": 1,
  "scheme": "avm",
  "network": "algorand-testnet",
  "payload": {
    "signedTxn": "gqNzaWfEQ...",
    "txnId": "TXID1234567890",
    "signer": "ALGORANDADDRESS1234567890",
    "groupIndex": 0
  }
}
```

## Verification Process

### Basic AVM Scheme
1. **Transaction Validation**:
   - Verify transaction signature
   - Check transaction type and expiration
   - Validate sender and recipient

### AVM-Exact Scheme
1. **Authorization Check**:
   - Verify signature matches authorization
   - Check nonce hasn't been used
   - Validate transaction matches authorization
   - Confirm within valid rounds

1. **Transaction Validation**:
   - Decode and verify the signed transaction
   - Check the transaction type (Payment or Asset Transfer)
   - Verify the transaction is not expired (using `firstValid`/`lastValid`)
   - Confirm the transaction is properly signed by the sender

2. **Payment Verification**:
   - Verify the recipient matches the `payTo` address
   - Verify the amount is equal to or greater than required
   - For ASA transfers, verify the correct asset ID
   - Check the transaction is confirmed on-chain (optional, for synchronous verification)

3. **Smart Contract Verification** (if applicable):
   - If `appId` is provided, verify the transaction is part of an ApplicationCall
   - Verify the application call arguments and accounts match expected values

## Security Considerations

1. **Replay Protection**:
   - Each transaction includes a `firstValid`/`lastValid` range
   - Servers should track used transaction IDs to prevent replay attacks

2. **Timing**:
   - Servers should set appropriate `validRounds` to prevent delayed execution
   - Consider on-chain confirmation for high-value resources

3. **Fee Management**:
   - Clients should include sufficient fees for timely processing
   - Consider using fee pooling or sponsored transactions for better UX

## Error Cases

- `invalid_transaction`: Malformed or invalid transaction
- `insufficient_funds`: Payment amount is less than required
- `wrong_recipient`: Payment sent to incorrect address
- `expired_transaction`: Transaction outside valid round range
- `invalid_signature`: Transaction signature verification failed
- `duplicate_transaction`: Transaction already processed

## Appendix

### Transaction Structure Example (Payment)

```javascript
{
  "type": "pay",
  "from": "ALGORANDADDRESS1234567890",
  "to": "RESOURCEPROVIDERADDRESS",
  "amount": 1000000, // 1 ALGO (in microAlgos)
  "firstValid": 1000,
  "lastValid": 2000,
  "genesisID": "testnet-v1.0",
  "genesisHash": "SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=",
  "note": "x402 payment for resource XYZ"
}
```

### Transaction Structure Example (ASA Transfer)

```javascript
{
  "type": "axfer",
  "from": "ALGORANDADDRESS1234567890",
  "to": "RESOURCEPROVIDERADDRESS",
  "assetIndex": 12345678, // ASA ID
  "amount": 100, // Amount in base units of the ASA
  "firstValid": 1000,
  "lastValid": 2000,
  "genesisID": "testnet-v1.0",
  "genesisHash": "SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI="
}
```

### Atomic Transfers

For more complex payment flows, multiple transactions can be grouped atomically:

1. Payment from user to service provider
2. Application call to update state
3. Asset transfer from service provider to user (for change or delivery)

This ensures all operations succeed or fail together, providing atomicity guarantees.

## Implementation Notes

- Use Algorand's official SDKs for transaction construction and verification
- Consider using Algorand Indexer for efficient transaction lookup and verification
- For high-throughput services, implement transaction pooling and batch verification
- Monitor Algorand network parameters (minimum fee, block time) for optimal configuration

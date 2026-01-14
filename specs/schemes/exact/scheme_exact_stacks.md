# Exact Payment Scheme for Stacks (`exact`)

This document specifies the `exact` payment scheme for the x402 protocol on the Stacks blockchain.

This scheme facilitates payments of a specific amount of STX (native token) or SIP-010 fungible tokens (sBTC, USDCx, etc.) on Stacks.

## Scheme Name

`exact`

## Protocol Flow

The protocol flow for `exact` on Stacks is client-driven with facilitator settlement.

1.  **Client** makes a request to a **Resource Server**.
2.  **Resource Server** responds with HTTP 402 containing `PaymentRequirements`.
3.  **Client** creates and fully signs a Stacks transaction:
    - For STX: A native `token-transfer` transaction
    - For SIP-010 tokens: A `contract-call` to the token's `transfer` function
4.  **Client** includes the payment request nonce in the transaction memo (up to 34 bytes) for correlation.
5.  **Client** serializes the signed transaction as a hex string.
6.  **Client** sends a new request to the resource server with the `PaymentPayload` containing the signed transaction hex in the `X-PAYMENT` header.
7.  **Resource Server** receives the request and forwards the `PaymentPayload` and `PaymentRequirements` to a **Facilitator Server's** `/verify` endpoint (optional pre-check) or directly to `/settle`.
8.  **Facilitator** decodes and deserializes the transaction.
9.  **Facilitator** inspects the transaction to ensure it matches the payment requirements.
10. **Facilitator** broadcasts the transaction to the Stacks network.
11. **Facilitator** waits for transaction confirmation (anchored in a Bitcoin block).
12. Upon successful on-chain settlement, the **Facilitator Server** responds with a `SettlementResponse` to the **Resource Server**.
13. **Resource Server** grants the **Client** access to the resource and returns the settlement details in `X-PAYMENT-RESPONSE` header.

## `PaymentRequirements` for `exact`

The `exact` scheme on Stacks uses the following `PaymentRequirements` structure:

```json
{
  "scheme": "exact",
  "network": "stacks:1",
  "amount": "1000000",
  "asset": "STX",
  "payTo": "SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7",
  "maxTimeoutSeconds": 300,
  "extra": {
    "nonce": "a1b2c3d4e5f6",
    "expiresAt": "2024-01-15T12:00:00Z",
    "tokenType": "STX"
  }
}
```

### Field Descriptions

- `network`: Network identifier. Use `stacks:1` for mainnet, `stacks:2147483648` for testnet (following CAIP-2 convention with Stacks chain IDs).
- `amount`: Amount in base units (microSTX for STX, satoshis for sBTC, smallest unit for other tokens).
- `asset`: For STX, use `"STX"`. For SIP-010 tokens, use the contract identifier (e.g., `"SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.runes-dog::runes-dog"`).
- `payTo`: The Stacks address to receive the payment.
- `extra.nonce`: Unique identifier for this payment request, included in transaction memo for correlation.
- `extra.expiresAt`: ISO 8601 timestamp when this payment request expires.
- `extra.tokenType`: Token type identifier: `"STX"`, `"sBTC"`, or `"USDCx"`.
- `extra.tokenContract` (for SIP-010): Object with `address` and `name` of the token contract.

### Example with SIP-010 Token (sBTC)

```json
{
  "scheme": "exact",
  "network": "stacks:1",
  "amount": "100000",
  "asset": "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token::sbtc-token",
  "payTo": "SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7",
  "maxTimeoutSeconds": 300,
  "extra": {
    "nonce": "a1b2c3d4e5f6",
    "expiresAt": "2024-01-15T12:00:00Z",
    "tokenType": "sBTC",
    "tokenContract": {
      "address": "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4",
      "name": "sbtc-token"
    }
  }
}
```

## PaymentPayload `payload` Field

The `payload` field of the `PaymentPayload` contains the fully-signed transaction:

```json
{
  "signedTransaction": "00000000010400..."
}
```

- `signedTransaction`: Hex-encoded, serialized, fully-signed Stacks transaction.

### Full `PaymentPayload` Example (STX)

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://api.example.com/premium-data",
    "description": "Access to premium data endpoint",
    "mimeType": "application/json"
  },
  "accepted": {
    "scheme": "exact",
    "network": "stacks:1",
    "amount": "1000000",
    "asset": "STX",
    "payTo": "SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7",
    "maxTimeoutSeconds": 300,
    "extra": {
      "nonce": "a1b2c3d4e5f6",
      "expiresAt": "2024-01-15T12:00:00Z",
      "tokenType": "STX"
    }
  },
  "payload": {
    "signedTransaction": "00000000010400a1b2c3..."
  }
}
```

## Transaction Construction

### STX Native Transfer

Clients construct a `token-transfer` transaction using the Stacks transaction format:

```typescript
import { makeSTXTokenTransfer } from '@stacks/transactions';

const transaction = await makeSTXTokenTransfer({
  recipient: paymentRequirements.payTo,
  amount: BigInt(paymentRequirements.amount),
  senderKey: privateKey,
  network: stacksNetwork,
  memo: paymentRequirements.extra.nonce.substring(0, 34),
  anchorMode: AnchorMode.Any,
});
```

### SIP-010 Token Transfer

For SIP-010 tokens (sBTC, USDCx), clients construct a `contract-call` transaction:

```typescript
import { makeContractCall, uintCV, principalCV, someCV, bufferCVFromString } from '@stacks/transactions';

const transaction = await makeContractCall({
  contractAddress: tokenContract.address,
  contractName: tokenContract.name,
  functionName: 'transfer',
  functionArgs: [
    uintCV(amount),
    principalCV(senderAddress),
    principalCV(recipient),
    someCV(bufferCVFromString(memo)),
  ],
  senderKey: privateKey,
  network: stacksNetwork,
  anchorMode: AnchorMode.Any,
  postConditionMode: PostConditionMode.Allow,
});
```

## `SettlementResponse`

The `SettlementResponse` for the exact scheme on Stacks:

```json
{
  "success": true,
  "tx_id": "0x1234567890abcdef...",
  "network": "stacks:1",
  "sender_address": "SP1234...",
  "recipient_address": "SP5678...",
  "amount": 1000000,
  "status": "confirmed",
  "block_height": 150000
}
```

## Facilitator Verification Rules (MUST)

A facilitator verifying an `exact`-scheme Stacks payment MUST enforce all of the following checks before broadcasting:

### 1. Transaction Type Validation

- For STX payments: Transaction MUST be a `token-transfer` type.
- For SIP-010 payments: Transaction MUST be a `contract-call` type calling the `transfer` function.

### 2. Recipient Validation

- For STX: The `recipient` field MUST equal `PaymentRequirements.payTo`.
- For SIP-010: The recipient argument in the `transfer` call MUST equal `PaymentRequirements.payTo`.

### 3. Amount Validation

- The transfer amount MUST be greater than or equal to `PaymentRequirements.amount`.

### 4. Asset Validation

- For SIP-010: The contract being called MUST match the expected token contract from `PaymentRequirements.asset` or `extra.tokenContract`.

### 5. Memo/Nonce Correlation (RECOMMENDED)

- If `extra.nonce` is provided, the transaction memo SHOULD contain this nonce for payment correlation.

### 6. Expiration Check

- If `extra.expiresAt` is provided, the facilitator MUST reject payments submitted after this timestamp.

### 7. Sender Balance Validation

- The sender MUST have sufficient balance to cover the transfer amount plus transaction fees.

### 8. Transaction Simulation (RECOMMENDED)

- Before broadcasting, facilitators SHOULD simulate the transaction to verify it will succeed.

## Security Considerations

### Fully-Signed Transactions

Unlike EVM (EIP-3009 authorizations) or SVM (partially-signed transactions), Stacks payments use fully-signed transactions. This means:

- The client pays transaction fees (no fee sponsorship by default)
- The facilitator cannot modify the transaction, only broadcast it
- Transaction can only be broadcast once (nonce prevents replay)

### Post-Conditions

For SIP-010 token transfers, implementations SHOULD use appropriate post-conditions to ensure the exact amount is transferred and prevent unexpected token movements.

### Network Confirmation

Stacks transactions are anchored in Bitcoin blocks. Facilitators should wait for sufficient confirmations based on the payment amount and risk tolerance.

## Supported Assets

| Token | Type | Amount Unit |
|-------|------|-------------|
| STX | Native | microSTX (1 STX = 1,000,000 microSTX) |
| sBTC | SIP-010 | satoshis (1 sBTC = 100,000,000 sats) |
| USDCx | SIP-010 | micro-USDCx (1 USDCx = 1,000,000 micro-USDCx) |

### Token Contract Addresses

| Token | Network | Contract Identifier |
|-------|---------|---------------------|
| STX | mainnet/testnet | Native (no contract) |
| sBTC | mainnet | `SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token::sbtc-token` |
| sBTC | testnet | `ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token::sbtc-token` |
| USDCx | mainnet | `SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx::USDCx` |
| USDCx | testnet | Not yet deployed (aeUSDC from Allbridge available as alternative) |

## Reference Implementation

- Client/Server SDK: [x402Stacks](https://github.com/tony1908/x402Stacks) (x402-stacks on npm)
- Registry: [x402StacksScan](https://scan.stacksx402.com)

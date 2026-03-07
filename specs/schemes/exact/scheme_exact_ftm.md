# Exact Payment Scheme for Fantom/Sonic (Native Transfer) (`exact`)

This document specifies the `exact` payment scheme for native FTM transfers on the Fantom Opera and Sonic networks. It defines how a client constructs a signed EVM-compatible transaction for a precise payment amount in native FTM and how a facilitator verifies and settles that transaction on-chain.

## Scheme Name

`exact`

## Supported Networks

| Network | CAIP-2 Identifier |
|---|---|
| Fantom Opera Mainnet | `eip155:250` |
| Fantom Testnet | `eip155:4002` |
| Sonic Mainnet | `eip155:146` |

## Supported Assets

| Token | Asset Identifier | Decimals | Smallest Unit |
|---|---|---|---|
| FTM | `FTM` | 18 | wei (1 FTM = 10^18 wei) |

## Protocol Flow

1. Client sends an HTTP request to a resource server for a paid resource.
2. Resource server determines the price for the resource in FTM.
3. Resource server responds with HTTP `402 Payment Required`, including `PaymentRequirements` in the response headers.
4. Client parses the `PaymentRequirements` to determine the payment details (amount, recipient, network, asset).
5. Client constructs a standard EVM transfer transaction with the required amount in wei and `gasLimit` of 21000.
6. Client populates the transaction with EIP-1559 (type 2) fields including `maxFeePerGas` and `maxPriorityFeePerGas`.
7. Client sets the `nonce` and an `expiry` timestamp in the authorization metadata.
8. Client signs the transaction using `wallet.signTransaction()`, producing an RLP-encoded hex string.
9. Client constructs a `PaymentPayload` containing the signed transaction hex and authorization metadata.
10. Client re-sends the original HTTP request with the `PaymentPayload` in the `X-PAYMENT` header.
11. Resource server forwards the `PaymentPayload` to the facilitator for verification.
12. Facilitator parses the signed transaction, verifies all fields (recipient, amount, expiry, balance, replay).
13. If verification passes, the facilitator returns a success response to the resource server.
14. Resource server serves the paid resource to the client.
15. Facilitator broadcasts the signed transaction to the Fantom/Sonic network for settlement.

## PaymentRequirements

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "eip155:250",
  "payTo": "0xRecipient...abc",
  "maxAmountRequired": "1000000000000000000",
  "asset": "FTM",
  "extra": {
    "name": "Example Resource",
    "description": "Access to a premium data endpoint"
  },
  "resource": "https://api.example.com/data/premium"
}
```

| Field | Description |
|---|---|
| `x402Version` | Protocol version. Must be `1`. |
| `scheme` | Payment scheme identifier. Must be `exact`. |
| `network` | CAIP-2 network identifier for the target Fantom/Sonic network. |
| `payTo` | 0x-prefixed hex address of the payment recipient. |
| `maxAmountRequired` | Maximum payment amount in wei (smallest unit). |
| `asset` | Asset identifier. Must be `FTM`. |
| `extra` | Optional metadata about the resource being purchased. |
| `resource` | The URL of the resource being paid for. |

## PaymentPayload

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "payload": {
    "signature": "0x02f8730181...signed_tx_hex",
    "authorization": {
      "type": "evm-signed-transaction",
      "from": "0xSender...abc",
      "to": "0xRecipient...xyz",
      "amount": "1000000000000000000",
      "asset": "FTM",
      "chainId": 250,
      "nonce": 42,
      "expiry": 1709830800
    }
  }
}
```

| Field | Description |
|---|---|
| `x402Version` | Protocol version. Must be `1`. |
| `scheme` | Payment scheme identifier. Must be `exact`. |
| `payload.signature` | RLP-encoded signed EVM transaction as a hex string. |
| `payload.authorization.type` | Authorization type. Must be `evm-signed-transaction`. |
| `payload.authorization.from` | 0x-prefixed sender address. |
| `payload.authorization.to` | 0x-prefixed recipient address. |
| `payload.authorization.amount` | Payment amount in wei as a string. |
| `payload.authorization.asset` | Asset identifier. Must be `FTM`. |
| `payload.authorization.chainId` | EVM chain ID (250 for Opera, 4002 for testnet, 146 for Sonic). |
| `payload.authorization.nonce` | Transaction nonce for the sender account. |
| `payload.authorization.expiry` | Unix timestamp after which the payment is no longer valid. |

## SettlementResponse

```json
{
  "success": true,
  "transaction": "0xabc123...def456",
  "network": "eip155:250",
  "payer": "0xSender...abc",
  "payee": "0xRecipient...xyz"
}
```

| Field | Description |
|---|---|
| `success` | Whether settlement was successful. |
| `transaction` | On-chain transaction hash (0x-prefixed hex string). |
| `network` | CAIP-2 network identifier where settlement occurred. |
| `payer` | 0x-prefixed sender address. |
| `payee` | 0x-prefixed recipient address. |

## Facilitator Verification Rules (MUST)

1. **Scheme validation**
   - The `scheme` field MUST be `exact`.
   - The `x402Version` MUST be `1`.

2. **Signature parsing**
   - The facilitator MUST parse the signed transaction hex using `ethers.Transaction.from()`.
   - Parsing failure MUST result in rejection.

3. **Recipient match**
   - The `to` field parsed from the signed transaction MUST match the `payTo` address from `PaymentRequirements`.
   - Comparison MUST be case-insensitive (EVM addresses are case-insensitive for matching purposes).
   - The authorization `to` field MUST also match the parsed transaction recipient.

4. **Amount validation**
   - The `value` parsed from the signed transaction MUST be greater than or equal to the `maxAmountRequired`.
   - The authorization `amount` MUST match the parsed transaction value.

5. **Chain ID validation**
   - The `chainId` parsed from the signed transaction MUST match the expected network chain ID (250, 4002, or 146).
   - The authorization `chainId` MUST match the parsed transaction chain ID.

6. **Transaction type validation**
   - The transaction MUST be a native value transfer (no `data` field or empty `data`).
   - The `gasLimit` SHOULD be 21000 for a simple native transfer.

7. **Expiry check**
   - The `expiry` timestamp in the authorization MUST be in the future (not yet passed).
   - Expired payments MUST be rejected.

8. **Sender recovery and balance verification**
   - The facilitator MUST recover the sender address from the signed transaction.
   - The recovered address MUST match the authorization `from` field (case-insensitive).
   - The facilitator MUST query the sender's on-chain balance via `provider.getBalance(from)`.
   - The balance MUST be sufficient to cover the payment amount plus gas costs.

9. **Replay protection**
   - The facilitator MUST compute the transaction hash from the signed transaction.
   - If the hash has been seen within the replay protection window, the payment MUST be rejected.
   - The hash MUST be stored upon successful verification.

10. **Nonce validation**
    - The `nonce` in the authorization MUST match the nonce in the parsed signed transaction.
    - The facilitator SHOULD verify the nonce matches the sender's current on-chain nonce.

## Settlement

1. **Balance re-check** -- The facilitator MUST re-verify the sender's FTM balance immediately before broadcasting to ensure funds have not been spent since verification.
2. The facilitator broadcasts the signed transaction via `provider.broadcastTransaction(signedTxHex)`.
3. The facilitator waits for 1 confirmation via `txResponse.wait(1)`.
4. The facilitator checks that `receipt.status === 1` to confirm successful execution.
5. The facilitator extracts the transaction hash from the receipt.
6. Upon confirmation, the facilitator returns the `SettlementResponse` with the transaction hash.
7. Block confirmation is typically fast (~1 second on Opera, ~0.4 seconds on Sonic).

## Settlement Failure Modes

| Failure | Cause | Outcome |
|---|---|---|
| Insufficient balance | Sender spent funds between verification and broadcast | Transaction rejected by network; facilitator returns failure |
| Nonce too low | Another transaction confirmed with the same nonce | Transaction rejected by network; facilitator returns failure |
| Nonce too high | Gap in sender's transaction sequence | Transaction may remain pending; facilitator returns timeout failure |
| Gas price too low | Base fee increased above `maxFeePerGas` | Transaction rejected or stuck; facilitator returns failure |
| Invalid signature | Corrupted or tampered signed transaction bytes | Transaction rejected by network; facilitator returns failure |
| Duplicate transaction | Tx hash already exists on-chain | Network rejects duplicate; facilitator returns failure |
| Network congestion | Transaction pool full on Fantom/Sonic nodes | Broadcast may fail; facilitator returns failure with retry guidance |
| Receipt status 0 | Transaction reverted (unlikely for native transfer) | Facilitator detects failed receipt; returns failure |
| RPC timeout | Fantom/Sonic RPC node unavailable | Broadcast fails; facilitator returns failure |

## Security Considerations

### Trust Model

| Party | Trust Assumption |
|---|---|
| Client | Trusts that the facilitator will broadcast the signed transaction and that the resource server will deliver the resource upon valid payment. |
| Resource Server | Trusts the facilitator to correctly verify payment validity and settle on-chain. |
| Facilitator | Does not trust the client. Independently verifies all transaction fields, recovers the signer, checks balance, and validates replay status before accepting. |

### Replay Protection

The facilitator maintains a record of transaction hashes that have been processed. Any transaction whose hash has been previously seen is rejected. Additionally, EVM nonce-based ordering provides network-level replay protection -- once a transaction with a given nonce is confirmed, subsequent transactions with the same nonce are invalid.

### Address Format

All addresses MUST be 0x-prefixed hex strings conforming to the EVM address format (20 bytes / 40 hex characters). The facilitator SHOULD accept both checksummed (EIP-55) and non-checksummed addresses but MUST perform case-insensitive comparison for matching. Invalid hex strings or incorrect-length addresses MUST be rejected.

### Double-Spend Risk

Fantom Opera and Sonic use account-based nonce sequencing identical to Ethereum. Each account has a monotonically increasing nonce, and only one transaction per nonce can be confirmed. The facilitator mitigates double-spend risk by:

- Verifying the sender's current balance before broadcasting.
- Performing a balance re-check immediately before settlement.
- Relying on the network's nonce enforcement for transaction ordering.
- Waiting for at least 1 block confirmation before returning success.

With ~1-second block times on Opera and ~0.4-second block times on Sonic, the confirmation window is extremely fast, minimizing the double-spend attack surface.

## Differences from EVM Exact Scheme

| Aspect | EVM Exact Scheme | FTM Native Exact Scheme |
|---|---|---|
| Token type | ERC-20 tokens (USDC, etc.) | Native FTM (not ERC-20) |
| Transfer mechanism | EIP-3009 / Permit2 / `transferFrom` | Native value transfer (`msg.value`) |
| Gas limit | Variable (token contract execution) | Fixed 21000 (simple transfer) |
| Transaction data | Contains encoded contract call | Empty (no calldata) |
| Smart contract interaction | Yes (ERC-20 contract) | No (direct value transfer) |
| Supported networks | Ethereum, Base, Arbitrum, etc. | Fantom Opera, Sonic |
| Confirmation time | ~2 seconds (Ethereum) | ~1 second (Opera), ~0.4 seconds (Sonic) |
| Signature type | EIP-712 typed data or tx signature | Standard EVM tx signature (EIP-1559 type 2) |
| Amount denomination | Token smallest unit (e.g., 10^6 for USDC) | Wei (10^18) |
| Value field | Zero (amount in calldata) | Non-zero (amount is the tx value) |

## Reference Implementation

| Component | Reference |
|---|---|
| npm package | `@erudite-intelligence/x402-ftm` |
| GitHub | `https://github.com/erudite-intelligence/x402-ftm` |
| Facilitator | Erudite Intelligence x402 Facilitator |

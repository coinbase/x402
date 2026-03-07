# Exact Payment Scheme for Monero (tx-proof) (`exact`)

## Scheme Name

`exact`

## Supported Networks

| Network         | CAIP-2 Identifier |
| --------------- | ----------------- |
| Monero Mainnet  | `monero:mainnet`  |

## Supported Assets

| Token | Asset Identifier | Decimals | Smallest Unit |
| ----- | ---------------- | -------- | ------------- |
| XMR   | `XMR`            | 12       | piconero      |

1 XMR = 1,000,000,000,000 piconero.

## Protocol Flow

Monero's x402 flow is fundamentally different from other chains. Monero transactions cannot be signed offline and submitted later. The wallet RPC creates AND broadcasts in a single atomic step. The payment payload therefore contains cryptographic proof of an already-broadcast transaction, not an unbroadcast transaction.

1. Client sends an HTTP request to a resource server protected by x402.
2. Resource server responds with `402 Payment Required` including `PaymentRequirements`.
3. Client parses the `PaymentRequirements` and identifies the `exact` scheme on Monero.
4. Client calls `transfer` on its local Monero wallet RPC to send the required amount to the facilitator's address.
5. The wallet RPC constructs, signs, and broadcasts the transaction atomically.
6. The wallet RPC returns `tx_hash` and `tx_key` to the client.
7. The `tx_key` is a cryptographic proof-of-payment: it can be verified by any Monero daemon without access to the sender's wallet.
8. Client constructs the `PaymentPayload` containing the `tx_hash` and `tx_key` as the signature (proof).
9. Client constructs an authorization object with transfer details (from, to, amount, asset, chain, timestamps).
10. Client sends the original HTTP request with the `PaymentPayload` in the `X-PAYMENT` header.
11. Resource server forwards the `PaymentPayload` to the facilitator for verification.
12. Facilitator verifies the payment by calling `check_tx_key` on its Monero daemon RPC.
13. The daemon cryptographically proves the amount received at the destination address using the `tx_key`.
14. If verification passes, the facilitator records settlement. No additional broadcast is needed.
15. Resource server returns the requested resource to the client.

## PaymentRequirements

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "monero:mainnet",
  "payToAddress": "4...",
  "maxAmountRequired": "1000000000000",
  "asset": "XMR",
  "resource": "https://api.example.com/resource",
  "description": "Access to premium endpoint",
  "mimeType": "application/json",
  "outputSchema": null,
  "extra": null
}
```

| Field              | Description                                                              |
| ------------------ | ------------------------------------------------------------------------ |
| `x402Version`      | Protocol version. Must be `1`.                                           |
| `scheme`           | Payment scheme identifier. Must be `exact`.                              |
| `network`          | CAIP-2 network identifier for the Monero network.                        |
| `payToAddress`     | Monero standard address (starts with `4`) to receive payment.            |
| `maxAmountRequired`| Maximum payment amount in piconero.                                      |
| `asset`            | Asset identifier. Must be `XMR`.                                         |
| `resource`         | The URL of the resource being paid for.                                  |
| `description`      | Human-readable description of the resource.                              |
| `mimeType`         | MIME type of the resource response.                                      |
| `outputSchema`     | Optional JSON schema describing the response.                            |
| `extra`            | Optional additional metadata.                                            |

## PaymentPayload

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "monero:mainnet",
  "payload": {
    "signature": "<tx_key>",
    "authorization": {
      "type": "monero-tx-proof",
      "txHash": "<tx_hash>",
      "txKey": "<tx_key>",
      "from": "4senderaddress...",
      "to": "4recipientaddress...",
      "amount": "1000000000000",
      "fee": "20000000",
      "asset": "XMR",
      "chainId": "mainnet",
      "validStart": 1709830000,
      "expiry": 1709830120
    }
  }
}
```

| Field                          | Description                                                         |
| ------------------------------ | ------------------------------------------------------------------- |
| `x402Version`                  | Protocol version. Must be `1`.                                      |
| `scheme`                       | Payment scheme identifier. Must be `exact`.                         |
| `network`                      | CAIP-2 network identifier matching the payment requirements.        |
| `payload.signature`            | The `tx_key` serving as cryptographic proof of payment.             |
| `payload.authorization.type`   | Authorization type. Must be `monero-tx-proof`.                      |
| `payload.authorization.txHash` | Transaction hash from the wallet RPC `transfer` response.           |
| `payload.authorization.txKey`  | Transaction key for cryptographic verification via `check_tx_key`.  |
| `payload.authorization.from`   | Sender's Monero address.                                            |
| `payload.authorization.to`     | Recipient's Monero address (must match `payToAddress`).             |
| `payload.authorization.amount` | Transfer amount in piconero.                                        |
| `payload.authorization.fee`    | Network fee paid in piconero.                                       |
| `payload.authorization.asset`  | Asset identifier. Must be `XMR`.                                    |
| `payload.authorization.chainId`| Chain identifier. Must be `mainnet`.                                |
| `payload.authorization.validStart` | Unix timestamp marking the start of validity.                   |
| `payload.authorization.expiry` | Unix timestamp after which the proof is no longer accepted.         |

## SettlementResponse

```json
{
  "success": true,
  "txHash": "<transaction-hash>",
  "network": "monero:mainnet"
}
```

| Field     | Description                                                    |
| --------- | -------------------------------------------------------------- |
| `success` | Boolean indicating whether settlement succeeded.              |
| `txHash`  | Transaction hash of the verified Monero transaction.          |
| `network` | CAIP-2 network identifier where the transaction was settled.  |

## Facilitator Verification Rules (MUST)

1. **Scheme and network match**: The `scheme` must be `exact` and `network` must be a supported Monero CAIP-2 identifier.
2. **Authorization type**: The `authorization.type` must be `monero-tx-proof`.
3. **Destination match**: The `authorization.to` must match the `payToAddress` from the payment requirements.
4. **Amount check**: The `authorization.amount` must be greater than or equal to `maxAmountRequired`.
5. **Expiry check**: The current time must be between `validStart` and `expiry`. Expired proofs are rejected.
6. **Replay protection**: The `txHash` must not have been previously settled by this facilitator.
7. **Cryptographic verification via `check_tx_key`**: The facilitator calls the Monero daemon RPC method `check_tx_key` with:
   - `txid`: the `txHash` from the authorization.
   - `tx_key`: the `txKey` from the authorization.
   - `address`: the `payToAddress` (recipient address).
   - The daemon cryptographically derives the one-time output keys using the `tx_key` and verifies how much was sent to the address.
8. **Received amount verification**: The `received` field returned by `check_tx_key` must be greater than or equal to `maxAmountRequired`.
9. **Confirmation check**: The `confirmations` field returned by `check_tx_key` should be checked. Zero confirmations indicates the transaction is in the mempool but not yet mined.
   - The facilitator may accept zero-confirmation transactions for low-value payments.
   - For higher-value payments, the facilitator may require one or more confirmations (~2 minutes per block).

## Settlement

1. **No broadcast needed**: The transaction was already broadcast by the client's wallet RPC. Verification IS settlement for Monero.
2. Call `check_tx_key` on the Monero daemon to cryptographically verify the payment amount at the destination.
3. Verify the received amount meets or exceeds the required amount.
4. Record the `txHash` as settled for replay protection.
5. Optionally wait for confirmations (~2 minutes per block) for higher-value payments.
6. Return the `SettlementResponse` to the resource server.

## Settlement Failure Modes

| Failure                    | Cause                                               | Outcome                                    |
| -------------------------- | --------------------------------------------------- | ------------------------------------------ |
| Invalid tx_key             | Incorrect or fabricated transaction key              | `check_tx_key` fails; reject payment       |
| Insufficient amount        | `received` less than `maxAmountRequired`             | Reject payment                             |
| Transaction not found      | `txHash` not in mempool or blockchain                | `check_tx_key` fails; reject payment       |
| Proof expired              | Current time past `expiry` timestamp                 | Reject payment, client must retry          |
| Duplicate txHash           | Replay of a previously settled payment               | Reject immediately                         |
| Daemon unreachable         | Monero daemon RPC unreachable                        | Retry or reject                            |
| Wrong destination          | tx_key proves payment to a different address         | `received` returns 0; reject payment       |

## Security Considerations

### Trust Model

| Party            | Trust Assumption                                                                |
| ---------------- | ------------------------------------------------------------------------------- |
| Client           | Trusts the facilitator to verify honestly and deliver the resource.             |
| Resource Server  | Trusts the facilitator's verification and settlement response.                  |
| Facilitator      | Trusts nothing; verifies payment cryptographically via daemon `check_tx_key`.   |

Unlike other x402 schemes, the Monero scheme does not require the facilitator to broadcast. The client broadcasts atomically via wallet RPC, and the facilitator only verifies. This eliminates the risk of a facilitator withholding a signed transaction.

### Replay Protection

The facilitator maintains a persistent set of settled `txHash` values. Any payload presenting a previously-seen `txHash` is rejected. The `expiry` timestamp provides a secondary time-bound constraint. On-chain, Monero's key image mechanism prevents double-spending at the protocol level.

### Address Format

Monero standard addresses are 95 characters starting with `4`. Subaddresses start with `8`. Integrated addresses (with embedded payment IDs) start with `4` and are 106 characters. The `check_tx_key` RPC works with standard and subaddresses.

### Double-Spend Risk

Since the client broadcasts before presenting the proof, the double-spend risk is borne by the facilitator only for zero-confirmation transactions. A client could broadcast a conflicting transaction with a higher fee. Requiring one confirmation (~2 minutes) eliminates this risk for the facilitator.

### Privacy

Monero is a privacy-focused cryptocurrency. The `tx_key` is the minimum disclosure needed to prove payment: it reveals the amount sent to the specific recipient address without exposing the sender's identity, other outputs, or other transaction details. The `tx_key` does not compromise sender privacy beyond confirming the specific payment.

## Differences from EVM Exact Scheme

| Aspect              | EVM Exact                          | XMR Exact                                      |
| ------------------- | ---------------------------------- | ---------------------------------------------- |
| Transaction model   | Account-based                      | UTXO-based (with ring signatures)              |
| Signing algorithm   | secp256k1 ECDSA                    | Ed25519 (via wallet RPC, not directly exposed) |
| Payload format      | ABI-encoded call data              | tx_hash + tx_key proof                         |
| Broadcast model     | Facilitator broadcasts             | Client broadcasts; facilitator verifies only   |
| Replay protection   | Nonce per account                  | Key images + txHash dedup                      |
| Fee model           | Gas price / EIP-1559               | Dynamic block size fee                         |
| Finality            | Block confirmation (~12s)          | Block confirmation (~2 min)                    |
| Address format      | 0x-prefixed hex (EIP-55)           | Base58 starting with `4` (95 chars)            |
| Smart contracts     | Yes (ERC-20 tokens)                | No (native XMR only)                           |
| Privacy             | Fully transparent                  | Private by default (ring sigs, stealth addrs)  |
| Verification method | Signature + state verification     | Daemon `check_tx_key` RPC                      |

## Reference Implementation

| Component    | Value                                        |
| ------------ | -------------------------------------------- |
| npm package  | `@erudite-intelligence/x402-xmr`             |
| GitHub       | Erudite Intelligence LLC                     |
| Facilitator  | x402 Facilitator with XMR scheme support     |

# Exact Payment Scheme for Zcash (Transparent) (`exact`)

## Scheme Name

`exact`

## Supported Networks

| Network        | CAIP-2 Identifier                          |
| -------------- | ------------------------------------------ |
| Zcash Mainnet  | `bip122:00040fe8ec8471911baa1db1266ea15d`  |

## Supported Assets

| Token | Asset Identifier | Decimals | Smallest Unit |
| ----- | ---------------- | -------- | ------------- |
| ZEC   | `ZEC`            | 8        | zatoshi       |

1 ZEC = 100,000,000 zatoshi.

**Important**: Only transparent addresses (t-addr) are supported. Shielded addresses (z-addr) are NOT supported because shielded transaction outputs cannot be independently verified without the recipient's viewing key.

## Protocol Flow

1. Client sends an HTTP request to a resource server protected by x402.
2. Resource server responds with `402 Payment Required` including `PaymentRequirements`.
3. Client parses the `PaymentRequirements` and identifies the `exact` scheme on Zcash.
4. Client selects UTXOs from its wallet sufficient to cover the required amount plus fees.
5. Client constructs a PSBT with legacy P2PKH inputs (no SegWit -- Zcash does not support SegWit).
6. Client adds a payment output to the facilitator's address for the exact required amount.
7. Client adds a change output back to its own address if applicable.
8. Client signs all inputs with secp256k1 ECDSA using `SIGHASH_ALL`.
9. Client finalizes the PSBT and extracts the raw transaction hex.
10. Client base64-encodes the raw transaction hex as the `signature` field.
11. Client constructs the `PaymentPayload` with the signature and authorization details.
12. Client sends the original HTTP request with the `PaymentPayload` in the `X-PAYMENT` header.
13. Resource server forwards the `PaymentPayload` to the facilitator for verification.
14. Facilitator verifies the transaction according to the verification rules defined below.
15. Resource server returns the requested resource to the client.

## PaymentRequirements

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "bip122:00040fe8ec8471911baa1db1266ea15d",
  "payToAddress": "t1exampleaddress...",
  "maxAmountRequired": "100000",
  "asset": "ZEC",
  "resource": "https://api.example.com/resource",
  "description": "Access to premium endpoint",
  "mimeType": "application/json",
  "outputSchema": null,
  "extra": null
}
```

| Field              | Description                                                                 |
| ------------------ | --------------------------------------------------------------------------- |
| `x402Version`      | Protocol version. Must be `1`.                                              |
| `scheme`           | Payment scheme identifier. Must be `exact`.                                 |
| `network`          | CAIP-2 network identifier for the Zcash network.                            |
| `payToAddress`     | Zcash transparent address (`t1...` P2PKH or `t3...` P2SH) to receive payment. |
| `maxAmountRequired`| Maximum payment amount in zatoshi.                                          |
| `asset`            | Asset identifier. Must be `ZEC`.                                            |
| `resource`         | The URL of the resource being paid for.                                     |
| `description`      | Human-readable description of the resource.                                 |
| `mimeType`         | MIME type of the resource response.                                         |
| `outputSchema`     | Optional JSON schema describing the response.                               |
| `extra`            | Optional additional metadata.                                               |

## PaymentPayload

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "bip122:00040fe8ec8471911baa1db1266ea15d",
  "payload": {
    "signature": "<base64-encoded-raw-tx-hex>",
    "authorization": {
      "type": "zcash-signed-transaction",
      "from": "t1senderaddress...",
      "to": "t1recipientaddress...",
      "amount": "100000",
      "asset": "ZEC",
      "chainId": "bip122:00040fe8ec8471911baa1db1266ea15d",
      "validStart": 1709830000,
      "expiry": 1709830120
    }
  }
}
```

| Field                            | Description                                                        |
| -------------------------------- | ------------------------------------------------------------------ |
| `x402Version`                    | Protocol version. Must be `1`.                                     |
| `scheme`                         | Payment scheme identifier. Must be `exact`.                        |
| `network`                        | CAIP-2 network identifier matching the payment requirements.       |
| `payload.signature`              | Base64-encoded raw transaction hex (the signed, serialized tx).    |
| `payload.authorization.type`     | Authorization type. Must be `zcash-signed-transaction`.            |
| `payload.authorization.from`     | Sender's Zcash transparent address.                                |
| `payload.authorization.to`       | Recipient's Zcash transparent address (must match `payToAddress`). |
| `payload.authorization.amount`   | Transfer amount in zatoshi.                                        |
| `payload.authorization.asset`    | Asset identifier. Must be `ZEC`.                                   |
| `payload.authorization.chainId`  | CAIP-2 chain identifier for the Zcash network.                     |
| `payload.authorization.validStart` | Unix timestamp marking the start of validity.                    |
| `payload.authorization.expiry`   | Unix timestamp after which the payment is no longer accepted.      |

## SettlementResponse

```json
{
  "success": true,
  "txid": "<transaction-id-hex>",
  "network": "bip122:00040fe8ec8471911baa1db1266ea15d"
}
```

| Field     | Description                                                    |
| --------- | -------------------------------------------------------------- |
| `success` | Boolean indicating whether settlement succeeded.              |
| `txid`    | Transaction ID of the broadcast transaction.                  |
| `network` | CAIP-2 network identifier where the transaction was settled.  |

## Facilitator Verification Rules (MUST)

1. **Scheme and network match**: The `scheme` must be `exact` and `network` must be the supported Zcash CAIP-2 identifier.
2. **Authorization type**: The `authorization.type` must be `zcash-signed-transaction`.
3. **Transaction decode**: The facilitator must:
   - Base64-decode the `signature` field to obtain the raw transaction hex.
   - Hex-decode the raw transaction into a Zcash Transaction object.
   - The transaction must parse without errors using Zcash-compatible network parameters.
4. **Recipient match**: At least one transaction output must pay to the `payToAddress` specified in the payment requirements.
   - The `authorization.to` must also match `payToAddress`.
5. **Amount match**: The output paying to `payToAddress` must have a value greater than or equal to `maxAmountRequired`.
   - The `authorization.amount` must also be consistent with the on-chain output value.
6. **Expiry check**: The current time must be between `validStart` and `expiry`. Expired authorizations are rejected.
7. **Replay protection**: The transaction hash (txid) must not have been previously settled by this facilitator.
8. **Balance verification**: The facilitator must verify the sender's UTXO balance via the Blockchair API to confirm sufficient funds.
9. **Output verification**: All outputs must be to transparent addresses (`t1...` or `t3...`). Any output to a shielded address causes rejection.
10. **Transparent address only**: Both sender (`from`) and recipient (`to`) must be transparent addresses. Shielded addresses are not supported.
11. **Fee check**: The implied fee (sum of inputs minus sum of outputs) must be reasonable. The default expected fee is 10,000 zatoshi.
12. **Dust limit**: All outputs must meet the minimum value. Zcash follows Bitcoin-derived dust rules for transparent outputs (546 zatoshi for P2PKH, 546 zatoshi for P2SH).

## Settlement

1. **Balance re-check**: Verify input UTXOs are still unspent via the Blockchair API immediately before broadcast.
2. Base64-decode the `signature` to obtain the raw transaction hex.
3. Broadcast the raw transaction via the Blockchair API (`POST /push/transaction` with the hex-encoded raw tx).
4. Record the `txid` as settled for replay protection.
5. Optionally wait for one or more confirmations (~75 seconds per block).
6. Return the `SettlementResponse` to the resource server.

## Settlement Failure Modes

| Failure                  | Cause                                            | Outcome                                    |
| ------------------------ | ------------------------------------------------ | ------------------------------------------ |
| UTXO already spent       | Input was consumed between verify and broadcast   | Reject payment, client must retry          |
| Insufficient fee         | Fee below network minimum                         | Transaction may not propagate; reject      |
| Duplicate txid           | Replay of a previously settled payment            | Reject immediately                         |
| Network timeout          | Blockchair API unreachable                        | Retry broadcast or reject                  |
| Invalid transaction      | Malformed raw tx hex                              | Reject payment                             |
| Shielded output          | Output to z-addr detected                         | Reject during verification                 |
| Authorization expired    | Current time past `expiry` timestamp              | Reject payment, client must retry          |
| Double-spend detected    | Conflicting transaction confirmed                 | Settlement fails, resource not delivered   |

## Security Considerations

### Trust Model

| Party            | Trust Assumption                                                        |
| ---------------- | ----------------------------------------------------------------------- |
| Client           | Trusts the facilitator to broadcast and not withhold the transaction.   |
| Resource Server  | Trusts the facilitator's verification and settlement response.          |
| Facilitator      | Trusts nothing; verifies transaction structure, outputs, and balances.  |

The facilitator holds a fully signed transaction between verification and settlement. The client must trust the facilitator to broadcast honestly. The authorization's `expiry` timestamp provides a time-bound constraint on how long the facilitator can hold the transaction.

### Replay Protection

The facilitator maintains a persistent set of settled `txid` values. Any payload presenting a previously-seen `txid` is rejected. UTXO single-spend provides on-chain replay protection: once an input is consumed, it cannot be spent again.

### Address Format

Zcash transparent addresses use a two-byte version prefix:
- `t1...`: P2PKH (version bytes `0x1cb8`)
- `t3...`: P2SH (version bytes `0x1cbd`)

Shielded addresses (`zs...` for Sapling, `u...` for unified) are NOT supported by this scheme. Only transparent addresses can be independently verified.

### Double-Spend Risk

Between verification and broadcast, a client could double-spend an input UTXO. The balance re-check in step 1 of Settlement mitigates but does not eliminate this race. Facilitators should minimize latency between verification and broadcast. The ~75-second block time means confirmation takes longer than EVM chains.

## Differences from EVM Exact Scheme

| Aspect              | EVM Exact                          | ZEC Exact                                      |
| ------------------- | ---------------------------------- | ---------------------------------------------- |
| Transaction model   | Account-based                      | UTXO-based (transparent only)                  |
| Signing algorithm   | secp256k1 ECDSA (Ethereum digest)  | secp256k1 ECDSA (Bitcoin-style sighash)        |
| Payload format      | ABI-encoded call data              | Base64-encoded raw transaction hex             |
| Replay protection   | Nonce per account                  | UTXO single-spend + txid dedup                 |
| Fee model           | Gas price / EIP-1559               | Fixed default fee (10,000 zatoshi)             |
| Finality            | Block confirmation (~12s)          | Block confirmation (~75s)                      |
| Address format      | 0x-prefixed hex (EIP-55)           | `t1...` (P2PKH) or `t3...` (P2SH)             |
| Smart contracts     | Yes (ERC-20 tokens)                | No (native ZEC transparent only)               |
| SegWit support      | N/A (account model)                | No (legacy P2PKH only)                         |
| Privacy features    | None (fully transparent)           | Available but NOT used (transparent only)       |
| API provider        | Ethereum RPC node                  | Blockchair API                                 |

## Reference Implementation

| Component    | Value                                        |
| ------------ | -------------------------------------------- |
| npm package  | `@erudite-intelligence/x402-zec`             |
| GitHub       | Erudite Intelligence LLC                     |
| Facilitator  | x402 Facilitator with ZEC scheme support     |

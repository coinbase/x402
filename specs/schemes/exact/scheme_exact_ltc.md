# Exact Payment Scheme for Litecoin (PSBT) (`exact`)

## Scheme Name

`exact`

## Supported Networks

| Network          | CAIP-2 Identifier                          |
| ---------------- | ------------------------------------------ |
| Litecoin Mainnet | `bip122:12a765e31ffd4059bada1e25190f6e98`  |
| Litecoin Testnet | `bip122:4966625a4b2851d9fdee139e56211a0d`  |

## Supported Assets

| Token | Asset Identifier | Decimals | Smallest Unit |
| ----- | ---------------- | -------- | ------------- |
| LTC   | `LTC`            | 8        | litoshi       |

1 LTC = 100,000,000 litoshi.

## Protocol Flow

1. Client sends an HTTP request to a resource server protected by x402.
2. Resource server responds with `402 Payment Required` including `PaymentRequirements`.
3. Client parses the `PaymentRequirements` and identifies the `exact` scheme on a Litecoin network.
4. Client selects UTXOs from its wallet sufficient to cover the required amount plus fees.
5. Client constructs a PSBT (BIP-174) with P2WPKH inputs spending the selected UTXOs.
6. Client adds a payment output to the facilitator's address for the exact required amount.
7. Client adds a change output back to its own address if applicable.
8. Client signs all inputs with secp256k1 ECDSA using `SIGHASH_ALL`.
9. Client finalizes the PSBT.
10. Client constructs the `PaymentPayload` containing the base64-encoded PSBT, txid, sender address, and network.
11. Client re-sends the original HTTP request with the `PaymentPayload` in the `X-PAYMENT` header.
12. Resource server forwards the `PaymentPayload` to the facilitator for verification.
13. Facilitator verifies the PSBT according to the verification rules defined below.
14. If verification passes, facilitator settles the transaction by broadcasting the extracted raw transaction.
15. Resource server returns the requested resource to the client.

## PaymentRequirements

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "bip122:12a765e31ffd4059bada1e25190f6e98",
  "payToAddress": "ltc1qexampleaddress...",
  "maxAmountRequired": "100000",
  "asset": "LTC",
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
| `network`          | CAIP-2 network identifier for the Litecoin network.                         |
| `payToAddress`     | Litecoin address to receive payment (`ltc1q...` bech32 or `L...` legacy).   |
| `maxAmountRequired`| Maximum payment amount in litoshi.                                          |
| `asset`            | Asset identifier. Must be `LTC`.                                            |
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
  "network": "bip122:12a765e31ffd4059bada1e25190f6e98",
  "payload": {
    "psbt": "<base64-encoded-PSBT>",
    "txid": "<transaction-id-hex>",
    "from": "ltc1qsenderaddress...",
    "network": "bip122:12a765e31ffd4059bada1e25190f6e98"
  }
}
```

| Field              | Description                                                                 |
| ------------------ | --------------------------------------------------------------------------- |
| `x402Version`      | Protocol version. Must be `1`.                                              |
| `scheme`           | Payment scheme identifier. Must be `exact`.                                 |
| `network`          | CAIP-2 network identifier matching the payment requirements.                |
| `payload.psbt`     | Base64-encoded PSBT containing the signed transaction.                      |
| `payload.txid`     | Transaction ID (hex) derived from the finalized transaction.                |
| `payload.from`     | Sender's Litecoin address.                                                  |
| `payload.network`  | CAIP-2 network identifier (repeated for payload-level validation).          |

## SettlementResponse

```json
{
  "success": true,
  "txid": "<transaction-id-hex>",
  "network": "bip122:12a765e31ffd4059bada1e25190f6e98"
}
```

| Field     | Description                                                    |
| --------- | -------------------------------------------------------------- |
| `success` | Boolean indicating whether settlement succeeded.              |
| `txid`    | Transaction ID of the broadcast transaction.                  |
| `network` | CAIP-2 network identifier where the transaction was settled.  |

## Facilitator Verification Rules (MUST)

1. **PSBT magic bytes**: The decoded PSBT must begin with the correct magic bytes (`0x70736274ff`).
2. **Signature completeness**: Every input in the PSBT must contain a valid partial signature.
   - Each `partialSig` entry must be present and non-empty.
3. **Cryptographic signature verification**: For each input, the facilitator must:
   - DER-decode the signature and extract `(r, s)` components.
   - Enforce Low-S canonicality (BIP-62/BIP-146): `s` must be at most half the secp256k1 curve order.
   - Compute the BIP-143 sighash for the input (SegWit digest algorithm).
   - Verify the ECDSA signature against the public key provided in `partialSig`.
   - HASH160 the public key and confirm it matches the P2WPKH witness program of the input's `witnessUtxo`.
   - Enforce CLEANSTACK: no extraneous data in the witness beyond `<signature> <pubkey>`.
4. **Payment output match**: At least one output must pay exactly the required amount to the `payToAddress`.
5. **Duplicate input detection**: No two inputs may reference the same `txid:vout` pair.
6. **Amount conservation**: The sum of all input values must equal or exceed the sum of all output values. The difference is the miner fee.
7. **Fee adequacy**: The implied fee rate must be between 1 and 1000 litoshi/vByte (inclusive).
8. **Timelock**: `nLockTime` must be `0` and all input sequences must not enable relative timelocks.
9. **Transaction weight**: The finalized transaction weight must not exceed 400,000 weight units.
10. **Dust limits**: Every output must meet the minimum dust threshold for its script type:
    - P2WPKH: 294 litoshi
    - P2PKH: 546 litoshi
    - P2SH: 546 litoshi
    - P2WSH: 330 litoshi
    - P2TR: 330 litoshi
11. **UTXO on-chain verification**: Each input's referenced UTXO must be verified on-chain:
    - The UTXO value must match the `witnessUtxo` value declared in the PSBT.
    - The UTXO script must match the `witnessUtxo` script declared in the PSBT.
12. **Replay protection**: The `txid` must not have been previously settled by this facilitator.

## Settlement

1. **Balance re-check**: Verify all input UTXOs are still unspent on-chain immediately before broadcast.
2. Extract the fully signed raw transaction from the finalized PSBT.
3. Broadcast the raw transaction via the litecoinspace.org API (`POST /api/tx`).
4. Record the `txid` as settled for replay protection.
5. Optionally wait for one or more confirmations (~2.5 minutes per block).
6. Return the `SettlementResponse` to the resource server.

## Settlement Failure Modes

| Failure                  | Cause                                          | Outcome                                    |
| ------------------------ | ---------------------------------------------- | ------------------------------------------ |
| UTXO already spent       | Input was consumed between verify and broadcast | Reject payment, client must retry          |
| Insufficient fee         | Fee rate below network minimum                  | Transaction may not propagate; reject      |
| Duplicate txid           | Replay of a previously settled payment          | Reject immediately                         |
| Network timeout          | litecoinspace.org API unreachable               | Retry broadcast or reject                  |
| Invalid transaction      | Malformed raw tx extracted from PSBT            | Reject payment                             |
| Dust output              | Output below dust threshold                     | Reject during verification                 |
| Double-spend detected    | Conflicting transaction confirmed               | Settlement fails, resource not delivered   |

## Security Considerations

### Trust Model

| Party            | Trust Assumption                                                        |
| ---------------- | ----------------------------------------------------------------------- |
| Client           | Trusts the facilitator to broadcast and not withhold the transaction.   |
| Resource Server  | Trusts the facilitator's verification and settlement response.          |
| Facilitator      | Trusts nothing; verifies all signatures and UTXOs cryptographically.    |

The facilitator holds a fully signed transaction between verification and settlement. The client must trust the facilitator to broadcast honestly. The PSBT is non-revocable once broadcast.

### Replay Protection

The facilitator maintains a persistent set of settled `txid` values. Any payload presenting a previously-seen `txid` is rejected. This is the sole replay protection mechanism; Litecoin UTXOs are inherently single-spend.

### Address Format

Litecoin uses bech32 addresses with HRP `ltc` for native SegWit (P2WPKH: `ltc1q...`). Legacy addresses start with `L` (P2PKH, version byte `0x30`) or `M`/`3` (P2SH, version byte `0x05`). The WIF prefix is `0xb0`.

### Double-Spend Risk

Between PSBT verification and broadcast, a client could double-spend an input UTXO. The balance re-check in step 1 of Settlement mitigates but does not eliminate this race. Facilitators should minimize latency between verification and broadcast.

## Differences from EVM Exact Scheme

| Aspect              | EVM Exact                          | LTC Exact                                     |
| ------------------- | ---------------------------------- | --------------------------------------------- |
| Transaction model   | Account-based                      | UTXO-based                                    |
| Signing algorithm   | secp256k1 ECDSA (Ethereum digest)  | secp256k1 ECDSA (BIP-143 sighash)             |
| Payload format      | ABI-encoded call data              | Base64-encoded PSBT (BIP-174)                 |
| Replay protection   | Nonce per account                  | UTXO single-spend + txid dedup                |
| Fee model           | Gas price / EIP-1559               | litoshi/vByte fee rate                         |
| Finality            | Block confirmation (~12s)          | Block confirmation (~2.5 min)                  |
| Address format      | 0x-prefixed hex (EIP-55)           | bech32 `ltc1q...` or legacy `L...`            |
| Smart contracts     | Yes (ERC-20 tokens)                | No (native LTC only)                          |
| Dust limits         | Not applicable                     | Script-type dependent (294-546 litoshi)        |
| Weight limit        | Block gas limit                    | 400,000 weight units per tx                    |

## Reference Implementation

| Component    | Value                                        |
| ------------ | -------------------------------------------- |
| npm package  | `@erudite-intelligence/x402-ltc`             |
| GitHub       | Erudite Intelligence LLC                     |
| Facilitator  | x402 Facilitator with LTC scheme support     |

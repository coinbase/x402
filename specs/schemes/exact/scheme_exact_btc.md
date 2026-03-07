# Exact Payment Scheme for Bitcoin (UTXO/PSBT) (`exact`)

This document specifies the `exact` payment scheme for the x402 protocol on Bitcoin networks. This scheme facilitates payments of a specific amount of native BTC on the Bitcoin blockchain using Partially Signed Bitcoin Transactions (PSBTs).

## Scheme Name

`exact`

## Supported Networks

| Network | CAIP-2 Identifier |
| ------- | ----------------- |
| Bitcoin Mainnet | `bip122:000000000019d6689c085ae165831e93` |
| Bitcoin Testnet | `bip122:000000000933ea01ad0ee984209779ba` |
| Bitcoin Signet | `bip122:00000008819873e925422c1ff0f99f7c` |

Wildcard: `bip122:*` matches all Bitcoin networks (note: the facilitator MUST still verify the specific genesis hash prefix to avoid cross-chain replay).

## Supported Assets

| Token | Asset Identifier | Decimals | Smallest Unit |
| ----- | ---------------- | -------- | ------------- |
| BTC | `btc` | 8 | satoshi |

## Protocol Flow

The protocol flow for `exact` on Bitcoin is client-driven:

1. Client makes an HTTP request to a Resource Server.
2. Resource Server responds with a `402 Payment Required` status containing `PaymentRequirements` with an `accepts` array that includes the `exact` scheme on a `bip122:*` network.
3. Client reads the `PaymentRequirements`, noting the `asset`, `amount`, `payTo`, and `maxTimeoutSeconds`.
4. Client fetches available UTXOs for their address from a block explorer API (e.g., Blockstream, Mempool.space).
5. Client constructs a PSBT with inputs from their UTXOs and an output paying `amount` satoshis to the `payTo` address. A change output is added if necessary (above the 294-satoshi P2WPKH dust limit).
6. Client signs all inputs using their secp256k1 private key via P2WPKH (native SegWit) with `SIGHASH_ALL` (0x01). The PSBT is finalized with `finalizeAllInputs()`.
7. The client does NOT broadcast the transaction. The finalized PSBT is passed to the facilitator via the payment payload.
8. Client constructs the `PaymentPayload` containing the base64-encoded PSBT, the computed `txid`, and the payer's address, base64-encodes it, and sends it in the `X-PAYMENT` header with the original HTTP request.
9. Resource Server receives the request and forwards the `PaymentPayload` and `PaymentRequirements` to a Facilitator's `/verify` endpoint.
10. Facilitator performs all verification checks (see Facilitator Verification Rules below).
11. If verification passes, Facilitator returns `{ "isValid": true }` to the Resource Server.
12. Resource Server serves the requested resource to the Client.
13. Resource Server (or Facilitator) calls the Facilitator's `/settle` endpoint.
14. Facilitator extracts the final transaction from the PSBT and broadcasts the raw transaction hex to the Bitcoin network via a block explorer API.
15. Facilitator returns the `SettlementResponse` containing the on-chain transaction ID.

## PaymentRequirements

```json
{
  "scheme": "exact",
  "network": "bip122:000000000019d6689c085ae165831e93",
  "amount": "100000",
  "asset": "btc",
  "payTo": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  "maxTimeoutSeconds": 300,
  "extra": {
    "suggestedFeeRate": 10
  }
}
```

- **`scheme`**: MUST be `"exact"`.
- **`network`**: A CAIP-2 identifier for the Bitcoin network. Uses BIP-122 namespace with the first 32 hex characters of the genesis block hash.
- **`amount`**: The amount to be transferred in satoshis as a string. `"100000"` = 0.001 BTC.
- **`asset`**: MUST be `"btc"` for native Bitcoin payments.
- **`payTo`**: The Bitcoin address (bech32 `bc1q...` for P2WPKH) of the resource server receiving the funds.
- **`maxTimeoutSeconds`**: Maximum time in seconds the payment authorization remains valid. Default: 300 (5 minutes).
- **`extra.suggestedFeeRate`**: Optional suggested fee rate in sat/vB (informational).

## PaymentPayload

```json
{
  "x402Version": 2,
  "scheme": "exact",
  "network": "bip122:000000000019d6689c085ae165831e93",
  "payload": {
    "psbt": "cHNidP8BAH0CAAAA...<base64-encoded finalized PSBT>...",
    "txid": "a1b2c3d4e5f6...",
    "from": "bc1qpayeraddress..."
  }
}
```

### Payload Fields

- **`psbt`**: Base64-encoded finalized PSBT. MUST begin with the PSBT magic bytes (`70736274ff` hex). All inputs MUST be fully signed with `finalScriptWitness` (P2WPKH) present. The facilitator extracts the final transaction from this PSBT for verification and broadcast.
- **`txid`**: The computed transaction ID (double-SHA256 of the serialized transaction, byte-reversed). Used for replay protection and cross-check.
- **`from`**: The payer's Bitcoin address (bech32 P2WPKH format). Used for informational purposes and UTXO ownership verification.

## SettlementResponse

```json
{
  "success": true,
  "transaction": "a1b2c3d4e5f6...",
  "network": "bip122:000000000019d6689c085ae165831e93",
  "payer": "bc1qpayeraddress..."
}
```

- **`transaction`**: The Bitcoin transaction ID (txid) of the broadcast transaction.
- **`payer`**: The Bitcoin address of the client that signed the transaction.

## Facilitator Verification Rules (MUST)

A facilitator verifying an `exact`-scheme Bitcoin payment MUST enforce all of the following checks before broadcasting the transaction.

**Authoritative data source**: The finalized PSBT contains both the unsigned transaction structure (via `globalMap.unsignedTx`) and the signed witness data. All field extractions — including output addresses, output values, input outpoints, and signatures — MUST be derived from the extracted transaction after `psbt.extractTransaction()`. The `from` field in the payload is informational only and MUST NOT be trusted for verification purposes.

### 1. PSBT Format Validity

- The payload MUST contain a `psbt` field that is a valid base64 string.
- The decoded bytes MUST begin with the PSBT magic bytes (`70736274ff`).
- The PSBT MUST parse successfully with the correct network parameters.
- The PSBT MUST contain transaction data in `globalMap.unsignedTx`.

### 2. Signature Completeness and Cryptographic Verification

- Every input MUST have either `finalScriptSig` or `finalScriptWitness` present.
- The PSBT MUST successfully extract a final transaction via `extractTransaction()`.
- For each input, the facilitator MUST perform full cryptographic signature verification:
  - The witness stack MUST contain exactly 2 items `[signature, pubkey]` (P2WPKH CLEANSTACK rule).
  - The public key MUST be a valid compressed (33-byte) or uncompressed (65-byte) secp256k1 key.
  - `HASH160(pubkey)` MUST match the 20-byte hash in the `witnessUtxo` script (`OP_0 <20-byte-hash>`).
  - Only P2WPKH scripts are supported (script length 22, `OP_0 0x14`).
  - The signature hash type MUST be `SIGHASH_ALL` (0x01). `SIGHASH_NONE`, `SIGHASH_SINGLE`, and `SIGHASH_ANYONECANPAY` are rejected because they allow output modification.
  - The DER-encoded signature MUST be decoded to raw R||S format and verified against the BIP-143 sighash for witness v0.
  - Signature verification MUST use `strict=true` to enforce the BIP-146 Low-S rule.
- The computed `txid` MUST match the `txid` in the payment payload (if provided).

### 3. Payment Output Verification

- The transaction MUST contain an output paying exactly `amount` satoshis to the `payTo` address from `PaymentRequirements`.
- The output address is derived from the output script using the correct network parameters.
- The facilitator MUST scan ALL outputs for the exact `(address, value)` match, not just the first output.

### 4. UTXO Existence and Value Verification

- For each input, the facilitator MUST query the Bitcoin network to verify:
  - The referenced UTXO (`txid:vout`) exists and is unspent.
  - The on-chain UTXO value matches the `witnessUtxo.value` in the PSBT (prevents "Phantom Funds" input value spoofing).
  - The on-chain `scriptPubKey` matches the `witnessUtxo.script` in the PSBT (prevents "Script Spoofing" where an attacker references someone else's UTXO).
- If the API is unreachable, the facilitator MUST reject the payment (fail-closed). `allowOfflineVerification` MAY be set for testing only.

### 5. Duplicate Input Detection

- The facilitator MUST reject transactions with duplicate input outpoints (`txid:vout`). A PSBT listing the same UTXO twice would double-count input value. The network rejects duplicate inputs, but the facilitator would have already released the resource.

### 6. Amount Conservation

- Total input value (sum of all `witnessUtxo.value`) MUST be greater than or equal to total output value.
- The difference (miner fee) MUST be positive.

### 7. Miner Fee Adequacy

- The fee rate (total fee / transaction virtual size) MUST be at least `MIN_FEE_RATE` (default: 1 sat/vB).
- The fee rate MUST NOT exceed `MAX_FEE_RATE` (default: 1000 sat/vB) to protect against client error.

### 8. Timelock Checks

- `nLockTime` MUST be 0. Any non-zero locktime (whether timestamp or block height) is rejected for immediate x402 payments.
- No input may have an active BIP-68 relative timelock (bit 31 clear AND lower 31 bits non-zero). `sequence=0` is allowed (no actual lock). `sequence=0xffffffff` or `0xfffffffe` disables BIP-68.

### 9. Transaction Size

- Transaction weight MUST NOT exceed 400,000 weight units (Bitcoin Core default `MAX_STANDARD_TX_WEIGHT`).

### 10. Network Match

- The `network` field in the `PaymentPayload` MUST match the `network` in the `PaymentRequirements`.
- The network MUST be a recognized CAIP-2 Bitcoin identifier.

### 11. Dust Output Check

- No output (except `OP_RETURN` data carriers) may have a value below the applicable dust limit:
  - P2PKH: 546 sats
  - P2SH: 546 sats
  - P2WPKH: 294 sats
  - P2WSH: 330 sats
  - P2TR: 330 sats

### 12. Replay Protection

- The facilitator MUST maintain a set of recently seen `txid` values and reject any payment whose `txid` has already been processed.
- The replay protection window SHOULD be at least as long as `maxTimeoutSeconds`.

### 13. Scheme Match

- The `scheme` field MUST be `"exact"`.

### 14. Amount Consistency

- The `amount` in `PaymentPayload.accepted` (if present) MUST match the `amount` in the original `PaymentRequirements`.

## Settlement

Upon settlement, the facilitator:

1. **Re-verifies UTXO status** — The facilitator SHOULD re-query UTXO spent status immediately before broadcasting to detect double-spends since verification. If any input UTXO is now spent, the facilitator MUST return an error and MUST NOT broadcast.
2. **Extracts the final transaction** from the PSBT via `extractTransaction()` and serializes it to hex.
3. **Broadcasts the raw transaction** to the Bitcoin network via a block explorer API (Blockstream or Mempool.space).
4. **Waits for confirmation** — Recommended: at least 1 confirmation for low-value payments, 6 confirmations for high-value.
5. **Returns the SettlementResponse** with the on-chain `txid`.

The facilitator pays no Bitcoin fees — the miner fee is embedded in the client's PSBT (difference between total inputs and total outputs). The resource server does not need BTC.

## Settlement Failure Modes

| Failure | Cause | Outcome |
| ------- | ----- | ------- |
| UTXO already spent | Client spent funds between verify and settle | Transaction rejected by network. No funds move. No resource served. Fails closed. |
| Fee too low for mempool | Fee rate dropped below minimum relay fee | Transaction rejected by nodes. No funds move. Can retry with higher fee. |
| Transaction too large | PSBT exceeds max standard weight | Transaction rejected by nodes. No funds move. |
| Network error | Block explorer API unavailable | Facilitator retries or returns settlement failure. Transaction may be safe to retry. |

## Security Considerations

### Trust Model

The Bitcoin exact scheme provides strong trust-minimization guarantees through two properties inherent to Bitcoin's UTXO transaction model:

**Recipient Lock (Signed Outputs).** The destination address is embedded in the transaction's output script. The recipient cannot be changed without invalidating all input signatures (because `SIGHASH_ALL` commits to all outputs). Even within the valid window, the facilitator can only broadcast the transaction as constructed — it cannot redirect funds.

**Amount Lock (Signed Outputs).** The exact satoshi amount in each output is committed by the `SIGHASH_ALL` signature. The facilitator cannot alter the payment amount without breaking the signature.

| Property | Guarantee |
| -------- | --------- |
| Recipient | Locked by SIGHASH_ALL — facilitator cannot redirect funds |
| Amount | Locked by SIGHASH_ALL — facilitator cannot alter the transfer value |
| Timing | Bounded by nLockTime=0 — facilitator cannot hold beyond mempool eviction (~2 weeks default) |
| Scope | Fixed UTXO set — facilitator cannot add inputs or outputs |
| Gas | Embedded in transaction — client pays miner fee via input/output difference |

The Bitcoin scheme requires the client to construct and sign a complete PSBT. The facilitator holds this fully-formed signed transaction between verification and settlement. Unlike the EVM exact scheme that uses delegated authorization (ERC-3009 `transferWithAuthorization`), Bitcoin transactions are direct UTXO spends — the signature authorizes the specific input-output mapping. The facilitator has exactly two options: broadcast the transaction as-is, or discard it.

### Replay Protection

Bitcoin transactions are uniquely identified by their `txid` (double-SHA256 of the serialized transaction, byte-reversed). Once broadcast and confirmed, the network rejects duplicate transactions. Facilitators MUST additionally maintain an in-memory or persistent set of processed `txid` values to prevent replay at the application layer before broadcast.

### Address Format

Bitcoin addresses use several formats:
- **P2WPKH** (native SegWit v0): `bc1q...` — bech32 encoding, 42 characters. This is the primary format supported by x402-btc.
- **P2PKH** (legacy): `1...` — base58check encoding.
- **P2SH** (script hash): `3...` — base58check encoding.
- **P2TR** (Taproot): `bc1p...` — bech32m encoding.

Implementations MUST validate address format and network prefix before processing.

### Double-Spend Risk

Because the client signs a complete UTXO transaction, the client could theoretically broadcast it themselves or spend the same UTXOs elsewhere between verification and settlement. Facilitators SHOULD minimize the time between verification and settlement. The facilitator SHOULD re-query UTXO spent status immediately before broadcasting (see Settlement step 1). If the broadcast fails because inputs are already spent, no funds move, no resource is served. The system fails closed.

### UTXO Value Trust

The facilitator MUST NOT trust the `witnessUtxo.value` in the PSBT without verifying against the blockchain. A malicious client can set arbitrary values in the PSBT's `witnessUtxo` field, causing the facilitator to compute an incorrect sighash. While the resulting transaction would fail on broadcast (the network validates against actual UTXOs), the facilitator might incorrectly approve verification. The facilitator MUST query on-chain UTXO values and compare against the PSBT values.

### Transaction Malleability

Bitcoin SegWit (P2WPKH) transactions are not subject to third-party malleability because the `txid` is computed from the non-witness portion of the transaction. The facilitator MUST use the `txid` from the extracted transaction (not a client-supplied value) for replay protection.

## Differences from EVM Exact Scheme

| Feature | EVM (`eip155:*`) | Bitcoin (`bip122:*`) |
| ------- | ---------------- | -------------------- |
| Transaction model | Account-based | UTXO-based |
| Meta-transactions | EIP-3009 `transferWithAuthorization` | Signed PSBT (not broadcast by client) |
| Gas model | ETH gas fees (paid by facilitator) | Miner fee embedded in transaction (paid by client) |
| Signing | EIP-712 typed data | secp256k1 ECDSA over BIP-143 sighash (SIGHASH_ALL) |
| Address format | 0x-prefixed hex (20 bytes) | bech32 P2WPKH (`bc1q...`, variable length) |
| Block time | ~2s (Base L2) | ~10 minutes |
| Primary asset | USDC (ERC-20) | BTC (native) |
| Replay protection | Nonce-based (EIP-3009) | UTXO-based (each UTXO spent once) + txid tracking |
| Authoritative tx data | EIP-712 typed struct | Finalized PSBT extracted transaction |

## Reference Implementation

| Component | Location |
| --------- | -------- |
| npm package | [`@erudite-intelligence/x402-btc`](https://www.npmjs.com/package/@erudite-intelligence/x402-btc) |
| GitHub | [EruditeIntelligence/x402-btc](https://github.com/EruditeIntelligence/x402-btc) |
| Facilitator | Erudite Intelligence LLC (FinCEN-registered MSB #31000283503553) |

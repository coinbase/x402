# Exact Payment Scheme for Dogecoin (UTXO/P2PKH) (`exact`)

This document specifies the `exact` payment scheme for the x402 protocol on the Dogecoin network. This scheme facilitates payments of a specific amount of native DOGE using signed raw transactions with legacy P2PKH inputs.

## Scheme Name

`exact`

## Supported Networks

| Network | CAIP-2 Identifier |
| ------- | ----------------- |
| Dogecoin Mainnet | `bip122:1a91e3dace36e2be3bf030a65679fe8` |
| Dogecoin Testnet | `bip122:bb0a78264637406b6360aad926284d54` |

Wildcard: `bip122:*` matches all BIP-122 networks (note: the facilitator MUST still verify the specific genesis hash prefix to avoid cross-chain replay with Bitcoin or Litecoin).

## Supported Assets

| Token | Asset Identifier | Decimals | Smallest Unit |
| ----- | ---------------- | -------- | ------------- |
| DOGE | `doge` | 8 | koinu |

1 DOGE = 100,000,000 koinu (also called "satoshi" in Dogecoin's context).

## Protocol Flow

The protocol flow for `exact` on Dogecoin is client-driven:

1. Client makes an HTTP request to a Resource Server.
2. Resource Server responds with a `402 Payment Required` status containing `PaymentRequirements` with an `accepts` array that includes the `exact` scheme on a `bip122:*` network.
3. Client reads the `PaymentRequirements`, noting the `asset`, `amount`, `payTo`, and `maxTimeoutSeconds`.
4. Client fetches available UTXOs for their address from a block explorer API.
5. Client constructs a raw transaction with inputs from their UTXOs and an output paying `amount` koinu to the `payTo` address. A change output is added if necessary (above the dust limit). Dogecoin uses legacy P2PKH only — SegWit is not supported.
6. Client signs all inputs using their secp256k1 private key with `SIGHASH_ALL` (0x01).
7. The client does NOT broadcast the transaction. The signed raw transaction is passed to the facilitator via the payment payload.
8. Client constructs the `PaymentPayload` containing the hex-encoded raw transaction, the computed `txid`, and the payer's address, base64-encodes it, and sends it in the `X-PAYMENT` header with the original HTTP request.
9. Resource Server receives the request and forwards the `PaymentPayload` and `PaymentRequirements` to a Facilitator's `/verify` endpoint.
10. Facilitator performs all verification checks (see Facilitator Verification Rules below).
11. If verification passes, Facilitator returns `{ "isValid": true }` to the Resource Server.
12. Resource Server serves the requested resource to the Client.
13. Resource Server (or Facilitator) calls the Facilitator's `/settle` endpoint.
14. Facilitator broadcasts the raw transaction hex to the Dogecoin network via a block explorer API.
15. Facilitator returns the `SettlementResponse` containing the on-chain transaction ID.

## PaymentRequirements

```json
{
  "scheme": "exact",
  "network": "bip122:1a91e3dace36e2be3bf030a65679fe8",
  "amount": "500000000",
  "asset": "doge",
  "payTo": "DPayerDogeAddress...",
  "maxTimeoutSeconds": 300,
  "extra": {
    "suggestedFeeRate": 100
  }
}
```

- **`scheme`**: MUST be `"exact"`.
- **`network`**: A CAIP-2 identifier for the Dogecoin network. Uses BIP-122 namespace with the first 32 hex characters of the genesis block hash.
- **`amount`**: The amount to be transferred in koinu as a string. `"500000000"` = 5 DOGE.
- **`asset`**: MUST be `"doge"` for native Dogecoin payments.
- **`payTo`**: The Dogecoin address (base58check `D...` for P2PKH mainnet) of the resource server receiving the funds.
- **`maxTimeoutSeconds`**: Maximum time in seconds the payment authorization remains valid.

## PaymentPayload

```json
{
  "x402Version": 2,
  "scheme": "exact",
  "network": "bip122:1a91e3dace36e2be3bf030a65679fe8",
  "payload": {
    "rawTransaction": "0100000001abcdef...",
    "txid": "a1b2c3d4e5f6...",
    "from": "DPayerDogeAddress..."
  }
}
```

### Payload Fields

- **`rawTransaction`**: Hex-encoded signed raw Dogecoin transaction. Uses legacy P2PKH format (no SegWit witness data). The facilitator decodes this to verify outputs, signatures, and amounts.
- **`txid`**: The computed transaction ID (double-SHA256 of the serialized transaction, byte-reversed). Used for replay protection.
- **`from`**: The payer's Dogecoin address (base58check P2PKH format). Used for informational purposes and UTXO ownership verification.

## SettlementResponse

```json
{
  "success": true,
  "transaction": "a1b2c3d4e5f6...",
  "network": "bip122:1a91e3dace36e2be3bf030a65679fe8",
  "payer": "DPayerDogeAddress..."
}
```

- **`transaction`**: The Dogecoin transaction ID (txid) of the broadcast transaction.
- **`payer`**: The Dogecoin address of the client that signed the transaction.

## Facilitator Verification Rules (MUST)

A facilitator verifying an `exact`-scheme Dogecoin payment MUST enforce all of the following checks before broadcasting the transaction.

### 1. Transaction Format Validity

- The payload MUST contain a `rawTransaction` field that is a valid hex string.
- The hex MUST decode to a valid Dogecoin transaction.
- The transaction MUST use legacy P2PKH format (Dogecoin does not support SegWit).

### 2. Signature Verification

- Every input MUST have a valid `scriptSig` containing a DER-encoded ECDSA signature and compressed or uncompressed public key.
- The public key MUST hash (HASH160) to match the P2PKH address referenced by the input.
- The signature hash type MUST be `SIGHASH_ALL` (0x01).
- The ECDSA signature MUST be valid for the transaction sighash.

### 3. Payment Output Verification

- The transaction MUST contain an output paying exactly `amount` koinu to the `payTo` address from `PaymentRequirements`.
- The facilitator MUST scan ALL outputs for the exact `(address, value)` match.

### 4. UTXO Existence and Value Verification

- For each input, the facilitator MUST query the Dogecoin network to verify the referenced UTXO exists and is unspent.
- The on-chain UTXO value MUST match the claimed input value.
- If the API is unreachable, the facilitator MUST reject the payment (fail-closed).

### 5. Duplicate Input Detection

- The facilitator MUST reject transactions with duplicate input outpoints (`txid:vout`).

### 6. Amount Conservation

- Total input value MUST be greater than or equal to total output value.
- The difference (miner fee) MUST be positive.

### 7. Miner Fee Adequacy

- The fee rate MUST be at least the minimum relay fee (1 koinu/byte for Dogecoin).
- The fee rate MUST NOT exceed a safety maximum to protect against client error.

### 8. Timelock Checks

- `nLockTime` MUST be 0 for immediate x402 payments.

### 9. Transaction Size

- Transaction size MUST NOT exceed 100,000 bytes.

### 10. Network Match

- The `network` field in the `PaymentPayload` MUST match the `network` in the `PaymentRequirements`.
- The network MUST be a recognized CAIP-2 Dogecoin identifier.
- The facilitator MUST verify the genesis hash prefix to prevent cross-chain replay with Bitcoin or Litecoin.

### 11. Dust Output Check

- No output may have a value below the Dogecoin dust limit (100,000 koinu = 0.001 DOGE).

### 12. Replay Protection

- The facilitator MUST maintain a set of recently seen `txid` values and reject any payment whose `txid` has already been processed.

### 13. Scheme Match

- The `scheme` field MUST be `"exact"`.

### 14. Amount Consistency

- The `amount` in `PaymentPayload.accepted` (if present) MUST match the `amount` in the original `PaymentRequirements`.

## Settlement

Upon settlement, the facilitator:

1. **Re-verifies UTXO status** — The facilitator SHOULD re-query UTXO spent status immediately before broadcasting to detect double-spends since verification.
2. **Broadcasts the raw transaction** hex to the Dogecoin network via a block explorer API.
3. **Waits for confirmation** — Recommended: at least 1 confirmation for low-value payments (1-minute Dogecoin block time makes this fast).
4. **Returns the SettlementResponse** with the on-chain `txid`.

The facilitator pays no DOGE fees — the miner fee is embedded in the client's transaction (difference between total inputs and total outputs).

## Settlement Failure Modes

| Failure | Cause | Outcome |
| ------- | ----- | ------- |
| UTXO already spent | Client spent funds between verify and settle | Transaction rejected by network. No funds move. |
| Fee too low | Fee rate below minimum relay fee | Transaction rejected by nodes. |
| Transaction too large | Raw transaction exceeds max size | Transaction rejected by nodes. |
| Dust output | Output below Dogecoin dust limit | Transaction rejected by nodes. |
| Network error | Block explorer API unavailable | Facilitator retries or returns settlement failure. |

## Security Considerations

### Trust Model

The Dogecoin exact scheme provides strong trust-minimization guarantees through the signed transaction model:

**Recipient Lock (Signed Outputs).** The destination address is embedded in the transaction's output script. The recipient cannot be changed without invalidating all input signatures (because `SIGHASH_ALL` commits to all outputs).

**Amount Lock (Signed Outputs).** The exact koinu amount in each output is committed by the `SIGHASH_ALL` signature.

| Property | Guarantee |
| -------- | --------- |
| Recipient | Locked by SIGHASH_ALL — facilitator cannot redirect funds |
| Amount | Locked by SIGHASH_ALL — facilitator cannot alter the transfer value |
| Timing | Bounded by nLockTime=0 — facilitator cannot hold beyond mempool eviction |
| Scope | Fixed UTXO set — facilitator cannot add inputs or outputs |
| Gas | Embedded in transaction — client pays miner fee via input/output difference |

### Replay Protection

Dogecoin transactions are uniquely identified by their `txid`. Once broadcast and confirmed, the network rejects duplicate transactions. Facilitators MUST maintain an in-memory or persistent set of processed `txid` values. Because Dogecoin shares the BIP-122 namespace with Bitcoin and Litecoin, facilitators MUST verify the genesis hash prefix to prevent cross-chain replay attacks.

### Address Format

Dogecoin uses base58check-encoded addresses:
- **P2PKH**: `D...` (mainnet, version byte 0x1e)
- **P2SH**: `9...` or `A...` (mainnet, version byte 0x16)
- **Testnet P2PKH**: `n...` (version byte 0x71)

Dogecoin does NOT support SegWit (bech32) addresses. Implementations MUST validate address format and version byte before processing.

### Double-Spend Risk

Because the client signs a complete UTXO transaction, the client could spend the same UTXOs elsewhere between verification and settlement. Facilitators SHOULD minimize the time between verification and settlement. The 1-minute Dogecoin block time allows faster confirmation than Bitcoin.

### Transaction Malleability

Dogecoin P2PKH transactions are subject to third-party malleability because the `txid` includes the scriptSig (which can be malleated). Facilitators SHOULD track transactions by both `txid` and output patterns. However, this does not affect the payment guarantee — the outputs and amounts remain valid regardless of malleation.

## Differences from EVM Exact Scheme

| Feature | EVM (`eip155:*`) | Dogecoin (`bip122:*`) |
| ------- | ---------------- | --------------------- |
| Transaction model | Account-based | UTXO-based |
| Meta-transactions | EIP-3009 `transferWithAuthorization` | Signed raw transaction (P2PKH) |
| Gas model | ETH gas fees (paid by facilitator) | Miner fee embedded in transaction (paid by client) |
| Signing | EIP-712 typed data | secp256k1 ECDSA with SIGHASH_ALL |
| Address format | 0x-prefixed hex (20 bytes) | base58check `D...` (25 bytes) |
| Block time | ~2s (Base L2) | ~1 minute |
| Primary asset | USDC (ERC-20) | DOGE (native) |
| Replay protection | Nonce-based (EIP-3009) | UTXO-based + txid tracking |
| SegWit support | N/A (account model) | Not supported (legacy P2PKH only) |
| Transaction malleability | N/A | Possible (P2PKH scriptSig) |

## Reference Implementation

| Component | Location |
| --------- | -------- |
| npm package | [`@erudite-intelligence/x402-doge`](https://www.npmjs.com/package/@erudite-intelligence/x402-doge) |
| GitHub | [EruditeIntelligence/x402-doge](https://github.com/EruditeIntelligence/x402-doge) |
| Facilitator | Erudite Intelligence LLC (FinCEN-registered MSB #31000283503553) |

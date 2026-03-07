# Exact Payment Scheme for Cardano (CBOR/Ed25519) (`exact`)

This document specifies the `exact` payment scheme for the x402 protocol on Cardano networks. This scheme facilitates payments of a specific amount of native ADA using CBOR-serialized signed transactions.

## Scheme Name

`exact`

## Supported Networks

| Network | CAIP-2 Identifier |
| ------- | ----------------- |
| Cardano Mainnet | `cardano:764824073` |
| Cardano Preprod | `cardano:1` |
| Cardano Preview | `cardano:2` |

Wildcard: `cardano:*` matches all Cardano networks.

## Supported Assets

| Token | Asset Identifier | Decimals | Smallest Unit |
| ----- | ---------------- | -------- | ------------- |
| ADA | `ada` | 6 | lovelace |

1 ADA = 1,000,000 lovelace.

## Protocol Flow

The protocol flow for `exact` on Cardano is client-driven:

1. Client makes an HTTP request to a Resource Server.
2. Resource Server responds with a `402 Payment Required` status containing `PaymentRequirements` with an `accepts` array that includes the `exact` scheme on a `cardano:*` network.
3. Client reads the `PaymentRequirements`, noting the `asset`, `amount`, `payTo`, and `maxTimeoutSeconds`.
4. Client queries available UTXOs for their address via the Blockfrost API.
5. Client constructs a Cardano transaction using `@emurgo/cardano-serialization-lib-nodejs` (CardanoWasm) with an output paying `amount` lovelace to the `payTo` address. A change output is added for remaining funds.
6. Client signs the transaction body using their Ed25519 private key. The transaction is serialized to CBOR format and hex-encoded.
7. The client does NOT broadcast the transaction. The signed CBOR transaction is passed to the facilitator via the payment payload.
8. Client constructs the `PaymentPayload` containing the hex-encoded CBOR transaction, the transaction hash, and the payer's address, base64-encodes it, and sends it in the `X-PAYMENT` header with the original HTTP request.
9. Resource Server receives the request and forwards the `PaymentPayload` and `PaymentRequirements` to a Facilitator's `/verify` endpoint.
10. Facilitator performs all verification checks (see Facilitator Verification Rules below).
11. If verification passes, Facilitator returns `{ "isValid": true }` to the Resource Server.
12. Resource Server serves the requested resource to the Client.
13. Resource Server (or Facilitator) calls the Facilitator's `/settle` endpoint.
14. Facilitator submits the CBOR transaction to the Cardano network via the Blockfrost API's `/tx/submit` endpoint.
15. Facilitator returns the `SettlementResponse` containing the on-chain transaction hash.

## PaymentRequirements

```json
{
  "scheme": "exact",
  "network": "cardano:764824073",
  "amount": "2000000",
  "asset": "ada",
  "payTo": "addr1qx...",
  "maxTimeoutSeconds": 120,
  "extra": {
    "name": "ADA",
    "decimals": 6
  }
}
```

- **`scheme`**: MUST be `"exact"`.
- **`network`**: A CAIP-2 identifier for the Cardano network. Uses the network magic number.
- **`amount`**: The amount to be transferred in lovelace as a string. `"2000000"` = 2 ADA.
- **`asset`**: MUST be `"ada"` for native ADA payments.
- **`payTo`**: The Cardano address (bech32 `addr1...` for mainnet) of the resource server receiving the funds.
- **`maxTimeoutSeconds`**: Maximum time in seconds the payment authorization remains valid.

## PaymentPayload

```json
{
  "x402Version": 2,
  "scheme": "exact",
  "network": "cardano:764824073",
  "payload": {
    "signedTransaction": "84a400...<hex-encoded CBOR>...",
    "txHash": "a1b2c3d4e5f6...",
    "from": "addr1qx..."
  }
}
```

### Payload Fields

- **`signedTransaction`**: Hex-encoded CBOR-serialized signed Cardano transaction. Contains the transaction body, witness set (with Ed25519 signature), and optional auxiliary data.
- **`txHash`**: The Blake2b-256 hash of the transaction body. Used for replay protection and tracking.
- **`from`**: The payer's Cardano address (bech32 format). Used for informational purposes and balance verification.

## SettlementResponse

```json
{
  "success": true,
  "transaction": "a1b2c3d4e5f6...",
  "network": "cardano:764824073",
  "payer": "addr1qx..."
}
```

- **`transaction`**: The Cardano transaction hash of the submitted transaction.
- **`payer`**: The Cardano address of the client that signed the transaction.

## Facilitator Verification Rules (MUST)

A facilitator verifying an `exact`-scheme Cardano payment MUST enforce all of the following checks before submitting the transaction.

### 1. Transaction Format Validity

- The payload MUST contain a `signedTransaction` field that is a valid hex string.
- The hex string MUST decode to valid CBOR.
- The CBOR MUST deserialize to a valid Cardano `Transaction` object with a body, witness set, and optional auxiliary data.

### 2. Signature Verification

- The witness set MUST contain at least one Ed25519 VKey witness.
- The signature MUST be valid for the transaction body hash.
- The verification key hash MUST match one of the input addresses' payment credential.

### 3. Payment Output Verification

- The transaction MUST contain an output paying at least `amount` lovelace to the `payTo` address from `PaymentRequirements`.
- The facilitator MUST scan ALL outputs for the matching `(address, value)` pair.
- The address comparison MUST use the bech32-encoded representation.

### 4. UTXO Existence Verification

- For each input, the facilitator SHOULD query the Blockfrost API to verify the referenced UTXO exists and is unspent.
- If the API is unreachable, the facilitator MUST reject the payment (fail-closed).

### 5. Sender Balance Verification

- The facilitator MUST verify the sender has sufficient ADA balance to cover the transaction amount plus fees.
- The facilitator SHOULD re-query balance immediately before broadcast (TOCTOU mitigation).

### 6. Transaction Fee Verification

- The transaction MUST include a valid fee in the transaction body.
- The fee MUST be sufficient for the transaction size (Cardano protocol parameters determine minimum fee).

### 7. TTL (Time-to-Live) Verification

- The transaction body SHOULD include a `ttl` (time-to-live) field specifying the last valid slot.
- The facilitator SHOULD verify the TTL has not been exceeded.

### 8. Replay Protection

- The facilitator MUST maintain a set of recently seen transaction hashes and reject any payment whose hash has already been processed.
- Cardano provides built-in UTXO-based replay protection (each UTXO can only be consumed once).

### 9. Network Match

- The `network` field in the `PaymentPayload` MUST match the `network` in the `PaymentRequirements`.
- The network MUST be a recognized CAIP-2 Cardano identifier.

### 10. Scheme Match

- The `scheme` field MUST be `"exact"`.

### 11. Minimum UTXO Value

- All outputs MUST meet the Cardano minimum UTXO value requirement (currently approximately 1 ADA for pure-ADA outputs).

## Settlement

Upon settlement, the facilitator:

1. **Re-verifies sender balance** — The facilitator SHOULD re-query the sender's ADA balance via Blockfrost immediately before submitting to detect double-spends since verification.
2. **Submits the CBOR transaction** to the Cardano network via the Blockfrost API's `/tx/submit` endpoint.
3. **Checks the submission result** — A successful submission returns the transaction hash.
4. **Waits for confirmation** — The facilitator SHOULD wait for the transaction to appear in a confirmed block (recommended: 1 block for low-value, 15+ blocks for high-value).
5. **Returns the SettlementResponse** with the transaction hash.

The facilitator pays no ADA fees — the fee is embedded in the signed transaction by the client.

## Settlement Failure Modes

| Failure | Cause | Outcome |
| ------- | ----- | ------- |
| UTXO already spent | Client spent funds between verify and settle | Transaction rejected by node. No funds move. |
| Fee too low | Transaction fee below protocol minimum | Transaction rejected by node. |
| TTL exceeded | Transaction slot validity expired | Transaction rejected. Client must sign new transaction. |
| Below min UTXO | Output below minimum ADA requirement | Transaction rejected by node. |
| Network error | Blockfrost API unavailable | Facilitator retries or returns settlement failure. |

## Security Considerations

### Trust Model

The Cardano exact scheme provides strong trust-minimization guarantees through the signed transaction model:

**Recipient Lock (Signed Outputs).** The destination address is embedded in the transaction output. The recipient cannot be changed without invalidating the Ed25519 signature.

**Amount Lock (Signed Outputs).** The exact lovelace amount in each output is committed by the signature. The facilitator cannot alter the payment amount.

| Property | Guarantee |
| -------- | --------- |
| Recipient | Locked by Ed25519 signature — facilitator cannot redirect funds |
| Amount | Locked by Ed25519 signature — facilitator cannot alter the transfer value |
| Timing | Bounded by TTL — transaction expires after a specific slot |
| Scope | Fixed UTXO set — facilitator cannot add inputs or outputs |
| Gas | Embedded in transaction — client pays fee via input/output difference |

### Replay Protection

Cardano transactions consume UTXOs, and each UTXO can only be consumed once. The transaction hash (Blake2b-256 of the transaction body) uniquely identifies the transaction. Facilitators MUST additionally maintain an in-memory or persistent set of processed transaction hashes for application-layer replay protection.

### Address Format

Cardano uses bech32-encoded addresses with the following prefixes:
- **Mainnet**: `addr1...` (base addresses with staking credential)
- **Testnet**: `addr_test1...`
- **Enterprise**: `addr1...` (without staking credential)

Implementations MUST validate address format and network prefix before processing.

### Double-Spend Risk

Because the client signs a complete UTXO transaction, they could theoretically spend the same UTXOs elsewhere between verification and settlement. Facilitators SHOULD minimize the time between verification and settlement. The facilitator SHOULD re-query UTXO status before submitting. If submission fails, no funds move. The system fails closed.

## Differences from EVM Exact Scheme

| Feature | EVM (`eip155:*`) | Cardano (`cardano:*`) |
| ------- | ---------------- | --------------------- |
| Transaction model | Account-based (ERC-20) | Extended UTXO (eUTXO) |
| Meta-transactions | EIP-3009 `transferWithAuthorization` | Signed CBOR transaction |
| Gas model | ETH gas fees (paid by facilitator) | Fee embedded in transaction (paid by client) |
| Signing | EIP-712 typed data | Ed25519 over Blake2b-256 transaction body hash |
| Address format | 0x-prefixed hex (20 bytes) | bech32 `addr1...` (variable length) |
| Block time | ~2s (Base L2) | ~20 seconds |
| Primary asset | USDC (ERC-20) | ADA (native) |
| Replay protection | Nonce-based (EIP-3009) | UTXO-based + tx hash tracking |
| Smart contracts | Solidity / EVM | Plutus / Aiken (not used for transfers) |

## Reference Implementation

| Component | Location |
| --------- | -------- |
| npm package | [`@erudite-intelligence/x402-ada`](https://www.npmjs.com/package/@erudite-intelligence/x402-ada) |
| GitHub | [EruditeIntelligence/x402-ada](https://github.com/EruditeIntelligence/x402-ada) |
| Facilitator | Erudite Intelligence LLC (FinCEN-registered MSB #31000283503553) |

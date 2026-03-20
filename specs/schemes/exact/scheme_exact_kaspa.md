# Scheme: `exact` on `Kaspa`

## Versions supported

- ❌ `v1`
- ✅ `v2`

## Supported Networks

This spec uses [CAIP-2](https://namespaces.chainagnostic.org/) identifiers:

- `kaspa:mainnet` — Kaspa mainnet
- `kaspa:testnet-10` — Kaspa testnet (10 BPS)
- `kaspa:testnet-11` — Kaspa testnet (1 BPS)

## Summary

The `exact` scheme on Kaspa uses native UTXO transactions with Schnorr signatures over secp256k1. The client constructs and fully signs a transaction that transfers the exact required amount to the resource server's address. The facilitator verifies the transaction structure, outputs, and signatures, then broadcasts it to the Kaspa BlockDAG network.

Kaspa is a UTXO-based BlockDAG using the GHOSTDAG/PHANTOM protocol. It achieves ~1 second confirmation times at 10 blocks per second (BPS). Amounts are denominated in **sompi** (1 KAS = 100,000,000 sompi).

## Protocol Flow

1. **Client** makes a request to a **Resource Server**.
2. **Resource Server** responds with a `402 Payment Required` status and `PaymentRequirements`.
3. **Client** queries a Kaspa node for available UTXOs at its address.
4. **Client** selects UTXOs covering the required amount plus a transaction fee (minimum 10,000 sompi).
5. **Client** constructs a transaction with outputs paying the resource server and returning change to itself.
6. **Client** signs all transaction inputs with Schnorr signatures.
7. **Client** serializes the signed transaction as JSON and sends a new request to the resource server with the `PaymentPayload`.
8. **Resource Server** forwards the `PaymentPayload` and `PaymentRequirements` to the **Facilitator Server's** `/verify` endpoint.
9. **Facilitator** deserializes the transaction and validates: output addresses, amounts, and transaction structure.
10. **Facilitator** returns a `VerifyResponse` to the **Resource Server**.
11. **Resource Server**, upon successful verification, forwards the payload to the facilitator's `/settle` endpoint.
    - NOTE: `/settle` MUST perform full verification independently and MUST NOT assume prior verification.
12. **Facilitator** broadcasts the signed transaction to the Kaspa network via RPC `submitTransaction`.
13. **Facilitator** waits for DAG confirmation and responds with a `SettlementResponse` to the **Resource Server**.
14. **Resource Server** grants the **Client** access to the resource in its response upon successful settlement.

## `PaymentRequirements` for `exact`

```json
{
  "scheme": "exact",
  "network": "kaspa:mainnet",
  "amount": "100000000",
  "asset": "native",
  "payTo": "kaspa:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jkdskewva",
  "maxTimeoutSeconds": 30,
  "extra": {}
}
```

**Field Definitions:**

- `amount`: Payment amount in sompi (string). 1 KAS = 100,000,000 sompi.
- `asset`: `"native"` for KAS. After the Covenants++ hard fork, this field may contain a 64-character lowercase hex covenant token ID.
- `payTo`: Bech32-encoded Kaspa address of the resource server (prefix: `kaspa:`, `kaspatest:`, `kaspadev:`, or `kaspasim:`).
- `maxTimeoutSeconds`: Maximum time to wait for DAG confirmation. At 10 BPS, confirmation is typically < 10 seconds.
- `extra`: Reserved for future use. No additional fields are currently required.

## PaymentPayload `payload` Field

The `payload` field of the `PaymentPayload` contains:

```json
{
  "transaction": "{\"id\":\"...\",\"version\":0,\"inputs\":[...],\"outputs\":[...],\"lock_time\":0,\"gas\":0,\"subnetworkId\":\"0000000000000000000000000000000000000000\",\"payload\":\"\"}"
}
```

The `transaction` field contains a JSON-serialized Kaspa transaction object. The transaction is fully signed by the client — each input's `signatureScript` contains a valid Schnorr signature over the transaction's sighash.

**Transaction JSON structure:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Transaction ID (hex, 32 bytes) |
| `version` | number | Transaction version (currently `0`) |
| `inputs` | array | Transaction inputs (UTXOs consumed) |
| `outputs` | array | Transaction outputs (funds transferred) |
| `lock_time` | number | Lock time (typically `0`) |
| `gas` | number | Gas (typically `0`) |
| `subnetworkId` | string | Subnetwork ID (40-char hex, all zeros for native) |
| `payload` | string | Payload (empty for standard transactions) |

**Input format:**

| Field | Type | Description |
|-------|------|-------------|
| `previousOutpoint.transactionId` | string | Referenced UTXO's transaction ID (hex) |
| `previousOutpoint.index` | number | Output index in the referenced transaction |
| `signatureScript` | string | Schnorr signature + public key (hex) |
| `sequence` | number | Sequence number |
| `sigOpCount` | number | Signature operation count |

**Output format:**

| Field | Type | Description |
|-------|------|-------------|
| `value` | number | Amount in sompi |
| `scriptPublicKey.version` | number | Script version (currently `0`) |
| `scriptPublicKey.script` | string | Script hex (P2PK: `20` + x-only pubkey + `ac`) |

**Full `PaymentPayload` object:**

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://api.example.com/resource",
    "description": "Access to protected content",
    "mimeType": "application/json"
  },
  "accepted": {
    "scheme": "exact",
    "network": "kaspa:mainnet",
    "amount": "100000000",
    "asset": "native",
    "payTo": "kaspa:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jkdskewva",
    "maxTimeoutSeconds": 30,
    "extra": {}
  },
  "payload": {
    "transaction": "{...}"
  }
}
```

## Facilitator Verification Rules (MUST)

A facilitator verifying an `exact` scheme on Kaspa MUST enforce all of the following checks:

### 1. Protocol Validation

- The `x402Version` MUST be `2`.
- Both `payload.accepted.scheme` and `requirements.scheme` MUST be `"exact"`.
- The `payload.accepted.network` MUST match `requirements.network`.

### 2. Transaction Structure

- The transaction MUST deserialize to a valid Kaspa transaction JSON.
- The transaction MUST have at least one input and at least one output.
- All inputs MUST have non-empty `signatureScript` fields (indicating the transaction is signed).

### 3. Output Validation

- At least one output MUST pay `requirements.payTo` an amount >= `requirements.amount`.
- Address matching MUST support both script hex comparison (e.g., `20{pubkey}ac`) and bech32 address comparison.
- For native KAS (`asset: "native"`): the matching output MUST NOT carry a covenant binding.
- For covenant tokens (`asset` is a 64-char hex ID): the matching output MUST carry a covenant binding with `covenantId` equal to `requirements.asset`.

### 4. Facilitator Safety

- The facilitator MUST NOT hold the private key of the transaction signer. The facilitator only verifies and broadcasts — it never co-signs.
- The facilitator SHOULD verify that referenced UTXOs exist and are unspent by querying its connected Kaspa node.

### 5. Signature Verification

- Each input's Schnorr signature MUST be valid over the transaction's sighash.
- The Kaspa node performs full signature verification on `submitTransaction`, providing a secondary validation gate.

## Settlement Logic

### Phase 1: Re-verification

1. The facilitator MUST re-verify the transaction independently (all checks from the Verification section).
2. Duplicate settlement MUST be prevented (e.g., by caching settled transaction payloads).

### Phase 2: Transaction Submission

1. Deserialize the client's signed transaction JSON.
2. Reconstruct the kaspa-wasm `Transaction` object from the JSON.
3. Submit the transaction to the Kaspa network via RPC `submitTransaction`.

### Phase 3: Confirmation

1. Wait for DAG confirmation within `maxTimeoutSeconds`.
2. At 10 BPS, transactions are typically accepted into the DAG within seconds.
3. Full pruning-point finality takes ~10 seconds for additional security.

### Phase 4: `SettlementResponse`

```json
{
  "success": true,
  "transaction": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "network": "kaspa:mainnet",
  "payer": "kaspa:qpayer..."
}
```

- `transaction`: The Kaspa transaction ID (64-character hex string).
- `payer`: The client's address (derived from the first input's signature script or UTXO lookup).

## Appendix

### Kaspa Address Formats

Kaspa uses bech32-encoded addresses with network-specific prefixes:

| Network | Prefix | Example |
|---------|--------|---------|
| Mainnet | `kaspa:` | `kaspa:qr0lr4ml...` |
| Testnet | `kaspatest:` | `kaspatest:qr0lr4ml...` |
| Devnet | `kaspadev:` | `kaspadev:qr0lr4ml...` |
| Simnet | `kaspasim:` | `kaspasim:qr0lr4ml...` |

Address types:

| Type | Version | Script Format |
|------|---------|---------------|
| P2PK (Schnorr) | 0 | `OP_DATA_32` + x-only pubkey + `OP_CHECKSIG` |
| P2PK (ECDSA) | 1 | `OP_DATA_33` + compressed pubkey + `OP_CODESEPARATOR` + `OP_CHECKSIGECDSA` |
| P2SH | 8 | `OP_BLAKE2B` + `OP_DATA_32` + script hash + `OP_EQUAL` |

### UTXO Model

Unlike account-based chains (EVM, Stellar), Kaspa uses a UTXO model:

- **Inputs** consume existing unspent transaction outputs (UTXOs).
- **Outputs** create new UTXOs: one for the payment, optionally one for change.
- Each input requires an independent Schnorr signature.
- The client is responsible for UTXO selection and fee calculation.
- Minimum transaction fee: 10,000 sompi (0.0001 KAS).

### BlockDAG Confirmation

Kaspa's GHOSTDAG protocol provides probabilistic finality through DAG structure rather than linear block confirmation:

- **10 BPS**: 10 blocks are produced per second across the network.
- **DAG acceptance**: A transaction is accepted once it appears in the virtual selected parent chain (VSPC).
- **Pruning-point finality**: Full finality is achieved when the transaction is below the pruning point (~10 seconds).

### Covenant Tokens (Post Covenants++ Hard Fork)

After the Covenants++ hard fork (scheduled May 2026), Kaspa supports L1 native tokens via covenant bindings:

- `asset` field in `PaymentRequirements` may contain a 64-char hex covenant token ID instead of `"native"`.
- Token transaction outputs include a `CovenantBinding` referencing an authorizing input and the covenant ID.
- Token UTXOs carry a `covenantId` field identifying which token they hold.
- The client must separate token UTXOs (for payment) from KAS UTXOs (for fees) when constructing token transactions.

### Reference Implementation

A TypeScript SDK implementing this spec is available:

- Package: `@x402/kaspa` (pending publication)
- Implements: `SchemeNetworkClient`, `SchemeNetworkServer`, `SchemeNetworkFacilitator` from `@x402/core`
- 55 unit tests covering native KAS and covenant token flows

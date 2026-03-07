# Exact Payment Scheme for Polkadot (Substrate/Sr25519) (`exact`)

This document specifies the `exact` payment scheme for the x402 protocol on Polkadot networks. This scheme facilitates payments of a specific amount of native DOT using signed extrinsics with `balances.transferKeepAlive`.

## Scheme Name

`exact`

## Supported Networks

| Network | CAIP-2 Identifier |
| ------- | ----------------- |
| Polkadot Mainnet | `polkadot:91b171bb158e2d3848fa23a9f1c25182` |
| Westend Testnet | `polkadot:e143f23803ac50e8f6f8e62695d1ce9e` |

Wildcard: `polkadot:*` matches all Polkadot-ecosystem networks.

## Supported Assets

| Token | Asset Identifier | Decimals | Smallest Unit |
| ----- | ---------------- | -------- | ------------- |
| DOT | `dot` | 10 | planck |

1 DOT = 10,000,000,000 planck.

## Protocol Flow

The protocol flow for `exact` on Polkadot is client-driven:

1. Client makes an HTTP request to a Resource Server.
2. Resource Server responds with a `402 Payment Required` status containing `PaymentRequirements` with an `accepts` array that includes the `exact` scheme on a `polkadot:*` network.
3. Client reads the `PaymentRequirements`, noting the `asset`, `amount`, `payTo`, and `maxTimeoutSeconds`.
4. Client connects to a Polkadot node via `@polkadot/api` and queries account nonce and balance.
5. Client constructs a `balances.transferKeepAlive` extrinsic with the `payTo` address and `amount` in planck. `transferKeepAlive` is used instead of `transfer` to prevent accidentally reaping the sender's account.
6. Client signs the extrinsic using their Sr25519 keypair. The signed extrinsic includes the era (mortality period), nonce, and tip.
7. The client does NOT broadcast the extrinsic. The signed hex-encoded extrinsic is passed to the facilitator via the payment payload.
8. Client constructs the `PaymentPayload` containing the hex-encoded signed extrinsic, the extrinsic hash, and the payer's address, base64-encodes it, and sends it in the `X-PAYMENT` header with the original HTTP request.
9. Resource Server receives the request and forwards the `PaymentPayload` and `PaymentRequirements` to a Facilitator's `/verify` endpoint.
10. Facilitator performs all verification checks (see Facilitator Verification Rules below).
11. If verification passes, Facilitator returns `{ "isValid": true }` to the Resource Server.
12. Resource Server serves the requested resource to the Client.
13. Resource Server (or Facilitator) calls the Facilitator's `/settle` endpoint.
14. Facilitator submits the signed extrinsic to the Polkadot network via `api.rpc.author.submitExtrinsic()` or the Subscan API.
15. Facilitator returns the `SettlementResponse` containing the on-chain extrinsic hash.

## PaymentRequirements

```json
{
  "scheme": "exact",
  "network": "polkadot:91b171bb158e2d3848fa23a9f1c25182",
  "amount": "10000000000",
  "asset": "dot",
  "payTo": "1PayerPolkadotAddress...",
  "maxTimeoutSeconds": 120,
  "extra": {
    "name": "DOT",
    "decimals": 10
  }
}
```

- **`scheme`**: MUST be `"exact"`.
- **`network`**: A CAIP-2 identifier for the Polkadot network. Uses the genesis block hash prefix.
- **`amount`**: The amount to be transferred in planck as a string. `"10000000000"` = 1 DOT.
- **`asset`**: MUST be `"dot"` for native DOT payments.
- **`payTo`**: The Polkadot SS58 address of the resource server receiving the funds.
- **`maxTimeoutSeconds`**: Maximum time in seconds the payment authorization remains valid.

## PaymentPayload

```json
{
  "x402Version": 2,
  "scheme": "exact",
  "network": "polkadot:91b171bb158e2d3848fa23a9f1c25182",
  "payload": {
    "signedExtrinsic": "0x2d0284...",
    "extrinsicHash": "0xa1b2c3d4...",
    "from": "1PayerPolkadotAddress..."
  }
}
```

### Payload Fields

- **`signedExtrinsic`**: Hex-encoded signed Polkadot extrinsic. Contains the call data (`balances.transferKeepAlive`), signature (Sr25519), era, nonce, and tip.
- **`extrinsicHash`**: The Blake2b-256 hash of the extrinsic. Used for replay protection and tracking.
- **`from`**: The payer's Polkadot SS58 address. Used for informational purposes and balance verification.

## SettlementResponse

```json
{
  "success": true,
  "transaction": "0xa1b2c3d4...",
  "network": "polkadot:91b171bb158e2d3848fa23a9f1c25182",
  "payer": "1PayerPolkadotAddress..."
}
```

- **`transaction`**: The extrinsic hash of the submitted extrinsic.
- **`payer`**: The Polkadot SS58 address of the client that signed the extrinsic.

## Facilitator Verification Rules (MUST)

A facilitator verifying an `exact`-scheme Polkadot payment MUST enforce all of the following checks before submitting the extrinsic.

### 1. Extrinsic Format Validity

- The payload MUST contain a `signedExtrinsic` field that is a valid hex string.
- The hex MUST decode to a valid Polkadot signed extrinsic.
- The extrinsic MUST be of type `balances.transferKeepAlive` or `balances.transfer`.

### 2. Signature Verification

- The extrinsic MUST contain a valid Sr25519 signature.
- The signature MUST be valid for the extrinsic payload (call data + extensions).
- The signer address MUST correspond to the `from` field.

### 3. Recipient Address Verification

- The destination address in the extrinsic call data MUST match the `payTo` address from `PaymentRequirements`.
- Address comparison MUST use SS58 decoded form or canonical encoding.

### 4. Transfer Amount Verification

- The transfer amount in the extrinsic call data MUST be greater than or equal to the `amount` in `PaymentRequirements`.

### 5. Era (Mortality) Verification

- The extrinsic SHOULD use a mortal era to bound its validity.
- The facilitator SHOULD verify the era has not expired.
- Immortal extrinsics SHOULD be rejected as they have no expiration.

### 6. Sender Balance Verification

- The facilitator MUST query the sender's free balance via the Polkadot node or Subscan API.
- The balance MUST be sufficient to cover the transfer amount plus existential deposit (1 DOT).
- The facilitator SHOULD re-query balance immediately before broadcast (TOCTOU mitigation).

### 7. Nonce Verification

- The extrinsic nonce SHOULD match the sender's current on-chain nonce.
- A nonce that has already been used will be rejected by the network.

### 8. Replay Protection

- The facilitator MUST maintain a set of recently seen extrinsic hashes and reject duplicates.
- Polkadot provides built-in nonce-based replay protection.

### 9. Network Match

- The `network` field in the `PaymentPayload` MUST match the `network` in the `PaymentRequirements`.

### 10. Scheme Match

- The `scheme` field MUST be `"exact"`.

### 11. Existential Deposit

- The transfer MUST NOT cause the sender's balance to fall below the existential deposit (1 DOT on Polkadot mainnet). Using `transferKeepAlive` enforces this automatically.

## Settlement

Upon settlement, the facilitator:

1. **Re-verifies sender balance** — The facilitator SHOULD re-query the sender's free balance immediately before submitting.
2. **Submits the signed extrinsic** to the Polkadot network via `api.rpc.author.submitExtrinsic()`.
3. **Waits for inclusion** — The facilitator SHOULD wait for the extrinsic to be included in a finalized block.
4. **Checks the result** — The facilitator MUST verify the extrinsic executed successfully (no dispatch error).
5. **Returns the SettlementResponse** with the extrinsic hash.

The facilitator pays no DOT fees — the transaction fee is deducted from the signer's (client's) account by the Polkadot runtime.

## Settlement Failure Modes

| Failure | Cause | Outcome |
| ------- | ----- | ------- |
| Insufficient balance | Client spent funds between verify and settle | Extrinsic fails on-chain. No funds move. |
| Nonce already used | Transaction sequence conflict | Extrinsic rejected by node. |
| Era expired | Mortal extrinsic validity period passed | Extrinsic rejected. Client must sign new extrinsic. |
| Below existential deposit | Transfer would reap sender account | `transferKeepAlive` prevents this automatically. |
| Network error | Polkadot node unavailable | Facilitator retries or returns settlement failure. |

## Security Considerations

### Trust Model

The Polkadot exact scheme provides strong trust-minimization guarantees through the signed extrinsic model:

**Recipient Lock (Signed Extrinsic).** The destination address is part of the signed call data. The recipient cannot be changed without invalidating the Sr25519 signature.

**Amount Lock (Signed Extrinsic).** The exact planck amount is committed by the signature. The facilitator cannot alter the payment amount.

| Property | Guarantee |
| -------- | --------- |
| Recipient | Locked by Sr25519 signature — facilitator cannot redirect funds |
| Amount | Locked by Sr25519 signature — facilitator cannot alter the transfer value |
| Timing | Bounded by mortal era — extrinsic expires after era period |
| Scope | Single call — facilitator cannot add operations |
| Gas | Deducted from signer — client pays fee automatically |

### Replay Protection

Polkadot extrinsics include a nonce that MUST be unique and monotonically increasing per account. Once included in a finalized block, the nonce is consumed. Facilitators MUST additionally maintain extrinsic hash tracking for application-layer replay protection.

### Address Format

Polkadot uses SS58 encoding with network-specific prefixes:
- **Polkadot**: prefix `0` (addresses start with `1`)
- **Westend**: prefix `42`
- **Generic Substrate**: prefix `42`

Implementations MUST validate SS58 format and checksum before processing.

### Double-Spend Risk

Because the extrinsic includes a nonce, double-spending requires using a different nonce, which would create a different extrinsic hash. The facilitator is protected by the combination of nonce + era mortality. If the extrinsic fails on submission, no funds move. The system fails closed.

### Finality

Polkadot uses GRANDPA finality gadget providing deterministic finality (typically within 12-60 seconds). Once a block is finalized, it cannot be reverted. This is stronger than Bitcoin's probabilistic finality.

## Differences from EVM Exact Scheme

| Feature | EVM (`eip155:*`) | Polkadot (`polkadot:*`) |
| ------- | ---------------- | ----------------------- |
| Transaction model | Account-based (ERC-20) | Account-based (Substrate) |
| Meta-transactions | EIP-3009 `transferWithAuthorization` | Signed extrinsic (`balances.transferKeepAlive`) |
| Gas model | ETH gas fees (paid by facilitator) | Fee deducted from signer (paid by client) |
| Signing | EIP-712 typed data | Sr25519 Schnorr-like signature |
| Address format | 0x-prefixed hex (20 bytes) | SS58 encoding (variable length) |
| Block time | ~2s (Base L2) | ~6 seconds |
| Primary asset | USDC (ERC-20) | DOT (native) |
| Replay protection | Nonce-based (EIP-3009) | Nonce + mortal era |
| Finality | Probabilistic (reorg possible) | Deterministic (GRANDPA finality) |

## Reference Implementation

| Component | Location |
| --------- | -------- |
| npm package | [`@erudite-intelligence/x402-dot`](https://www.npmjs.com/package/@erudite-intelligence/x402-dot) |
| GitHub | [EruditeIntelligence/x402-dot](https://github.com/EruditeIntelligence/x402-dot) |
| Facilitator | Erudite Intelligence LLC (FinCEN-registered MSB #31000283503553) |

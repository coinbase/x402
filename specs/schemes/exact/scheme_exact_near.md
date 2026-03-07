# Exact Payment Scheme for NEAR Protocol (Borsh/Ed25519) (`exact`)

This document specifies the `exact` payment scheme for the x402 protocol on NEAR Protocol. This scheme facilitates payments of a specific amount of native NEAR (or NEP-141 fungible tokens) using Borsh-serialized signed transactions with Ed25519 signatures.

## Scheme Name

`exact`

## Supported Networks

| Network | CAIP-2 Identifier |
| ------- | ----------------- |
| NEAR Mainnet | `near:mainnet` |
| NEAR Testnet | `near:testnet` |

Wildcard: `near:*` matches all NEAR Protocol networks.

## Supported Assets

| Token | Asset Identifier | Decimals | Smallest Unit |
| ----- | ---------------- | -------- | ------------- |
| NEAR | `near` | 24 | yoctoNEAR |
| USDC | `usdc.near` | 6 | micro-USDC |
| USDT | `usdt.near` | 6 | micro-USDT |

1 NEAR = 10^24 yoctoNEAR. NEP-141 fungible tokens use their contract address as the asset identifier.

## Protocol Flow

The protocol flow for `exact` on NEAR Protocol is client-driven:

1. Client makes an HTTP request to a Resource Server.
2. Resource Server responds with a `402 Payment Required` status containing `PaymentRequirements` with an `accepts` array that includes the `exact` scheme on a `near:*` network.
3. Client reads the `PaymentRequirements`, noting the `asset`, `amount`, `payTo`, and `maxTimeoutSeconds`.
4. Client queries the NEAR RPC for account access key nonce and recent block hash.
5. Client constructs a NEAR transaction. For native NEAR: a `Transfer` action. For NEP-141 tokens: a `FunctionCall` action to the token contract's `ft_transfer` method.
6. Client signs the transaction using their Ed25519 private key via `near-api-js`. The transaction is Borsh-serialized.
7. The client does NOT broadcast the transaction. The signed Borsh-serialized transaction is passed to the facilitator via the payment payload.
8. Client constructs the `PaymentPayload` containing the base64-encoded signed transaction, the transaction hash, and the payer's account ID, base64-encodes it, and sends it in the `X-PAYMENT` header with the original HTTP request.
9. Resource Server receives the request and forwards the `PaymentPayload` and `PaymentRequirements` to a Facilitator's `/verify` endpoint.
10. Facilitator performs all verification checks (see Facilitator Verification Rules below).
11. If verification passes, Facilitator returns `{ "isValid": true }` to the Resource Server.
12. Resource Server serves the requested resource to the Client.
13. Resource Server (or Facilitator) calls the Facilitator's `/settle` endpoint.
14. Facilitator broadcasts the signed transaction to the NEAR network via `sendJsonRpc('broadcast_tx_commit', ...)`.
15. Facilitator returns the `SettlementResponse` containing the on-chain transaction hash.

## PaymentRequirements

```json
{
  "scheme": "exact",
  "network": "near:mainnet",
  "amount": "1000000000000000000000000",
  "asset": "near",
  "payTo": "merchant.near",
  "maxTimeoutSeconds": 120,
  "extra": {
    "name": "NEAR",
    "decimals": 24
  }
}
```

- **`scheme`**: MUST be `"exact"`.
- **`network`**: A CAIP-2 identifier for the NEAR Protocol network.
- **`amount`**: The amount to be transferred in yoctoNEAR as a string. `"1000000000000000000000000"` = 1 NEAR.
- **`asset`**: `"near"` for native NEAR, or the NEP-141 token contract address for fungible tokens.
- **`payTo`**: The NEAR account ID of the resource server receiving the funds.
- **`maxTimeoutSeconds`**: Maximum time in seconds the payment authorization remains valid.

## PaymentPayload

```json
{
  "x402Version": 2,
  "scheme": "exact",
  "network": "near:mainnet",
  "payload": {
    "signedTransaction": "EAAAAG...<base64-encoded Borsh>...",
    "txHash": "A1B2C3D4...",
    "from": "payer.near"
  }
}
```

### Payload Fields

- **`signedTransaction`**: Base64-encoded Borsh-serialized signed NEAR transaction. Contains the transaction header (signer, receiver, nonce, block_hash), actions (Transfer or FunctionCall), and Ed25519 signature.
- **`txHash`**: The SHA-256 hash of the Borsh-serialized transaction (before signing). Used for replay protection and tracking.
- **`from`**: The payer's NEAR account ID. Used for informational purposes and balance verification.

## SettlementResponse

```json
{
  "success": true,
  "transaction": "A1B2C3D4...",
  "network": "near:mainnet",
  "payer": "payer.near"
}
```

- **`transaction`**: The NEAR transaction hash of the broadcast transaction.
- **`payer`**: The NEAR account ID of the client that signed the transaction.

## Facilitator Verification Rules (MUST)

A facilitator verifying an `exact`-scheme NEAR Protocol payment MUST enforce all of the following checks before broadcasting the transaction.

### 1. Transaction Format Validity

- The payload MUST contain a `signedTransaction` field that is a valid base64 string.
- The decoded bytes MUST Borsh-deserialize to a valid NEAR `SignedTransaction`.
- The transaction MUST contain exactly one action of type `Transfer` (for native NEAR) or `FunctionCall` (for NEP-141 tokens).

### 2. Signature Verification

- The signed transaction MUST contain a valid Ed25519 signature.
- The signature MUST be valid for the Borsh-serialized transaction data.
- The public key in the signature MUST correspond to an access key on the signer's account.

### 3. Recipient Verification

- For native NEAR: the `receiver_id` field MUST match the `payTo` from `PaymentRequirements`.
- For NEP-141 tokens: the `receiver_id` MUST be the token contract, and the `ft_transfer` arguments MUST specify the `payTo` as the recipient.

### 4. Transfer Amount Verification

- For native NEAR: the `Transfer` action's `deposit` MUST be greater than or equal to `amount` in yoctoNEAR.
- For NEP-141 tokens: the `ft_transfer` `amount` argument MUST be greater than or equal to the required amount.

### 5. Block Hash Staleness Check

- The `block_hash` in the transaction header MUST reference a recent block (within approximately 24 hours / ~86,400 blocks on NEAR).
- If the block hash is stale, the network will reject the transaction.

### 6. Nonce Verification

- The transaction nonce MUST be greater than the current nonce for the signer's access key.
- The facilitator SHOULD query the current nonce via `view_access_key` RPC.

### 7. Sender Balance Verification

- The facilitator MUST verify the sender has sufficient NEAR balance (for native transfers) or token balance (for NEP-141).
- The facilitator SHOULD re-query balance immediately before broadcast (TOCTOU mitigation).

### 8. Replay Protection

- The facilitator MUST maintain a set of recently seen transaction hashes and reject duplicates.
- NEAR provides built-in nonce-based replay protection per access key.

### 9. Network Match

- The `network` field in the `PaymentPayload` MUST match the `network` in the `PaymentRequirements`.

### 10. Scheme Match

- The `scheme` field MUST be `"exact"`.

### 11. Storage Deposit (NEP-141 Only)

- For NEP-141 token transfers, the facilitator SHOULD verify the recipient has a storage deposit on the token contract. If not, the `ft_transfer` will fail.

## Settlement

Upon settlement, the facilitator:

1. **Re-verifies sender balance** — The facilitator SHOULD re-query the sender's balance immediately before broadcasting.
2. **Broadcasts the signed transaction** to the NEAR network via `broadcast_tx_commit` or `broadcast_tx_async` RPC.
3. **Checks the result** — For `broadcast_tx_commit`, the response includes the execution outcome. The facilitator MUST verify the transaction succeeded (no `Failure` status).
4. **Returns the SettlementResponse** with the transaction hash.

The facilitator pays no NEAR fees — the gas fee is deducted from the signer's account by the NEAR runtime (typical cost: ~0.00045 NEAR per transfer).

### Duplicate Settlement Mitigation (RECOMMENDED)

The facilitator SHOULD maintain a persistent record of settled transaction hashes. Before broadcasting, check if the transaction has already been settled. This prevents double-settlement in distributed facilitator deployments.

## Settlement Failure Modes

| Failure | Cause | Outcome |
| ------- | ----- | ------- |
| Insufficient balance | Client spent funds between verify and settle | Transaction fails. No funds move. |
| Invalid nonce | Nonce already used or too low | Transaction rejected by node. |
| Block hash expired | Transaction references stale block | Transaction rejected. Client must sign new transaction. |
| Account not found | Recipient account does not exist | Transaction fails on-chain. |
| Storage deposit missing | NEP-141 recipient lacks storage deposit | `ft_transfer` fails. |
| Network error | NEAR RPC unavailable | Facilitator retries or returns settlement failure. |

## Security Considerations

### Trust Model

The NEAR Protocol exact scheme provides strong trust-minimization guarantees through the signed transaction model:

**Recipient Lock (Signed Transaction).** The `receiver_id` is part of the signed transaction data. The recipient cannot be changed without invalidating the Ed25519 signature.

**Amount Lock (Signed Transaction).** The transfer amount (deposit for native NEAR, or `ft_transfer` argument for NEP-141) is committed by the signature.

| Property | Guarantee |
| -------- | --------- |
| Recipient | Locked by Ed25519 signature — facilitator cannot redirect funds |
| Amount | Locked by Ed25519 signature — facilitator cannot alter the transfer value |
| Timing | Bounded by block_hash validity (~24 hours) |
| Scope | Single action — facilitator cannot add operations |
| Gas | Deducted from signer — client pays gas fee |

### Replay Protection

NEAR transactions include an access key nonce that MUST be unique and monotonically increasing. Once a transaction is included in a block, the nonce is consumed and cannot be reused. The `block_hash` reference provides an additional time-bound (~24 hours). Facilitators MUST maintain application-layer hash tracking.

### Address Format

NEAR uses human-readable account IDs:
- **Named accounts**: `alice.near`, `merchant.example.near` (hierarchical, 2-64 characters)
- **Implicit accounts**: 64 hex characters (derived from Ed25519 public key)

Account IDs are case-insensitive. Implementations MUST normalize to lowercase before comparison.

### Double-Spend Risk

Because the client signs a complete transaction with a specific nonce, they cannot double-spend the same nonce. However, they could spend their balance via a different nonce before the facilitator broadcasts. Facilitators SHOULD minimize time between verification and settlement. If the broadcast fails due to insufficient funds, no funds move. The system fails closed.

### Finality

NEAR achieves near-instant finality (~1-2 seconds) through its Nightshade consensus mechanism. Once a transaction is included in a block and the block reaches finality, it cannot be reverted.

## Differences from EVM Exact Scheme

| Feature | EVM (`eip155:*`) | NEAR Protocol (`near:*`) |
| ------- | ---------------- | ------------------------ |
| Transaction model | Account-based (ERC-20) | Account-based (native + NEP-141) |
| Meta-transactions | EIP-3009 `transferWithAuthorization` | Signed Borsh transaction |
| Gas model | ETH gas fees (paid by facilitator) | Gas deducted from signer (paid by client) |
| Signing | EIP-712 typed data | Ed25519 over Borsh-serialized transaction |
| Address format | 0x-prefixed hex (20 bytes) | Human-readable account IDs (`alice.near`) |
| Block time | ~2s (Base L2) | ~1 second |
| Primary asset | USDC (ERC-20) | NEAR (native) |
| Replay protection | Nonce-based (EIP-3009) | Access key nonce + block_hash validity |
| Token standard | ERC-20 | NEP-141 |
| Finality | Probabilistic | Near-instant (~1-2 seconds) |

## Reference Implementation

| Component | Location |
| --------- | -------- |
| npm package | [`@erudite-intelligence/x402-near`](https://www.npmjs.com/package/@erudite-intelligence/x402-near) |
| GitHub | [EruditeIntelligence/x402-near](https://github.com/EruditeIntelligence/x402-near) |
| Facilitator | Erudite Intelligence LLC (FinCEN-registered MSB #31000283503553) |

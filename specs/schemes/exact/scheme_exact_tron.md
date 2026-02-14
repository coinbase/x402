# Exact Payment Scheme for Tron Virtual Machine (TVM) (`exact`)

This document specifies the `exact` payment scheme for the x402 protocol on Tron.

This scheme facilitates payments of a specific amount of a TRC-20 token (e.g., USDT, USDC) on the Tron blockchain.

## Scheme Name

`exact`

## Supported Networks

This spec uses [CAIP-2](https://namespaces.chainagnostic.org/tron/caip2) identifiers:

| Network | CAIP-2 ID | Description |
| ------- | --------- | ----------- |
| Mainnet | `tron:27Lqcw` | Tron Mainnet (genesis hash prefix) |
| Shasta  | `tron:4oPwXB` | Tron Shasta Testnet |
| Nile    | `tron:6FhfKq` | Tron Nile Testnet |

## Summary

The `exact` scheme on Tron uses signed `TriggerSmartContract` transactions calling the standard TRC-20 `transfer(address,uint256)` function. The client constructs and signs the transaction but does **not** broadcast it. The signed transaction is passed to the facilitator, which verifies all parameters and broadcasts it upon settlement.

Tron does not support EIP-3009 (`transferWithAuthorization`). Instead, a signed but unbroadcast Tron transaction serves the same role as an EIP-3009 authorization: it irrevocably commits the sender to a specific transfer that only the facilitator can execute, and the facilitator cannot alter the recipient or amount.

This approach ensures:

- The facilitator **cannot redirect funds** — the recipient is encoded in the signed transaction and any modification invalidates the signature.
- The client and resource server **do not need TRX for gas** — the facilitator broadcasts the transaction and pays the energy/bandwidth costs.
- **No new contracts are required** — standard TRC-20 `transfer` is used.

## Protocol Flow

The protocol flow for `exact` on Tron is client-driven.

1. **Client** makes a request to a **Resource Server**.
2. **Resource Server** responds with a payment required signal containing `PaymentRequired`. The `extra` field in the requirements MAY contain additional metadata such as token `name` and `decimals`.
3. **Client** creates a `TriggerSmartContract` transaction that calls `transfer(address,uint256)` on the TRC-20 token contract, transferring the specified `amount` of the `asset` to the `payTo` address.
4. **Client** signs the transaction with their wallet. This results in a **fully signed** transaction (Tron transactions require only the sender's signature; there is no separate fee payer co-signature).
5. **Client** serializes the signed transaction as a JSON object (as returned by TronWeb's `trx.sign()`).
6. **Client** sends a new request to the resource server with the `PaymentPayload` containing the signed transaction.
7. **Resource Server** receives the request and forwards the `PaymentPayload` and `PaymentRequirements` to a **Facilitator Server's** `/verify` endpoint.
8. **Facilitator** deserializes and inspects the transaction to ensure it is valid and contains only the expected payment instruction.
9. **Facilitator** returns a `VerifyResponse` to the **Resource Server**.
10. **Resource Server**, upon successful verification, forwards the payload to the facilitator's `/settle` endpoint.
11. **Facilitator Server** broadcasts the signed transaction to the Tron network via `tronWeb.trx.sendRawTransaction()`.
12. Upon successful on-chain settlement, the **Facilitator Server** responds with a `SettlementResponse` to the **Resource Server**.
13. **Resource Server** grants the **Client** access to the resource in its response.

> **Note on gas model:** Unlike Solana and Hedera where the facilitator co-signs as `feePayer`, Tron transactions require only the sender's signature. The facilitator pays energy/bandwidth costs implicitly by broadcasting from its own node with staked TRX resources, not by signing the transaction.

## `PaymentRequirements` for `exact`

In addition to the standard x402 `PaymentRequirements` fields, the `exact` scheme on Tron uses the following:

```json
{
  "scheme": "exact",
  "network": "tron:27Lqcw",
  "amount": "1000000",
  "asset": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  "payTo": "TXYZabc123merchantAddress",
  "maxTimeoutSeconds": 60,
  "extra": {
    "name": "USDT",
    "decimals": 6
  }
}
```

- `asset`: The TRC-20 token contract address in base58 Tron format.
- `amount`: The amount to be transferred in the token's smallest unit. For USDT/USDC with 6 decimals, `"1000000"` = $1.00.
- `payTo`: The Tron address (base58 format) of the resource server receiving the funds.
- `extra.name`: Human-readable token name (informational).
- `extra.decimals`: Token decimal places (informational).

## PaymentPayload `payload` Field

The `payload` field of the `PaymentPayload` contains:

```json
{
  "signedTransaction": {
    "txID": "a1b2c3d4e5f6...",
    "raw_data": {
      "contract": [{
        "parameter": {
          "value": {
            "data": "a9059cbb000000000000000000000000...",
            "owner_address": "41...",
            "contract_address": "41..."
          },
          "type_url": "type.googleapis.com/protocol.TriggerSmartContract"
        },
        "type": "TriggerSmartContract"
      }],
      "ref_block_bytes": "...",
      "ref_block_hash": "...",
      "expiration": 1740672154000,
      "timestamp": 1740672089000
    },
    "raw_data_hex": "0a02...",
    "signature": ["3045..."]
  },
  "from": "TXYZabc123payerAddress"
}
```

- `signedTransaction`: The complete signed Tron transaction object as returned by TronWeb's `trx.sign()`. This MUST be a `TriggerSmartContract` transaction calling `transfer(address,uint256)` on the TRC-20 token contract.
- `from`: The payer's Tron address (base58 format). Used for verification against the transaction's `owner_address`.

Full `PaymentPayload` object:

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://example.com/weather",
    "description": "Access to protected content",
    "mimeType": "application/json"
  },
  "accepted": {
    "scheme": "exact",
    "network": "tron:27Lqcw",
    "amount": "1000000",
    "asset": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    "payTo": "TXYZabc123merchantAddress",
    "maxTimeoutSeconds": 60,
    "extra": {
      "name": "USDT",
      "decimals": 6
    }
  },
  "payload": {
    "signedTransaction": {
      "txID": "a1b2c3d4e5f6...",
      "raw_data": { "..." : "..." },
      "raw_data_hex": "0a02...",
      "signature": ["3045..."]
    },
    "from": "TXYZabc123payerAddress"
  }
}
```

## `SettlementResponse`

The `SettlementResponse` for the `exact` scheme on Tron:

```json
{
  "success": true,
  "transaction": "a1b2c3d4e5f6...",
  "network": "tron:27Lqcw",
  "payer": "TXYZabc123payerAddress"
}
```

- `transaction`: The Tron transaction ID (`txID`) of the broadcast transaction.
- `payer`: The Tron address of the client that signed the transaction.

## Facilitator Verification Rules (MUST)

A facilitator verifying an `exact`-scheme Tron payment MUST enforce all of the following checks before broadcasting the transaction:

### 1. Transaction layout

- The transaction MUST be a `TriggerSmartContract` type.
- The `raw_data.contract` array MUST contain exactly one contract invocation.
- The first 4 bytes of `parameter.value.data` MUST match the `transfer(address,uint256)` function selector (`a9059cbb`).
- The transaction MUST NOT contain any additional operations beyond the single TRC-20 transfer.

### 2. Asset verification

- The `contract_address` in the transaction MUST match the `asset` in `PaymentRequirements` (the TRC-20 token contract). Implementations MUST handle conversion between base58 (`T...`) and hex (`41...`) address formats.

### 3. Transfer intent and destination

- The `address` parameter decoded from the `transfer` calldata MUST equal `PaymentRequirements.payTo`.
- Implementations MUST handle conversion between base58 and hex address formats when comparing addresses.

### 4. Amount exactness

- The `uint256` parameter decoded from the `transfer` calldata MUST equal `PaymentRequirements.amount` exactly.
- The facilitator MUST reject any transaction where the decoded amount does not match the required amount.

### 5. Sender authentication

- The signer recovered from the transaction signature MUST match the `from` field in `PaymentPayload.payload` and the `owner_address` in the transaction.

### 6. Signature validity

- The transaction signature MUST be valid for the given `raw_data_hex`.

### 7. Expiration check

- The `raw_data.expiration` timestamp MUST NOT have passed.
- The expiration SHOULD be within `maxTimeoutSeconds` of the current time.

### 8. Balance verification

- The facilitator SHOULD query the TRC-20 token contract to confirm the sender has sufficient balance to cover the transfer.

### 9. Facilitator safety

- The facilitator's own address MUST NOT appear as the `owner_address` (sender) in the transaction.
- The facilitator's address MUST NOT appear as the recipient in the `transfer` calldata.
- This prevents the facilitator from being tricked into broadcasting transactions that move its own funds.

### 10. Network correctness

- The `network` field in `PaymentRequirements` MUST be a valid Tron CAIP-2 network identifier corresponding to the Tron network on which the transaction will be submitted.

### 11. Replay protection

- The facilitator SHOULD track recently settled transaction IDs to prevent double-settlement within the expiration window.
- Tron transactions include built-in replay protection via `ref_block_bytes`/`ref_block_hash` (binding to a specific block), `expiration` (time-based expiry), and transaction ID uniqueness (once confirmed, the same `txID` cannot be included in another block).

These checks are security-critical to ensure the facilitator cannot be tricked into transferring unintended funds or sponsoring unintended actions. Implementations MAY introduce stricter limits (e.g., allowed token lists, maximum amounts) but MUST NOT relax the above constraints.

### Energy and bandwidth

TRC-20 transfers consume Tron energy and bandwidth resources. The facilitator is responsible for ensuring sufficient resources to broadcast transactions. Facilitators MAY stake TRX for energy, use energy delegation services, or factor energy costs into their fee structure.

### Address format

Tron uses base58check-encoded addresses (starting with `T`) for user-facing representations and hex addresses (starting with `41`) in transaction data. Implementations MUST handle conversion between these formats correctly when performing verification checks.

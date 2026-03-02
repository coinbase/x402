# Exact Scheme: Tron (TVM) Networks

## Overview

The `exact` scheme on Tron (TVM) networks enables x402 payments using TRC-20 tokens (USDT, USDC) on the Tron blockchain. Because Tron does not support EIP-3009 (`transferWithAuthorization`), this scheme uses an alternative mechanism that preserves the same security guarantees as the EVM implementation.

Tron is the largest stablecoin network by transaction volume, processing over $3.3T in stablecoin transfers in 2024–2025, with 95%+ of its stablecoin supply in USDT. Adding Tron support to x402 unlocks the most widely-used stablecoin payment rail for AI agents, micropayments, and merchant settlement — particularly in Southeast Asia, Africa, and Latin America where Tron USDT is the dominant digital payment method.

## How It Works

The client constructs and signs a `TriggerSmartContract` transaction calling `transfer(address,uint256)` on the TRC-20 contract, but does **not** broadcast it. The signed transaction is passed to the facilitator via the `PAYMENT-SIGNATURE` HTTP header, which verifies all parameters (recipient, amount, asset, balance, expiration) and broadcasts it upon settlement.

This preserves the core x402 trust model:

- The facilitator **cannot redirect funds** — the recipient is encoded in the signed transaction.
- The client **does not need gas** — the facilitator pays energy and bandwidth costs on settlement.
- The payment is **atomic** — either the full amount transfers to the specified recipient, or nothing happens.

### Flow

```
1. Client → Resource Server:  GET /resource
2. Resource Server → Client:  402 Payment Required + PaymentRequirements
3. Client:                    Construct TRC-20 transfer(to, amount) transaction
4. Client:                    Sign transaction (do NOT broadcast)
5. Client → Resource Server:  GET /resource + PAYMENT-SIGNATURE header
6. Resource Server → Facilitator: POST /verify (validate signature, recipient, amount, balance)
7. Facilitator → Resource Server: Verification response
8. Resource Server → Client:  200 OK + response data
9. Resource Server → Facilitator: POST /settle
10. Facilitator:              Broadcast signed transaction on-chain
```

## Network Identifiers

This scheme uses [CAIP-2](https://namespaces.chainagnostic.org/) identifiers for Tron networks:

| Network | CAIP-2 Identifier | Status |
|---|---|---|
| Tron Mainnet | `tron:27Lqcw` | Production |
| Shasta Testnet | `tron:4oPwXB` | Testing |
| Nile Testnet | `tron:6FhfKq` | Testing |

## Supported Assets

| Token | Mainnet Address | Decimals |
|---|---|---|
| USDT (TRC-20) | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` | 6 |
| USDC (TRC-20) | `TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8` | 6 |

## PaymentRequirements

When a resource server requires payment via the Tron exact scheme, it returns a `402 Payment Required` response with the following structure in the `PAYMENT-REQUIRED` header:

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://api.example.com/premium-data",
    "description": "Access to premium data",
    "mimeType": "application/json"
  },
  "accepted": {
    "scheme": "exact",
    "network": "tron:27Lqcw",
    "amount": "1000000",
    "asset": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    "payTo": "TRecipientTronAddress",
    "maxTimeoutSeconds": 60,
    "extra": {
      "name": "USDT",
      "version": "1"
    }
  }
}
```

### Field Descriptions

| Field | Type | Description |
|---|---|---|
| `scheme` | string | Must be `"exact"` |
| `network` | string | CAIP-2 identifier for the Tron network |
| `amount` | string | Amount in the token's smallest unit (e.g., `"1000000"` = 1 USDT) |
| `asset` | string | TRC-20 contract address of the payment token |
| `payTo` | string | Tron address of the payment recipient |
| `maxTimeoutSeconds` | number | Maximum time (in seconds) before the payment authorization expires |
| `extra.name` | string | Human-readable token name |
| `extra.version` | string | Scheme version |

## PaymentPayload

The `payload` field of the `PaymentPayload` must contain the following fields:

```json
{
  "payload": {
    "signature": "<hex-encoded signature>",
    "transaction": {
      "raw_data_hex": "<hex-encoded raw transaction data>",
      "raw_data": {
        "contract": [{
          "parameter": {
            "value": {
              "data": "<ABI-encoded transfer(address,uint256) call>",
              "owner_address": "<sender Tron address in hex>",
              "contract_address": "<TRC-20 contract address in hex>"
            },
            "type_url": "type.googleapis.com/protocol.TriggerSmartContract"
          },
          "type": "TriggerSmartContract"
        }],
        "ref_block_bytes": "<2 bytes>",
        "ref_block_hash": "<8 bytes>",
        "expiration": "<unix timestamp in ms>",
        "timestamp": "<unix timestamp in ms>"
      },
      "txID": "<transaction hash>"
    }
  }
}
```

### Payload Construction

1. **Build the transaction:** Create a `TriggerSmartContract` transaction calling the standard TRC-20 `transfer(address,uint256)` function on the specified asset contract. The `address` parameter MUST be the `payTo` address from `PaymentRequirements`. The `uint256` parameter MUST be the `amount` from `PaymentRequirements`.

2. **Set expiration:** The transaction's `expiration` field should be set to `now + maxTimeoutSeconds` (in milliseconds). This prevents stale transactions from being broadcast after the authorization window.

3. **Sign the transaction:** Sign the transaction using the client's Tron private key. This produces a 65-byte signature (r, s, v).

4. **Do NOT broadcast:** The signed transaction is sent to the resource server via the `PAYMENT-SIGNATURE` header. The client MUST NOT broadcast the transaction itself.

## Verification

The facilitator MUST perform the following checks during `/verify`:

1. **Signature recovery:** Recover the signer's address from the signature and `raw_data_hex` using ECRecover (secp256k1). The recovered address MUST match the `owner_address` in the transaction.

2. **Transaction ID verification:** Recompute the transaction ID by hashing `raw_data_hex` with SHA-256. The computed ID MUST match the provided `txID`. This detects any tampering with the transaction data.

3. **ABI decoding:** Decode the `data` field of the `TriggerSmartContract` parameter. Validate that:
   - The function selector matches `transfer(address,uint256)` (`0xa9059cbb`)
   - The ABI data length is exactly 68 bytes (4-byte selector + 32-byte address + 32-byte amount)
   - The decoded recipient address matches `payTo` from `PaymentRequirements`
   - The decoded amount matches `amount` from `PaymentRequirements`

4. **Contract address:** The `contract_address` in the transaction MUST match the `asset` from `PaymentRequirements`.

5. **Expiration:** The transaction's `expiration` MUST be in the future.

6. **Balance check:** The sender's TRC-20 token balance MUST be >= the payment amount.

## Settlement

The facilitator performs settlement by broadcasting the pre-signed transaction to the Tron network:

1. **Second-layer signature verification:** As a belt-and-suspenders defense, re-verify the signature before broadcast.

2. **Broadcast:** Submit the signed transaction to the Tron network via `wallet/broadcasttransaction`.

3. **Confirmation:** Wait for transaction confirmation (typically 1 block, ~3 seconds on Tron).

4. **Energy costs:** The facilitator pays energy and bandwidth costs for the transaction. The `maxEnergyFeeSun` configuration parameter caps the maximum energy cost the facilitator will subsidize per transaction.

## Security Considerations

### Replay Protection

- Each Tron transaction includes `ref_block_bytes` and `ref_block_hash` which bind it to a recent block, providing natural replay protection.
- The `expiration` field ensures transactions cannot be broadcast after the authorization window.
- Once broadcast, the transaction's nonce is consumed on-chain, preventing re-execution.

### Signature Security

- Transactions are decoded and the signature is verified via ECRecover before any verification or settlement occurs.
- The transaction ID is recomputed from `raw_data_hex` to detect tampering.
- A second-layer signature verification runs in `settle()` before broadcast.
- ABI data length is validated before parsing to prevent malformed input attacks.

### Trust Model

- The facilitator **cannot redirect funds** — the recipient address is encoded in the signed transaction data and verified against `PaymentRequirements`.
- The facilitator **cannot inflate the amount** — the transfer amount is encoded in the signed transaction and verified.
- The client **retains control** — the signed transaction is a standard TRC-20 transfer that can only move the exact specified amount to the exact specified recipient.

## Differences from EVM Exact Scheme

| Aspect | EVM (EIP-3009) | Tron (TVM) |
|---|---|---|
| Authorization method | `transferWithAuthorization` (EIP-3009) | `TriggerSmartContract` calling `transfer(address,uint256)` |
| Signature standard | EIP-712 typed data | Tron transaction signing (secp256k1 over SHA-256 of `raw_data_hex`) |
| Nonce handling | Explicit nonce parameter in EIP-3009 | Implicit via `ref_block_bytes`, `ref_block_hash`, `expiration` |
| Gas/Energy | Facilitator pays gas (ETH) | Facilitator pays energy and bandwidth (TRX) |
| Settlement | `transferWithAuthorization` call | Broadcast pre-signed `TriggerSmartContract` |
| Custom contracts required | No (uses USDC's native EIP-3009) | No (uses standard TRC-20 `transfer`) |
| Block finality | ~2 seconds (Base) | ~3 seconds (Tron) |

## Reference Implementation

- **npm:** [`@erudite-intelligence/x402-tron-v2`](https://www.npmjs.com/package/@erudite-intelligence/x402-tron-v2)
- **GitHub:** [`EruditeIntelligence/x402-tron-v2`](https://github.com/EruditeIntelligence/x402-tron-v2)
- **Security audit:** 17 attack-scenario tests covering signature forgery, transaction tampering, replay attacks, ABI manipulation, and amount spoofing — all passing. Independently reviewed by Grok (xAI) and Gemini (Google).

## Author

**Erudite Intelligence LLC**
FinCEN-registered Money Services Business
[eruditepay.com](https://eruditepay.com)

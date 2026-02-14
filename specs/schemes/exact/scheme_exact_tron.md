# Exact Scheme — Tron (TVM)

## Overview

The `exact` scheme on Tron networks uses signed TRC-20 `transfer(address,uint256)` transactions to authorize a transfer of a specific amount of a TRC-20 token (e.g., USDT) from the payer to the resource server. The client constructs and signs a `TriggerSmartContract` transaction but does **not** broadcast it. Instead, the signed transaction is passed to the facilitator, which verifies all parameters and broadcasts it upon settlement.

This approach ensures:

- The facilitator **cannot redirect funds** — the recipient is encoded in the signed transaction and cannot be altered without invalidating the signature.
- The client and resource server **do not need TRX for gas** — the facilitator broadcasts the transaction and pays the energy/bandwidth costs.
- **No new contracts are required** — standard TRC-20 `transfer` is used. Optionally, a wrapper contract can be used for automated fee collection (see [EruditePay Integration](#eruditepay-integration)).

## Why Tron?

Tron is the dominant network for USDT stablecoin transfers:

- **$3.3T+ in stablecoin transactions** processed on Tron (2024–2025)
- **95%+ of Tron's stablecoin supply is USDT** — the most widely held stablecoin globally
- **Sub-cent transfer fees** — TRC-20 transfers cost <$0.01 vs $5–50 on Ethereum
- **~2 billion daily transactions** with 3-second block times
- **Dominant in Southeast Asia, Africa, and Latin America** — Tron USDT is the de facto payment rail for street vendors, freelancers, and cross-border remittances

Adding Tron to x402 unlocks the largest stablecoin network for AI agent payments, micropayments, and merchant settlement.

## CAIP-2 Network Identifiers

Tron networks use the `tron` namespace with the genesis block hash prefix as the chain reference, following [CAIP-2](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md):

| Network | CAIP-2 ID | Description |
|---------|-----------|-------------|
| Mainnet | `tron:27Lqcw` | Tron Mainnet (genesis hash prefix) |
| Shasta (Testnet) | `tron:4oPwXB` | Tron Shasta Testnet |
| Nile (Testnet) | `tron:6FhfKq` | Tron Nile Testnet |

## Supported Assets

| Token | Mainnet Address | Decimals |
|-------|----------------|----------|
| USDT | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` | 6 |
| USDC | `TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8` | 6 |

## Differences from EVM

Tron does not support EIP-3009 (`transferWithAuthorization`). Instead, the `exact` scheme on Tron uses a different mechanism to achieve the same security guarantees:

| Property | EVM (EIP-3009) | Tron (TVM) |
|----------|---------------|------------|
| Authorization method | EIP-712 typed signature over `transferWithAuthorization` params | Signed `TriggerSmartContract` transaction (not broadcast) |
| Replay protection | `nonce` parameter in EIP-3009 | Transaction `expiration` field + `ref_block` binding |
| Gas responsibility | Facilitator calls `transferWithAuthorization` | Facilitator broadcasts pre-signed transaction |
| Fund safety | Signature locks `from`, `to`, `value` | Signed transaction locks `contract`, `to`, `value` in calldata |
| Contract requirement | Uses existing USDC/USDT EIP-3009 support | Uses standard TRC-20 `transfer(address,uint256)` |

The key insight is that a signed but unbroadcast Tron transaction serves the same role as an EIP-3009 authorization: it irrevocably commits the sender to a specific transfer that only the facilitator can execute, and the facilitator cannot alter the recipient or amount.

## PaymentRequirements

The `accepted` field in `PaymentRequirements` for Tron uses standard x402 V2 fields:

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://api.example.com/premium-data",
    "description": "Access to premium market data",
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
  }
}
```

### Field Details

- **`scheme`**: `"exact"` — fixed amount transfer
- **`network`**: CAIP-2 identifier (e.g., `"tron:27Lqcw"` for mainnet)
- **`amount`**: Amount in smallest unit (sun). For USDT with 6 decimals, `"1000000"` = $1.00
- **`asset`**: TRC-20 token contract address (base58 Tron address format)
- **`payTo`**: Merchant/resource server's Tron address (base58 format)
- **`maxTimeoutSeconds`**: Maximum time the payment authorization remains valid
- **`extra.name`**: Human-readable token name
- **`extra.decimals`**: Token decimal places

## PaymentPayload

The `payload` field of `PaymentPayload` contains the signed Tron transaction:

```json
{
  "payload": {
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
}
```

### Field Details

- **`signedTransaction`**: The complete signed Tron transaction object as returned by TronWeb's `trx.sign()`. This is a `TriggerSmartContract` transaction calling `transfer(address,uint256)` on the TRC-20 token contract.
- **`from`**: The payer's Tron address (base58 format). Used for verification against the transaction's `owner_address`.

## Verification (`/verify`)

The facilitator performs the following checks before returning `{ isValid: true }`:

1. **Scheme/network validation** — Confirm `scheme === "exact"` and `network` matches a supported Tron network.

2. **Transaction format** — Verify the transaction is a `TriggerSmartContract` type.

3. **Function selector** — Decode `raw_data.contract[0].parameter.value.data` and confirm the first 4 bytes match `transfer(address,uint256)` selector (`a9059cbb`).

4. **Asset verification** — Confirm `contract_address` in the transaction matches the `asset` in `PaymentRequirements` (the TRC-20 token contract, e.g., USDT).

5. **Recipient check** — Decode the `address` parameter from the `transfer` calldata and confirm it matches `payTo` from `PaymentRequirements`.

6. **Amount verification** — Decode the `uint256` parameter from the `transfer` calldata and confirm it is >= the `amount` in `PaymentRequirements`.

7. **Sender authentication** — Recover the signer from the transaction signature and confirm it matches the `from` field in `PaymentPayload` and the `owner_address` in the transaction.

8. **Expiration check** — Confirm `raw_data.expiration` has not passed. The expiration should be within `maxTimeoutSeconds` of the current time.

9. **Balance verification** — Query the TRC-20 token contract to confirm the sender has sufficient balance.

10. **Self-transfer prevention** — Confirm the facilitator's own address does not appear as the sender or in any transaction parameter, preventing the facilitator from using client-signed transactions to move its own funds.

11. **Signature validity** — Verify the transaction signature is valid for the given `raw_data_hex`.

## Settlement (`/settle`)

Upon settlement, the facilitator:

1. **Broadcasts** the signed transaction to the Tron network via `tronWeb.trx.sendRawTransaction(signedTransaction)`.

2. **Confirms** the transaction by polling for inclusion in a block. Tron blocks are produced every 3 seconds, so confirmation is typically fast.

3. **Returns** the settlement response:

```json
{
  "success": true,
  "transaction": "a1b2c3d4e5f6...",
  "network": "tron:27Lqcw",
  "payer": "TXYZabc123payerAddress",
  "payee": "TXYZabc123merchantAddress"
}
```

### Settlement with Wrapper Contract (Optional)

For facilitators that want automated on-chain fee collection, a wrapper contract can be used. Instead of the client signing a direct `transfer` to the merchant, the client signs a `transfer` to the wrapper contract, which then splits the payment:

1. Merchant receives `amount - fee`
2. Facilitator treasury receives `fee`

This is an optional optimization. The base `exact` scheme on Tron works with standard TRC-20 transfers and no additional contracts.

## Replay Protection

Tron transactions include built-in replay protection:

- **`ref_block_bytes` / `ref_block_hash`**: Bind the transaction to a specific block, preventing replay on forks.
- **`expiration`**: Transactions expire after a set time (typically 60 seconds). Expired transactions are rejected by the network.
- **Transaction ID uniqueness**: Once broadcast and confirmed, the same `txID` cannot be included in another block.

The facilitator should additionally track recently settled transaction IDs to prevent double-settlement within the expiration window.

## Security Considerations

### Trust Model

The security model mirrors the EVM `exact` scheme:

- **Client safety**: The signed transaction irrevocably specifies the recipient and amount. The facilitator cannot alter these parameters — any modification invalidates the signature.
- **Resource server safety**: The facilitator verifies sufficient balance and correct parameters before signaling validity, and broadcasts the exact signed transaction on settlement.
- **Facilitator limitation**: The facilitator can only broadcast or not broadcast the transaction. It cannot redirect funds, change amounts, or alter any transaction parameter.

### Energy and Bandwidth

TRC-20 transfers consume Tron energy and bandwidth resources. The facilitator is responsible for ensuring sufficient resources to broadcast transactions. Facilitators may:

- Stake TRX for energy to minimize costs
- Use energy delegation services
- Factor energy costs into their fee structure

### Address Format

Tron uses base58check-encoded addresses (starting with `T`) for user-facing representations and hex addresses (starting with `41`) in transaction data. Implementations must handle conversion between these formats correctly.

## Reference Implementation

- **npm package**: [`@erudite-intelligence/x402-tron-v2`](https://www.npmjs.com/package/@erudite-intelligence/x402-tron-v2)
- **GitHub**: [`EruditeIntelligence/x402-tron-v2`](https://github.com/EruditeIntelligence/x402-tron-v2)
- **Security**: 17 attack vector tests passing (see `test/attacks.test.ts`)

The reference implementation provides:

- `registerExactTronScheme()` — Register Tron support on any x402 V2 facilitator
- `registerExactTronClientScheme()` — Register Tron support on any x402 V2 client
- `registerExactTronServerScheme()` — Register Tron support on any x402 V2 resource server
- `toFacilitatorTronSigner()` / `toClientTronSigner()` — TronWeb signer adapters matching the x402 signer interface pattern

## EruditePay Integration

The reference implementation includes optional support for the [EruditePay](https://eruditepay.com) wrapper contract (`THGkLBrLY1G5VovZjjK1jP9upyxRdMNL3b`), which provides automated 0.25% fee collection on-chain. This is an optional feature for facilitators that want hands-free revenue collection and is not required by the scheme specification.

```typescript
registerExactTronScheme(facilitator, {
  signer: toFacilitatorTronSigner(tronWeb),
  networks: TRON_MAINNET,
  config: {
    useWrapperContract: true, // Routes through EruditePay wrapper
  },
});
```

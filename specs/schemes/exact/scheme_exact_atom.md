# Exact Payment Scheme for Cosmos Hub (MsgSend) (`exact`)

This document specifies the `exact` payment scheme for the Cosmos Hub network. It defines how a client constructs a signed Cosmos SDK transaction for a precise payment amount and how a facilitator verifies and settles that transaction on-chain.

## Scheme Name

`exact`

## Supported Networks

| Network | CAIP-2 Identifier |
|---|---|
| Cosmos Hub Mainnet | `cosmos:cosmoshub-4` |
| Cosmos Hub Testnet (Theta) | `cosmos:theta-testnet-001` |

## Supported Assets

| Token | Asset Identifier | Decimals | Smallest Unit |
|---|---|---|---|
| ATOM | `uatom` | 6 | uatom (1 ATOM = 1,000,000 uatom) |

## Protocol Flow

1. Client sends an HTTP request to a resource server for a paid resource.
2. Resource server determines the price for the resource in ATOM.
3. Resource server responds with HTTP `402 Payment Required`, including `PaymentRequirements` in the response headers.
4. Client parses the `PaymentRequirements` to determine the payment details (amount, recipient, network, asset).
5. Client constructs a Cosmos SDK `MsgSend` transaction with the required amount in uatom.
6. Client sets a memo field containing an expiry timestamp for replay protection.
7. Client signs the transaction using `client.sign()`, producing a `TxRaw` Protobuf.
8. Client encodes the signed `TxRaw` bytes to base64.
9. Client constructs a `PaymentPayload` containing the base64 signature and authorization metadata.
10. Client re-sends the original HTTP request with the `PaymentPayload` in the `X-PAYMENT` header.
11. Resource server forwards the `PaymentPayload` to the facilitator for verification.
12. Facilitator decodes the base64 `TxRaw`, verifies all fields (scheme, destination, amount, expiry, balance, replay).
13. If verification passes, the facilitator returns a success response to the resource server.
14. Resource server serves the paid resource to the client.
15. Facilitator broadcasts the signed transaction to the Cosmos Hub network for settlement.

## PaymentRequirements

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "cosmos:cosmoshub-4",
  "payTo": "cosmos1abc...xyz",
  "maxAmountRequired": "500000",
  "asset": "uatom",
  "extra": {
    "name": "Example Resource",
    "description": "Access to a premium data endpoint"
  },
  "resource": "https://api.example.com/data/premium"
}
```

| Field | Description |
|---|---|
| `x402Version` | Protocol version. Must be `1`. |
| `scheme` | Payment scheme identifier. Must be `exact`. |
| `network` | CAIP-2 network identifier for Cosmos Hub. |
| `payTo` | Bech32-encoded Cosmos address (`cosmos1...`) of the payment recipient. |
| `maxAmountRequired` | Maximum payment amount in uatom (smallest unit). |
| `asset` | Asset identifier. Must be `uatom`. |
| `extra` | Optional metadata about the resource being purchased. |
| `resource` | The URL of the resource being paid for. |

## PaymentPayload

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "payload": {
    "signature": "CpIBCo8BChwvY29zbW9zLmJhbmsudjFiZXRhMS5Nc2dTZW5k...",
    "authorization": {
      "type": "cosmos-signed-transaction",
      "from": "cosmos1sender...abc",
      "to": "cosmos1recipient...xyz",
      "amount": "500000",
      "denom": "uatom",
      "asset": "ATOM",
      "chainId": "cosmoshub-4",
      "memo": "x402-payment",
      "expiry": 1709830800
    }
  }
}
```

| Field | Description |
|---|---|
| `x402Version` | Protocol version. Must be `1`. |
| `scheme` | Payment scheme identifier. Must be `exact`. |
| `payload.signature` | Base64-encoded `TxRaw` Protobuf bytes containing the signed Cosmos transaction. |
| `payload.authorization.type` | Authorization type. Must be `cosmos-signed-transaction`. |
| `payload.authorization.from` | Bech32-encoded sender address (`cosmos1...`). |
| `payload.authorization.to` | Bech32-encoded recipient address (`cosmos1...`). |
| `payload.authorization.amount` | Payment amount in uatom as a string. |
| `payload.authorization.denom` | Token denomination. Must be `uatom`. |
| `payload.authorization.asset` | Human-readable asset name. Must be `ATOM`. |
| `payload.authorization.chainId` | Cosmos chain ID (e.g., `cosmoshub-4`). |
| `payload.authorization.memo` | Transaction memo for identification. |
| `payload.authorization.expiry` | Unix timestamp after which the payment is no longer valid. |

## SettlementResponse

```json
{
  "success": true,
  "transaction": "A1B2C3D4E5F6...",
  "network": "cosmos:cosmoshub-4",
  "payer": "cosmos1sender...abc",
  "payee": "cosmos1recipient...xyz"
}
```

| Field | Description |
|---|---|
| `success` | Whether settlement was successful. |
| `transaction` | On-chain transaction hash (SHA256 hex string). |
| `network` | CAIP-2 network identifier where settlement occurred. |
| `payer` | Bech32-encoded sender address. |
| `payee` | Bech32-encoded recipient address. |

## Facilitator Verification Rules (MUST)

1. **Scheme validation**
   - The `scheme` field MUST be `exact`.
   - The `x402Version` MUST be `1`.

2. **Signature decoding**
   - The facilitator MUST decode the base64 `signature` field into `TxRaw` Protobuf bytes.
   - Decoding failure MUST result in rejection.

3. **Destination match**
   - The `to` field in the authorization MUST exactly match the `payTo` address from the `PaymentRequirements`.
   - The decoded transaction's `MsgSend` recipient MUST match the authorization `to` field.

4. **Amount validation**
   - The `amount` in the authorization MUST be greater than or equal to the `maxAmountRequired`.
   - The decoded transaction amount MUST match the authorization amount.

5. **Denomination check**
   - The `denom` field MUST be `uatom`.
   - The decoded transaction denomination MUST match.

6. **Chain ID validation**
   - The `chainId` in the authorization MUST match the expected network (e.g., `cosmoshub-4`).

7. **Expiry check**
   - The `expiry` timestamp MUST be in the future (not yet passed).
   - Expired payments MUST be rejected.

8. **Sender balance verification**
   - The facilitator MUST query the sender's on-chain balance via `client.getBalance(from, "uatom")`.
   - The balance MUST be sufficient to cover the payment amount plus estimated fees (5000 uatom default).

9. **Replay protection**
   - The facilitator MUST compute the SHA256 hash of the `TxRaw` bytes.
   - If the hash has been seen within the replay protection window (1-hour TTL), the payment MUST be rejected.
   - The hash MUST be stored in an in-memory map with a 1-hour TTL upon successful verification.

10. **Address format validation**
    - Both `from` and `to` addresses MUST be valid bech32 addresses with the `cosmos1` prefix.
    - Malformed addresses MUST be rejected.

## Settlement

1. **Balance re-check** -- The facilitator MUST re-verify the sender's uatom balance immediately before broadcasting to ensure funds have not been spent since verification.
2. The facilitator decodes the base64 signature back into raw `TxRaw` bytes.
3. The facilitator broadcasts the transaction via `client.broadcastTx(txBytes)`.
4. The facilitator checks that `result.code === 0` to confirm the transaction was accepted into the mempool.
5. The facilitator extracts the transaction hash from the broadcast result.
6. The facilitator monitors the transaction for inclusion in a block (~6 second block time).
7. Upon confirmation, the facilitator returns the `SettlementResponse` with the transaction hash.

## Settlement Failure Modes

| Failure | Cause | Outcome |
|---|---|---|
| Insufficient balance | Sender spent funds between verification and broadcast | Transaction rejected by network; facilitator returns failure |
| Invalid signature | Corrupted or tampered `TxRaw` bytes | Transaction rejected by network; facilitator returns failure |
| Duplicate transaction | Tx hash already exists on-chain | Network rejects duplicate; facilitator returns failure |
| Sequence mismatch | Account sequence number is stale | Transaction rejected by network; facilitator returns failure |
| Gas insufficient | Fee below minimum required by validators | Transaction rejected by network; facilitator returns failure |
| Network timeout | Cosmos Hub RPC node unavailable | Broadcast fails; facilitator returns failure with retry guidance |
| Memo mismatch | Memo field altered or missing | Verification fails before broadcast; payment rejected |
| Chain halt | Network consensus failure | Broadcast may hang; facilitator returns timeout failure |

## Security Considerations

### Trust Model

| Party | Trust Assumption |
|---|---|
| Client | Trusts that the facilitator will broadcast the signed transaction and that the resource server will deliver the resource upon valid payment. |
| Resource Server | Trusts the facilitator to correctly verify payment validity and settle on-chain. |
| Facilitator | Does not trust the client. Independently verifies all transaction fields, balance, and replay status before accepting. |

### Replay Protection

The facilitator maintains an in-memory map of SHA256 transaction hashes with a 1-hour TTL. Any transaction whose hash has been previously seen within the TTL window is rejected. This prevents the same signed transaction from being submitted multiple times.

### Address Format

All Cosmos addresses MUST use bech32 encoding with the `cosmos1` human-readable prefix. The facilitator MUST validate proper bech32 encoding and checksum before accepting any address. Addresses with incorrect prefixes (e.g., `osmo1`, `juno1`) MUST be rejected.

### Double-Spend Risk

Cosmos Hub uses account-based sequencing (not UTXO). Each account has a monotonically increasing sequence number. If a sender signs two transactions with the same sequence number, only the first to be included in a block will succeed. The facilitator mitigates double-spend risk by:

- Verifying the sender's current balance before broadcasting.
- Performing a balance re-check immediately before settlement.
- Relying on the network's sequence number enforcement for transaction ordering.

With ~6-second block times, the window for double-spend attempts is narrow but non-zero.

## Differences from EVM Exact Scheme

| Aspect | EVM Exact Scheme | Cosmos ATOM Exact Scheme |
|---|---|---|
| Transaction format | RLP-encoded EVM transaction | Protobuf-encoded `TxRaw` (Cosmos SDK) |
| Signature encoding | Hex-encoded signed transaction | Base64-encoded `TxRaw` bytes |
| Address format | 0x-prefixed hex (EIP-55 checksum) | Bech32 with `cosmos1` prefix |
| Denomination | Wei (10^18) | uatom (10^6) |
| Replay protection | Tx hash + nonce-based | SHA256 tx hash + sequence number |
| Gas model | EIP-1559 (base + priority fee) | Fixed fee (5000 uatom) + gas limit (200000) |
| Block time | ~2 seconds (Ethereum) | ~6 seconds |
| Signing library | ethers.js / viem | @cosmjs/stargate |
| Confirmation model | Block confirmations | Block inclusion (code === 0) |
| Account model | Account-based (nonce) | Account-based (sequence number) |
| Network protocol | EVM JSON-RPC | Cosmos Tendermint RPC |

## Reference Implementation

| Component | Reference |
|---|---|
| npm package | `@erudite-intelligence/x402-atom` |
| GitHub | `https://github.com/erudite-intelligence/x402-atom` |
| Facilitator | Erudite Intelligence x402 Facilitator |

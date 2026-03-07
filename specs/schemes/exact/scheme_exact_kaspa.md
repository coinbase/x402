# Exact Payment Scheme for Kaspa (UTXO Transfer) (`exact`)

This document specifies the `exact` payment scheme for the Kaspa BlockDAG network. It defines how a client constructs a signed UTXO-based transaction for a precise payment amount in KAS and how a facilitator verifies and settles that transaction on the Kaspa network.

## Scheme Name

`exact`

## Supported Networks

| Network | CAIP-2 Identifier |
|---|---|
| Kaspa Mainnet | `kaspa:mainnet` |
| Kaspa Testnet 10 | `kaspa:testnet-10` |
| Kaspa Testnet 11 | `kaspa:testnet-11` |

## Supported Assets

| Token | Asset Identifier | Decimals | Smallest Unit |
|---|---|---|---|
| KAS | `KAS` | 8 | sompi (1 KAS = 100,000,000 sompi) |

## Protocol Flow

1. Client sends an HTTP request to a resource server for a paid resource.
2. Resource server determines the price for the resource (may be denominated in USD, converted to KAS via price oracle).
3. Resource server responds with HTTP `402 Payment Required`, including `PaymentRequirements` in the response headers.
4. Client parses the `PaymentRequirements` to determine the payment details (amount, recipient, network, asset).
5. Client selects UTXOs from their wallet sufficient to cover the payment amount plus fees.
6. Client constructs a Kaspa transaction with inputs (selected UTXOs) and outputs (recipient + optional change).
7. Client signs each transaction input with Schnorr signatures.
8. Client hex-encodes the fully signed transaction.
9. Client constructs a `PaymentPayload` containing the signed transaction hex and authorization metadata.
10. Client re-sends the original HTTP request with the `PaymentPayload` in the `X-PAYMENT` header.
11. Resource server forwards the `PaymentPayload` to the facilitator for verification.
12. Facilitator validates the signed transaction, authorization fields, addresses, amounts, and sender balance.
13. If verification passes, the facilitator returns a success response to the resource server.
14. Resource server serves the paid resource to the client.
15. Facilitator submits the signed transaction to the Kaspa network for settlement and polls for confirmation.

## PaymentRequirements

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "kaspa:mainnet",
  "payTo": "kaspa:qr...recipient",
  "maxAmountRequired": "100000000",
  "asset": "KAS",
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
| `network` | CAIP-2 network identifier for the target Kaspa network. |
| `payTo` | Kaspa address (`kaspa:q...` for P2PKH or `kaspa:p...` for P2SH) of the payment recipient. |
| `maxAmountRequired` | Maximum payment amount in sompi (smallest unit). |
| `asset` | Asset identifier. Must be `KAS`. |
| `extra` | Optional metadata about the resource being purchased. |
| `resource` | The URL of the resource being paid for. |

## PaymentPayload

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "payload": {
    "signedTransaction": "a1b2c3d4e5f6...hex_encoded_tx",
    "authorization": {
      "from": "kaspa:qr...sender",
      "to": "kaspa:qr...recipient",
      "value": "100000000",
      "txId": "abc123def456...",
      "inputCount": 3,
      "outputCount": 2
    }
  }
}
```

| Field | Description |
|---|---|
| `x402Version` | Protocol version. Must be `1`. |
| `scheme` | Payment scheme identifier. Must be `exact`. |
| `payload.signedTransaction` | Hex-encoded fully signed Kaspa transaction with Schnorr signatures. |
| `payload.authorization.from` | Kaspa address of the sender. |
| `payload.authorization.to` | Kaspa address of the recipient. |
| `payload.authorization.value` | Payment amount in sompi as a string. |
| `payload.authorization.txId` | Transaction identifier for tracking. |
| `payload.authorization.inputCount` | Number of UTXO inputs in the transaction. |
| `payload.authorization.outputCount` | Number of outputs in the transaction (recipient + optional change). |

## SettlementResponse

```json
{
  "success": true,
  "transaction": "abc123def456...tx_hash",
  "network": "kaspa:mainnet",
  "payer": "kaspa:qr...sender",
  "payee": "kaspa:qr...recipient"
}
```

| Field | Description |
|---|---|
| `success` | Whether settlement was successful. |
| `transaction` | On-chain transaction hash. |
| `network` | CAIP-2 network identifier where settlement occurred. |
| `payer` | Kaspa address of the sender. |
| `payee` | Kaspa address of the recipient. |

## Facilitator Verification Rules (MUST)

1. **Payload presence**
   - The `PaymentPayload` MUST be present and non-empty.
   - Missing payload MUST result in immediate rejection.

2. **Signed transaction presence**
   - The `signedTransaction` field MUST be present and non-empty.
   - Missing signed transaction MUST result in rejection.

3. **Authorization completeness**
   - The `authorization` object MUST be present.
   - All required fields (`from`, `to`, `value`, `txId`, `inputCount`, `outputCount`) MUST be present.
   - Incomplete authorization MUST result in rejection.

4. **Input/output count validation**
   - `inputCount` MUST be >= 1.
   - `outputCount` MUST be >= 1.
   - `inputCount` MUST be <= 84 (`MAX_UTXO_INPUTS` limit).
   - Violations MUST result in rejection.

5. **Address validation**
   - Both `from` and `to` addresses MUST be valid Kaspa addresses.
   - Mainnet addresses MUST use the `kaspa:` prefix; testnet addresses MUST use the `kaspatest:` prefix.
   - P2PKH addresses use the format `kaspa:q...`; P2SH addresses use `kaspa:p...`.
   - Malformed addresses MUST be rejected.

6. **Recipient match**
   - The `to` field in the authorization MUST match the `payTo` address from the `PaymentRequirements`.
   - Mismatch MUST result in rejection.

7. **Value validation**
   - The `value` field MUST be a valid numeric string representing sompi.
   - The value MUST be >= `MIN_PAYMENT_SOMPI` (10,000 sompi).
   - If pricing is USD-denominated, the facilitator MUST convert using a price oracle (CoinGecko/CoinMarketCap, 30-second cache TTL) and apply slippage tolerance.
   - Invalid or insufficient values MUST result in rejection.

8. **Hex format validation**
   - The `signedTransaction` MUST be a valid hex string.
   - The hex string length MUST be >= 200 characters (minimum viable transaction size).
   - The hex string length MUST be <= 100,000 characters (100 KB maximum transaction size).
   - Invalid hex or out-of-range sizes MUST result in rejection.

9. **Sender balance verification**
   - The facilitator MUST query the sender's UTXO balance via the Kaspa API.
   - The total available balance MUST be sufficient to cover the payment amount plus network fees.
   - Insufficient balance MUST result in rejection.

10. **Replay protection**
    - The facilitator MUST track submitted transaction IDs.
    - If the `txId` has been previously submitted, the payment MUST be rejected.

## Settlement

1. **Balance re-check** -- The facilitator MUST re-verify the sender's available UTXO balance immediately before submission to ensure UTXOs have not been spent since verification.
2. The facilitator submits the signed transaction via API POST to `/transactions` on the Kaspa API (`https://api.kaspa.org` for mainnet).
3. The facilitator begins polling for transaction confirmation.
4. Confirmation requires a DAA (Difficulty Adjustment Algorithm) blue score depth of 10.
5. The facilitator polls every 1 second with a maximum timeout of 30 seconds.
6. Once the transaction reaches the required DAA score depth, the facilitator considers it confirmed.
7. Upon confirmation, the facilitator returns the `SettlementResponse` with the transaction hash.

## Settlement Failure Modes

| Failure | Cause | Outcome |
|---|---|---|
| Insufficient balance | Sender's UTXOs were spent between verification and submission | Transaction rejected by network; facilitator returns failure |
| UTXO already spent | One or more input UTXOs consumed by another transaction | Transaction rejected by network; facilitator returns failure |
| Invalid Schnorr signature | Corrupted or tampered transaction signatures | Transaction rejected by network; facilitator returns failure |
| Transaction too large | Transaction exceeds maximum allowed size | Submission rejected; facilitator returns failure |
| Too many inputs | Input count exceeds MAX_UTXO_INPUTS (84) | Verification rejects before submission; facilitator returns failure |
| DAA confirmation timeout | Transaction not confirmed within 30-second window | Facilitator returns timeout failure with retry guidance |
| API unavailable | Kaspa API endpoint unreachable | Submission fails; facilitator returns failure |
| Dust output | Output amount below minimum relay threshold | Transaction rejected by network; facilitator returns failure |
| Double-spend conflict | Conflicting transaction confirmed in DAG | Transaction orphaned; facilitator returns failure |
| Price oracle failure | CoinGecko/CoinMarketCap API unavailable | USD conversion fails; facilitator rejects with service error |

## Security Considerations

### Trust Model

| Party | Trust Assumption |
|---|---|
| Client | Trusts that the facilitator will submit the signed transaction and that the resource server will deliver the resource upon valid payment. |
| Resource Server | Trusts the facilitator to correctly verify payment validity and settle on the Kaspa network. |
| Facilitator | Does not trust the client. Independently verifies all transaction fields, address formats, UTXO balance, value bounds, and hex encoding before accepting. |

### Replay Protection

The facilitator maintains a record of submitted transaction IDs. Any transaction whose ID has been previously submitted is rejected. Additionally, Kaspa's UTXO model provides inherent replay protection -- once a UTXO is spent, it cannot be spent again, so replaying the same signed transaction will fail at the network level.

### Address Format

Kaspa addresses use a bech32-like encoding with network-specific prefixes. Mainnet addresses begin with `kaspa:` followed by `q` (P2PKH) or `p` (P2SH). Testnet addresses use the `kaspatest:` prefix. The facilitator MUST validate the address prefix matches the target network and that the address encoding is valid. Cross-network address usage (e.g., mainnet address on testnet) MUST be rejected.

### Double-Spend Risk

Kaspa uses a BlockDAG (Directed Acyclic Graph) architecture rather than a linear blockchain. This means multiple blocks can be produced in parallel, and transaction ordering is determined by the GHOSTDAG protocol. The facilitator mitigates double-spend risk by:

- Verifying the sender's available UTXO balance before submission.
- Performing a balance re-check immediately before settlement.
- Requiring a DAA blue score depth of 10 for confirmation (providing high confidence in finality).
- Relying on the UTXO model's inherent single-spend guarantee.

With ~1-second block times and the parallel block structure of the DAG, Kaspa achieves fast confirmation while maintaining security through the DAA score depth requirement.

## Differences from EVM Exact Scheme

| Aspect | EVM Exact Scheme | Kaspa Exact Scheme |
|---|---|---|
| Account model | Account-based (nonce) | UTXO-based (unspent transaction outputs) |
| Transaction format | RLP-encoded EVM transaction | UTXO transaction with Schnorr signatures |
| Signature algorithm | ECDSA (secp256k1) | Schnorr (secp256k1) |
| Address format | 0x-prefixed hex (EIP-55) | Bech32-like with `kaspa:` prefix |
| Denomination | Wei (10^18) | Sompi (10^8) |
| Replay protection | Nonce-based + tx hash | UTXO single-spend + tx ID tracking |
| Block structure | Linear blockchain | BlockDAG (parallel blocks) |
| Confirmation model | Block confirmations | DAA blue score depth |
| Block time | ~2 seconds (Ethereum) | ~1 second |
| Smart contracts | Yes (EVM) | No (value transfer only) |
| Input limits | N/A (single sender) | MAX_UTXO_INPUTS = 84 |
| Minimum payment | No enforced minimum | MIN_PAYMENT_SOMPI = 10,000 |
| Price conversion | Direct token pricing | USD via price oracle (CoinGecko/CoinMarketCap) |
| Transaction size | Gas-limited | Hex length validated (200 chars min, 100 KB max) |

## Reference Implementation

| Component | Reference |
|---|---|
| npm package | `@erudite-intelligence/x402-kaspa` |
| GitHub | `https://github.com/erudite-intelligence/x402-kaspa` |
| Facilitator | Erudite Intelligence x402 Facilitator |

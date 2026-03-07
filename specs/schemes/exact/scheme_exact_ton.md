# Exact Payment Scheme for TON (BOC) (`exact`)

## Scheme Name

`exact`

## Supported Networks

| Network      | CAIP-2 Identifier |
| ------------ | ----------------- |
| TON Mainnet  | `ton:mainnet`     |
| TON Testnet  | `ton:testnet`     |

## Supported Assets

| Token | Asset Identifier                                             | Decimals | Smallest Unit |
| ----- | ------------------------------------------------------------ | -------- | ------------- |
| TON   | `TON`                                                        | 9        | nanoton       |
| USDT  | `EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs`         | 6        | micro-USDT    |
| USDC  | `EQC_1YoM8RBixN95lz7odcF3Vrkc_N8Ne7gQi7Abtlet_Efi`         | 6        | micro-USDC    |

1 TON = 1,000,000,000 nanoton.

## Protocol Flow

1. Client sends an HTTP request to a resource server protected by x402.
2. Resource server responds with `402 Payment Required` including `PaymentRequirements`.
3. Client parses the `PaymentRequirements` and identifies the `exact` scheme on a TON network.
4. Client determines whether the payment is a native TON transfer or a Jetton (TEP-74) transfer.
5. Client constructs a wallet transfer message using the WalletContractV4 (v4R2) interface.
6. For Jetton transfers, client constructs a TEP-74 transfer body (op=`0xf8a7ea5`) with the Jetton master contract and attaches 0.05 TON for gas.
7. Client sets `validUntil` to a near-future Unix timestamp (current time + expiry window).
8. Client signs the message with Ed25519.
9. Client serializes the signed message to BOC (Bag of Cells) format, base64-encoded.
10. Client computes the message hash and constructs the `PaymentPayload`.
11. Client sends the original HTTP request with the `PaymentPayload` in the `X-PAYMENT` header.
12. Resource server forwards the `PaymentPayload` to the facilitator for verification.
13. Facilitator verifies the BOC according to the verification rules defined below.
14. If verification passes, facilitator settles the transaction by broadcasting the BOC via `sendBoc`.
15. Resource server returns the requested resource to the client.

## PaymentRequirements

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "ton:mainnet",
  "payToAddress": "EQDexampleaddress...",
  "maxAmountRequired": "1000000000",
  "asset": "TON",
  "resource": "https://api.example.com/resource",
  "description": "Access to premium endpoint",
  "mimeType": "application/json",
  "outputSchema": null,
  "extra": null
}
```

| Field              | Description                                                                  |
| ------------------ | ---------------------------------------------------------------------------- |
| `x402Version`      | Protocol version. Must be `1`.                                               |
| `scheme`           | Payment scheme identifier. Must be `exact`.                                  |
| `network`          | CAIP-2 network identifier for the TON network.                               |
| `payToAddress`     | TON address (raw or user-friendly) to receive payment.                       |
| `maxAmountRequired`| Maximum payment amount in the asset's smallest unit (nanoton for TON).       |
| `asset`            | Asset identifier. `TON` for native, or Jetton master contract address.       |
| `resource`         | The URL of the resource being paid for.                                      |
| `description`      | Human-readable description of the resource.                                  |
| `mimeType`         | MIME type of the resource response.                                          |
| `outputSchema`     | Optional JSON schema describing the response.                                |
| `extra`            | Optional additional metadata.                                                |

## PaymentPayload

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "ton:mainnet",
  "payload": {
    "boc": "<base64-encoded-BOC>",
    "msgHash": "<hex-encoded-message-hash>",
    "from": "EQDsenderaddress...",
    "network": "ton:mainnet",
    "validUntil": 1709830800,
    "isJetton": false,
    "jettonMaster": null
  }
}
```

| Field                  | Description                                                              |
| ---------------------- | ------------------------------------------------------------------------ |
| `x402Version`          | Protocol version. Must be `1`.                                           |
| `scheme`               | Payment scheme identifier. Must be `exact`.                              |
| `network`              | CAIP-2 network identifier matching the payment requirements.             |
| `payload.boc`          | Base64-encoded BOC (Bag of Cells) containing the signed message.         |
| `payload.msgHash`      | Hex-encoded hash of the message for tracking and replay protection.      |
| `payload.from`         | Sender's TON address.                                                    |
| `payload.network`      | CAIP-2 network identifier (repeated for payload-level validation).       |
| `payload.validUntil`   | Unix timestamp after which the message expires.                          |
| `payload.isJetton`     | Boolean indicating whether this is a Jetton (TEP-74) transfer.          |
| `payload.jettonMaster` | Jetton master contract address if `isJetton` is true, otherwise `null`. |

## SettlementResponse

```json
{
  "success": true,
  "msgHash": "<hex-encoded-message-hash>",
  "network": "ton:mainnet"
}
```

| Field     | Description                                                             |
| --------- | ----------------------------------------------------------------------- |
| `success` | Boolean indicating whether settlement succeeded.                       |
| `msgHash` | Message hash used to track the settled transaction on TON.              |
| `network` | CAIP-2 network identifier where the transaction was settled.            |

Note: TON does not return a traditional transaction ID on broadcast. The `msgHash` is used as the canonical identifier for tracking.

## Facilitator Verification Rules (MUST)

1. **Network match**: The `network` field in the payload must match the `network` in the payment requirements.
2. **BOC decode**: The base64-encoded BOC must decode to a valid Bag of Cells structure.
   - The root cell must be parseable as a wallet v4R2 external message.
3. **Valid-until check**: The `validUntil` timestamp must satisfy:
   - It must not be in the past (message not expired).
   - It must not be more than 120 seconds in the future (prevents far-future replay).
4. **Transfer detail extraction**: The facilitator must parse the BOC to extract transfer details:
   - Skip the Ed25519 signature (512 bits).
   - Read `subwallet_id` (32 bits).
   - Read `valid_until` (32 bits) and confirm it matches the payload's `validUntil`.
   - Read `seqno` (32 bits).
   - Read `op` code (8 bits, expected `0` for standard send).
   - Parse the internal message to extract destination address and amount.
5. **Destination and amount match**: The extracted destination must match `payToAddress` and the amount must equal or exceed `maxAmountRequired`.
6. **Jetton transfer verification**: If `isJetton` is true:
   - Parse the internal message body for TEP-74 transfer structure.
   - Verify `op` equals `0xf8a7ea5` (Jetton transfer).
   - Extract the Jetton amount and destination from the TEP-74 body.
   - Verify the Jetton master contract matches the `asset` in payment requirements.
   - Verify attached TON covers the 0.05 TON gas requirement.
7. **Balance check**: Verify the sender has sufficient balance for the transfer amount plus gas fees.
8. **Replay protection**: The `msgHash` must not have been previously settled by this facilitator.

## Settlement

1. **Balance re-check**: Verify the sender's account balance is sufficient immediately before broadcast.
2. Broadcast the BOC via the toncenter.com API (`POST /api/v2/sendBoc`).
3. Record the `msgHash` as settled for replay protection.
4. Track the message status by `msgHash` (TON does not return a txid on broadcast).
5. Optionally wait for confirmation (~5 seconds per block).
6. Return the `SettlementResponse` to the resource server.

## Settlement Failure Modes

| Failure                  | Cause                                           | Outcome                                    |
| ------------------------ | ----------------------------------------------- | ------------------------------------------ |
| Message expired          | `validUntil` timestamp passed before broadcast   | Reject payment, client must retry          |
| Insufficient balance     | Sender balance dropped between verify and settle | Transaction fails on-chain; reject         |
| Seqno mismatch           | Another tx from same wallet incremented seqno    | Transaction rejected by network; retry     |
| Duplicate msgHash        | Replay of a previously settled payment           | Reject immediately                         |
| Network timeout          | toncenter.com API unreachable                    | Retry broadcast or reject                  |
| Invalid BOC              | Malformed Bag of Cells structure                 | Reject during verification                 |
| Jetton gas insufficient  | Less than 0.05 TON attached for Jetton transfer  | Reject during verification                 |
| Contract not deployed    | Sender wallet contract not initialized           | Transaction fails on-chain; reject         |

## Security Considerations

### Trust Model

| Party            | Trust Assumption                                                          |
| ---------------- | ------------------------------------------------------------------------- |
| Client           | Trusts the facilitator to broadcast and not withhold the BOC.             |
| Resource Server  | Trusts the facilitator's verification and settlement response.            |
| Facilitator      | Trusts nothing; verifies BOC structure, amounts, and balances on-chain.   |

The facilitator holds a signed BOC between verification and settlement. The `validUntil` field limits the window of exposure: the BOC becomes invalid after expiry. The maximum 120-second future window constrains how long a facilitator can delay broadcast.

### Replay Protection

The facilitator maintains a persistent set of settled `msgHash` values. Any payload presenting a previously-seen `msgHash` is rejected. Additionally, TON wallet contracts enforce sequential `seqno` values, preventing on-chain replay even if the facilitator's dedup store fails.

### Address Format

TON uses two address representations: raw format (`workchain:hex`) and user-friendly format (base64url with flags). Both must resolve to the same account. The facilitator must normalize addresses before comparison.

### Double-Spend Risk

The `validUntil` window (maximum 120 seconds) bounds the risk. If the client sends another transaction from the same wallet incrementing the seqno, the payment BOC becomes invalid. Facilitators should minimize latency between verification and broadcast.

## Differences from EVM Exact Scheme

| Aspect              | EVM Exact                          | TON Exact                                      |
| ------------------- | ---------------------------------- | ---------------------------------------------- |
| Transaction model   | Account-based (EVM)                | Account-based (wallet contracts)               |
| Signing algorithm   | secp256k1 ECDSA                    | Ed25519                                        |
| Payload format      | ABI-encoded call data              | Base64-encoded BOC (Bag of Cells)              |
| Replay protection   | Nonce per account                  | seqno per wallet contract + msgHash dedup      |
| Fee model           | Gas price / EIP-1559               | TON gas units + storage fees                   |
| Finality            | Block confirmation (~12s)          | Block confirmation (~5s)                       |
| Token standard      | ERC-20                             | TEP-74 Jetton                                  |
| Address format      | 0x-prefixed hex (EIP-55)           | Raw or user-friendly base64url                 |
| Smart contracts     | Solidity / EVM bytecode            | FunC / TVM bytecode (wallet v4R2)              |
| Tx identifier       | Transaction hash                   | Message hash (no txid on broadcast)            |
| Expiry mechanism    | None (nonce ordering)              | `validUntil` timestamp (max 120s window)       |

## Reference Implementation

| Component    | Value                                        |
| ------------ | -------------------------------------------- |
| npm package  | `@erudite-intelligence/x402-ton`             |
| GitHub       | Erudite Intelligence LLC                     |
| Facilitator  | x402 Facilitator with TON scheme support     |

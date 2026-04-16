# Scheme: `batch-settlement` on `EVM`

## Summary

The `batch-settlement` scheme on EVM is a **capital-backed** network binding using stateless unidirectional payment channels for high-throughput, low-cost payments. Clients deposit funds into onchain channels once and sign off-chain **cumulative vouchers** per request. Servers verify vouchers with fast signature checks and claim them onchain periodically in batches, reducing both latency and gas costs drastically. A single claim transaction can cover many channels at once and only updates onchain accounting; claimed funds are later transferred to the receiver via a separate settle operation that sweeps many claims into one token transfer.

The scheme supports **dynamic pricing**: the client authorizes a maximum per-request, and the server charges the actual cost within that ceiling.

---

## Channel Lifecycle

### Channel creation and deposits

A channel is created implicitly on the first deposit. The client deposits funds from the `payer` address into an onchain escrow via one of two asset transfer methods: `eip3009` for tokens that support `receiveWithAuthorization` (e.g. USDC) or `permit2` as a universal fallback for any ERC-20. Deposits are sponsored by the facilitator (gasless for the client).

Channel identity is derived from an immutable config struct:
```solidity
struct ChannelConfig {
    address payer;              // Client wallet (EOA or smart wallet)
    address payerAuthorizer;    // EOA for voucher signing, or address(0) for EIP-1271 via payer
    address receiver;           // Server's payment destination (EOA or routing contract)
    address receiverAuthorizer; // Authorizes claims and refunds via EIP-712 signatures
    address token;              // ERC-20 payment token
    uint40  withdrawDelay;      // Seconds before timed withdrawal completes (15 min – 30 days)
    bytes32 salt;               // Differentiates channels with identical parameters
}
```
with `channelId = keccak256(abi.encode(channelConfig))`.

### Requests and vouchers

The channel tracks two values: `balance` (total deposited minus withdrawals and refunds) and `totalClaimed` (cumulative amount claimed by the server). Each voucher the client signs carries a cumulative ceiling (`maxClaimableAmount`). The server can claim up to that ceiling. Because vouchers are monotonically increasing, old vouchers with lower ceilings are naturally superseded.

The server tracks a running total of actual charges per channel (`chargedCumulativeAmount`). For each subsequent request, the client sets the voucher's `maxClaimableAmount` to `chargedCumulativeAmount + amount`, where `amount` is the per-request maximum. 

### Claim and settle

The server claims the latest voucher per channel onchain at its discretion. `claimWithSignature(claims, signature)` allows aggregating claims from multiple channels in one call. Claiming updates `totalClaimed` per channel; no token transfer occurs.

`settle` sweeps all claimed-but-unsettled funds to the `receiver` in one transfer. 

### Refund and withdrawal

**Cooperative refund** (`refundWithSignature`): instant, authorized by the receiver side, returns up to `balance - totalClaimed` to the payer. The refund amount is explicit (partial or full). 

**Timed withdrawal** (escape hatch): the `payer` calls `initiateWithdraw` to start a grace period, during which the server can claim outstanding vouchers. After the withdrawal delay elapses, `finalizeWithdraw` completes the withdrawal. 

### Authorizer roles

**Payer authorizer** (`payerAuthorizer`): if set to a non-zero address (an EOA), vouchers are verified via ECDSA recovery against that committed key ( fast, no RPC required). If set to zero, vouchers are verified against the payer address, supporting EIP-1271 smart wallets at the cost of an RPC call.

**Receiver authorizer** (`receiverAuthorizer`): authorizes claim and refund operations via EIP-712 signatures. The server chooses this address: a server-owned EOA or smart contract (eg for key rotation), or a facilitator-provided address when the server delegates authorization. Must not be zero. Anyone can relay a `claimWithSignature` or `refundWithSignature` transaction with a valid authorization signature from the `receiverAuthorizer`.

### Channel reuse and parameter changes

Channels are long-lived. After a refund, the client can top up and reuse the same channel. However, the channel config is immutable. If any parameter needs to change, a new channel is required. If delegating `receiverAuthorizer` to a facilitator, the server should claim all outstanding vouchers and refund remaining balances on old channels before switching to another facilitator. 

---

## 402 Response (PaymentRequirements)

The 402 response contains pricing terms and the server's channel parameters. The client maps `payTo` → `ChannelConfig.receiver`, `extra.receiverAuthorizer` → `ChannelConfig.receiverAuthorizer`, `asset` → `ChannelConfig.token`, and `extra.withdrawDelay` → `ChannelConfig.withdrawDelay`, then fills in its own `payer`, `payerAuthorizer`, and `salt` to construct the full config.

```json
{
  "scheme": "batch-settlement",
  "network": "eip155:8453",
  "amount": "100000",
  "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "payTo": "0xServerReceiverAddress",
  "maxTimeoutSeconds": 3600,
  "extra": {
    "receiverAuthorizer": "0xReceiverAuthorizerAddress",
    "withdrawDelay": 900,
    "name": "USDC",
    "version": "2"
  }
}
```

| Field                       | Type     | Required | Description                                            |
| --------------------------- | -------- | -------- | ------------------------------------------------------ |
| `extra.receiverAuthorizer`  | `string` | yes      | Address that will authorize claims/refunds              |
| `extra.withdrawDelay`       | `number` | yes      | Withdrawal delay in seconds (15 min – 30 days)         |
| `extra.assetTransferMethod` | `string` | optional | `"eip3009"` (default) or `"permit2"`                   |
| `extra.name`                | `string` | yes      | EIP-712 domain name of the token contract              |
| `extra.version`             | `string` | yes      | EIP-712 domain version of the token contract           |

---

## Client: Payment Construction

The client constructs a payment payload whose type depends on channel state:

- `deposit`: No channel exists or balance is exhausted — client signs a token authorization and voucher
- `voucher`: Channel has sufficient balance — client signs a new cumulative voucher

### Deposit Payload

The `deposit.authorization` field contains the token transfer authorization — exactly one of `erc3009Authorization` or `permit2Authorization` must be present.

```json
{
  "x402Version": 2,
  "accepted": {
    "scheme": "batch-settlement",
    "network": "eip155:8453",
    "amount": "1000",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "payTo": "0xServerReceiverAddress",
    "maxTimeoutSeconds": 3600,
    "extra": {
      "receiverAuthorizer": "0xReceiverAuthorizerAddress",
      "withdrawDelay": 900,
      "name": "USDC",
      "version": "2"
    }
  },
  "payload": {
    "type": "deposit",
    "deposit": {
      "channelConfig": {
        "payer": "0xClientAddress",
        "payerAuthorizer": "0xClientPayerAuthorizerEOA",
        "receiver": "0xServerReceiverAddress",
        "receiverAuthorizer": "0xReceiverAuthorizerAddress",
        "token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "withdrawDelay": 900,
        "salt": "0x0000000000000000000000000000000000000000000000000000000000000000"
      },
      "amount": "100000",
      "authorization": "<erc3009Authorization | permit2Authorization>"
    },
    "voucher": {
      "channelId": "0xabc123...channelId",
      "maxClaimableAmount": "1000",
      "signature": "0x...EIP-712 voucher signature"
    }
  }
}
```

### Voucher Payload

```json
{
  "x402Version": 2,
  "accepted": { "..." : "..." },
  "payload": {
    "type": "voucher",
    "channelConfig": {
      "payer": "0xClientAddress",
      "payerAuthorizer": "0xClientPayerAuthorizerEOA",
      "receiver": "0xServerReceiverAddress",
      "receiverAuthorizer": "0xReceiverAuthorizerAddress",
      "token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "withdrawDelay": 900,
      "salt": "0x0000000000000000000000000000000000000000000000000000000000000000"
    },
    "channelId": "0xabc123...channelId",
    "maxClaimableAmount": "5000",
    "signature": "0x...EIP-712 voucher signature",
    "refund": true
  }
}
```

The optional `refund` flag signals a cooperative refund request. The server will bring onchain claims in line via `claimWithSignature`, then execute `refundWithSignature`.

---

## Server: State & Forwarding

The server is the sole owner of per-channel session state.

### Per-Channel State

The server must maintain per-channel state, keyed by channel ID:

| State Field               | Type            | Description                                                                                |
| ------------------------- | --------------- | ------------------------------------------------------------------------------------------ |
| `channelConfig`           | `ChannelConfig` | Full channel configuration object                                                          |
| `chargedCumulativeAmount` | `uint128`       | Actual accumulated cost for this channel                                                   |
| `signedMaxClaimable`      | `uint128`       | `maxClaimableAmount` from the latest client-signed voucher                                 |
| `signature`               | `bytes`         | Client's voucher signature for the latest `signedMaxClaimable`                             |
| `balance`                 | `uint128`       | Current channel balance (mirrored from onchain)                                            |
| `totalClaimed`            | `uint128`       | Total claimed onchain (mirrored from onchain)                                              |
| `withdrawRequestedAt`     | `uint64`        | Unix timestamp when timed withdrawal was initiated, or 0 if none (mirrored from onchain)   |
| `refundNonce`             | `uint256`       | Next nonce required for `refundWithSignature` (mirrored from onchain)                      |
| `lastRequestTimestamp`    | `uint64`        | Timestamp of the last paid request                                                         |

### Request Processing

The server must serialize request processing per channel and must not update voucher state until the resource handler has succeeded.

1. **Verify**:
   - Check that `payload.maxClaimableAmount == chargedCumulativeAmount + paymentRequirements.amount`. If this fails, reject with `batch_settlement_stale_cumulative_amount` and return a corrective 402.
   - Call facilitator `/verify`.
2. **Execute**: Run the resource handler
3. **On success** — commit state:
   - `chargedCumulativeAmount += actualPrice` (where `actualPrice <= PaymentRequirements.amount`)
   - Mirror `balance`, `totalClaimed`, `withdrawRequestedAt`, and `refundNonce` from the facilitator response
4. **On failure**: State unchanged, client can retry the same voucher.

### Cooperative refund flow

When the server receives a voucher with `refund: true`:

1. Update `chargedCumulativeAmount` as with a normal voucher.
2. Build claim entries for outstanding channels; sign the claim batch as the receiver authorizer.
3. Sign a refund message with the current onchain refund nonce and an amount up to `balance - totalClaimed` after claims.
4. Submit `claimWithSignature(claims, claimSig)` then `refundWithSignature(config, amount, nonce, refundSig)` (order matters: claims first if they increase `totalClaimed`).
5. On success, the chain increments the refund nonce; mirror it in server state and reset session fields as needed.

---

## Facilitator Interface

Uses the standard x402 facilitator interface (`/verify`, `/settle`, `/supported`).

### POST /verify

Verifies a payment payload. Returns the onchain channel snapshot:

```json
{
  "isValid": true,
  "payer": "0xPayerAddress",
  "extra": {
    "channelId": "0xabc123...",
    "balance": "1000000",
    "totalClaimed": "500000",
    "withdrawRequestedAt": 0,
    "refundNonce": "0"
  }
}
```

### POST /settle

| `settleAction`          | When Used                        | Onchain Effect                                                     |
| ----------------------- | -------------------------------- | ------------------------------------------------------------------ |
| `"deposit"`             | First request or top-up          | Deposit via pluggable collector (EIP-3009 or Permit2)              |
| `"claimWithSignature"`  | Server batches voucher claims    | Validate vouchers, update accounting (no transfer)                 |
| `"settle"`              | Server transfers earned funds    | Transfer unsettled amount to receiver                              |
| `"refundWithSignature"` | Cooperative refund               | Return specified amount to payer, increment refund nonce           |

Response:

```json
{
  "success": true,
  "transaction": "0x...transactionHash",
  "network": "eip155:8453",
  "payer": "0xPayerAddress",
  "amount": "700",
  "asset": "0xAssetAddress",
  "extra": {
    "channelId": "0xabc123...",
    "chargedCumulativeAmount": "3200",
    "balance": "100000",
    "totalClaimed": "3200",
    "withdrawRequestedAt": 0,
    "refundNonce": "1"
  }
}
```

### GET /supported

The facilitator declares a receiver authorizer whose role is to produce EIP-712 signatures for claims and refunds. The server may delegate to this address as its channel's `receiverAuthorizer`, or supply its own. Any address in `signers` may relay the resulting transactions.

```json
{
  "kinds": [
    {
      "x402Version": 2,
      "scheme": "batch-settlement",
      "network": "eip155:8453",
      "extra": {
        "receiverAuthorizer": "0xReceiverAuthorizerAddress"
      }
    }
  ],
  "extensions": [],
  "signers": {
    "eip155:*": [
      "0xSignerAddress1",
      "0xSignerAddress2"
    ]
  }
}
```

### Verification Rules

A facilitator must enforce:

1. **Channel config consistency** (deposit and voucher): the config must hash to the claimed channel ID.
2. **Token match**: the channel token must match the payment requirements asset.
3. **Receiver match**: the channel receiver must equal the payment requirements `payTo`.
4. **Receiver authorizer match**: the channel receiver authorizer must equal `extra.receiverAuthorizer`.
5. **Withdraw delay match**: the channel withdraw delay must equal `extra.withdrawDelay`.
6. **Signature validity**: recover the signer from the EIP-712 voucher digest. If the payer authorizer is set, the signer must match it (ECDSA only). If the payer authorizer is zero, validate via `SignatureChecker` against the payer.
7. **Channel existence**: the channel must have a positive balance.
8. **Balance check** (deposit only): the client must have sufficient token balance.
9. **Deposit sufficiency**: `maxClaimableAmount` must be at most `balance` (or `balance + depositAmount` for deposit payloads).
10. **Not below claimed**: `maxClaimableAmount` must exceed onchain `totalClaimed`.
11. **Signed refunds**: the refund nonce must equal the onchain refund nonce; the EIP-712 refund digest must bind the same amount submitted in the transaction.

The facilitator must return the channel snapshot (`balance`, `totalClaimed`, `withdrawRequestedAt`, `refundNonce`) in every `/verify` and `/settle` response `extra` field. If `withdrawRequestedAt` is non-zero, the server should claim outstanding vouchers promptly before the withdraw delay elapses.

---

## Claim & Settlement Strategy

`claimWithSignature(claims, signature)` validates payer voucher signatures and updates accounting across multiple channels in a single transaction. No token transfer occurs. The committed cumulative total per channel is `totalClaimed`, which the receiver authorizer determines up to `maxClaimableAmount`. All channels in a single call must share the same receiver authorizer. Anyone can submit the transaction.

`settle(receiver, token)` transfers all claimed-but-unsettled funds for a receiver+token pair to the receiver in one transfer. Permissionless.

| Strategy          | Description                                    | Trade-off                        |
| ----------------- | ---------------------------------------------- | -------------------------------- |
| **Periodic**      | Claim + settle every N minutes                 | Predictable gas costs            |
| **Threshold**     | Claim + settle when unclaimed amount exceeds T | Bounds server's risk exposure    |
| **On withdrawal** | Claim + settle when withdrawal is initiated    | Minimum gas, maximum risk window |

The server must claim all outstanding vouchers before the withdraw delay elapses. Unclaimed vouchers become unclaimable after `finalizeWithdraw()` reduces the channel balance.

---

## Client Verification Rules

### In-Session

Before signing the next voucher, the client must verify from the payment response:

1. `amount <= PaymentRequirements.amount`
2. `chargedCumulativeAmount == previous + amount`
3. `balance` is consistent with the client's expectation
4. `channelId` matches

If any check fails, the client must not sign further vouchers and should initiate withdrawal.

### Recovery After State Loss

Channel identity is deterministic and fully reconstructible from the 402 response together with the client's own parameters (`payer`, `payerAuthorizer`, `salt`). A single `channels(channelId)` RPC read returns the onchain `balance` and `totalClaimed`.

Recovery occurs in two scenarios:

**Cold start — no local session.** When the client has no stored state for a channel, it recomputes the channel ID from the 402 response and its own parameters, then reads the onchain channel. If `balance == 0`, the channel does not yet exist and the next payment must be a deposit. Otherwise the channel already has funds from a previous session; the client adopts onchain `totalClaimed` as its `chargedCumulativeAmount` baseline and proceeds to sign the next voucher. This is an optimistic guess: if the server has charged beyond `totalClaimed` (it holds an outstanding unclaimed voucher), it will return a corrective 402, handled below.

**Corrective 402 — in-session desync.** When the client's voucher is rejected because its cumulative base is out of sync, the server returns a 402 carrying its view of the channel in `accepts[].extra`. The client recovers from whatever the server can provide:

- **Server holds the last voucher**: `extra` contains `chargedCumulativeAmount`, `signedMaxClaimable`, and `signature`. The client verifies the EIP-712 `Voucher` signature over `(channelId, signedMaxClaimable)` recovers to its own `payerAuthorizer` (or `payer`), then adopts `chargedCumulativeAmount` as the new base and retries.
- **Server does not hold the last voucher** (e.g. its session was evicted after a cooperative refund): `extra` carries no signature fields. The client falls back to onchain state, setting `chargedCumulativeAmount = totalClaimed`, and retries.

---

## Error Codes

| Error Code                                                     | Description                                                                  |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `batch_settlement_stale_cumulative_amount`                     | Client voucher base doesn't match server state; corrective 402               |
| `batch_settlement_evm_channel_not_found`                       | No channel with positive balance for the given channel ID                    |
| `batch_settlement_evm_cumulative_exceeds_balance`              | Voucher `maxClaimableAmount` exceeds onchain balance                         |
| `batch_settlement_evm_cumulative_below_claimed`                | Voucher `maxClaimableAmount` is at or below onchain `totalClaimed`           |
| `batch_settlement_evm_insufficient_balance`                    | Client token balance is insufficient for the deposit                         |
| `batch_settlement_evm_invalid_voucher_signature`               | EIP-712 voucher signature does not recover to the expected signer            |
| `batch_settlement_evm_invalid_scheme`                          | `scheme` is not `batch-settlement`                                           |
| `batch_settlement_evm_network_mismatch`                        | `network` does not match the facilitator's chain                             |
| `batch_settlement_evm_token_mismatch`                          | Channel token does not match the payment requirements asset                  |
| `batch_settlement_evm_channel_id_mismatch`                     | Channel config does not hash to the claimed channel ID                       |
| `batch_settlement_evm_receiver_mismatch`                       | Channel receiver does not match `payTo`                                      |
| `batch_settlement_evm_receiver_authorizer_mismatch`            | Channel receiver authorizer does not match `extra.receiverAuthorizer`        |
| `batch_settlement_evm_withdraw_delay_mismatch`                 | Channel withdraw delay does not match `extra.withdrawDelay`                  |
| `batch_settlement_evm_withdraw_delay_out_of_range`             | Withdraw delay is outside the 15 min – 30 day bounds                         |
| `batch_settlement_evm_deposit_voucher_mismatch`                | Deposit payload config does not match the voucher's channel ID               |
| `batch_settlement_evm_missing_eip712_domain`                   | Token EIP-712 domain (`name`, `version`) could not be read                   |
| `batch_settlement_evm_payload_authorization_valid_before`      | ERC-3009 authorization `validBefore` has already passed                      |
| `batch_settlement_evm_payload_authorization_valid_after`       | ERC-3009 authorization `validAfter` is still in the future                   |
| `batch_settlement_evm_invalid_receive_authorization_signature` | ERC-3009 `receiveWithAuthorization` signature is invalid                     |
| `batch_settlement_evm_erc3009_authorization_required`          | Deposit payload is missing the required `erc3009Authorization`               |
| `batch_settlement_evm_invalid_payload_type`                    | Payload `type` is neither `"deposit"` nor `"voucher"`                        |
| `batch_settlement_evm_refund_not_supported`                    | Server cannot produce `refundWithSignature` (e.g. no signing key)            |
| `batch_settlement_evm_deposit_transaction_failed`              | Onchain deposit transaction reverted                                         |
| `batch_settlement_evm_claim_transaction_failed`                | Onchain claim transaction reverted                                           |
| `batch_settlement_evm_settle_transaction_failed`               | Onchain settle (transfer) transaction reverted                               |
| `batch_settlement_evm_refund_transaction_failed`               | Onchain refund transaction reverted                                          |

---

## Security and Trust

1. **Capital risk and cumulative replay protection**: Clients bear risk up to the signed `maxClaimableAmount`; the receiver authorizer determines actual `totalClaimed` onchain within that bound. Over-claiming is a trust violation, not a protocol violation. The cumulative model makes nonces unnecessary. As `totalClaimed` only increases, and old vouchers are naturally superseded.

2. **Withdrawal delay as escape hatch**: The 15 min – 30 day bounds prevent a server from indefinitely trapping client funds while giving the server a fair window to claim outstanding vouchers. Cooperative refund returns unclaimed balance immediately when the server cooperates; timed withdrawal is the unilateral fallback. Servers bear the risk of vouchers left unclaimed when `finalizeWithdraw` completes.

3. **Cross-function replay prevention**: `Voucher`, `Refund`, and `ClaimBatch` use distinct EIP-712 type hashes so a signature for one cannot be replayed as another. Refunds additionally carry a per-channel nonce.

4. **Voucher expiry via escrow depletion**: Vouchers carry no expiry field. A voucher remains claimable as long as `balance - totalClaimed > 0`; `finalizeWithdraw` and `refundWithSignature` close the claim window by draining available escrow. The ERC-3009 `validBefore`/`validAfter` fields bound only the deposit authorization, not the voucher.

---

## Version History

| Version | Date       | Changes       | Authors                 |
| ------- | ---------- | ------------- | ----------------------- |
| v1.0    | 2025-04-16 | Initial draft | @phdargen @CarsonRoscoe |

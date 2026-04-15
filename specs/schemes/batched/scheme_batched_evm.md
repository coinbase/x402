# Scheme: `batched` on `EVM`

## Summary

The `batched` scheme on EVM is a **capital-backed** network binding using stateless unidirectional payment channels. Clients deposit funds into onchain channels and sign off-chain cumulative vouchers per request. The server accumulates vouchers and batch-claims them onchain at its discretion; claimed funds are transferred to the receiver via a separate settle operation.

Channel identity is derived from an immutable `ChannelConfig` struct: `channelId = keccak256(abi.encode(channelConfig))`. There is no onchain registry — all channel parameters are committed at creation and cannot be changed. To modify any parameter (e.g., rotate a signer), the client withdraws from the old channel and deposits into a new one.

The two-phase **claim/settle** split allows the server to batch-claim vouchers from many clients and batch-settle in separate transactions, minimizing gas costs for high-volume services.

| AssetTransferMethod | Use Case                                                        | Recommendation                                           |
| ------------------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| **`eip3009`**       | Tokens with `receiveWithAuthorization` (e.g., USDC)             | **Recommended** (simplest, truly gasless)                |
| **`permit2`**       | Tokens without EIP-3009, payer already has Permit2 approval     | **Universal Fallback** (works for any ERC-20)            |
| **`direct`**        | Payer sends transaction directly with ERC-20 approval           | **Simplest** (requires payer gas)                        |

Default: `eip3009` if `extra.assetTransferMethod` is omitted.

---

## EVM Core Properties (MUST)

1. **Stateless Channel Identity**: A channel is identified by `channelId = keccak256(abi.encode(channelConfig))`. All parameters are immutable.
2. **Cumulative Vouchers**: Each voucher carries a `maxClaimableAmount` representing the cumulative ceiling the client authorizes. No nonce — replay protection comes from the cumulative model (`totalClaimed` only increases).
3. **Capital-Backed Escrow**: Clients deposit funds into an onchain channel before consuming resources. The deposit is refundable (unclaimed remainder returns on withdrawal) and can be topped up.
4. **Dual-Mode Payer Authorization**: If `payerAuthorizer != address(0)`, vouchers are verified via ECDSA recovery against the committed EOA (fast, stateless, no RPC needed). If `payerAuthorizer == address(0)`, vouchers are verified via `SignatureChecker` against `payer` (supports EIP-1271 smart wallets, requires RPC).
5. **Receiver side**: Direct **`claim`** and cooperative **`refund`** may be submitted by **`receiverAuthorizer`** or **`receiver`**. **`claimWithSignature`** / **`refundWithSignature`** still use signatures from **`receiverAuthorizer`** (anyone may relay). `receiverAuthorizer` can be an EOA or an EIP-1271 contract (e.g., `ClaimAuthorizer` for key rotation).
6. **Cooperative refund (`refund` / `refundWithSignature`)**: Two paths aligned with `initiateWithdraw` — both take an explicit **`amount`** (partial or full; capped by onchain `balance - totalClaimed`). **`refund(config, amount)`** when `msg.sender` is **`receiverAuthorizer`** or **`receiver`**. **`refundWithSignature(config, amount, nonce, sig)`** when anyone relays a signature from `receiverAuthorizer` over EIP-712 `Refund(channelId, nonce, amount)`; `nonce` must match onchain `refundNonce(channelId)` and increments after each successful refund. Supports EOA and EIP-1271 authorizers.

---

## ChannelConfig

All channel parameters are committed in the config struct. The `channelId` is the keccak256 hash of the ABI-encoded struct.

```solidity
struct ChannelConfig {
    address payer;              // Client wallet (EOA or smart wallet)
    address payerAuthorizer;    // EOA for voucher signing, or address(0) for EIP-1271 via payer
    address receiver;           // Server's payment destination (EOA or routing contract)
    address receiverAuthorizer; // EIP-712 claims/refunds; with receiver, may call claim/refund directly
    address token;              // ERC-20 payment token
    uint40  withdrawDelay;      // Seconds before timed withdrawal completes (15 min – 30 days)
    bytes32 salt;               // Differentiates channels with identical parameters
}
```

| Field                | Role |
| -------------------- | ---- |
| `payer`              | The client. Deposits funds, initiates withdrawal requests. Can be a smart wallet. |
| `payerAuthorizer`    | If non-zero: EOA that signs vouchers, enabling stateless off-chain verification. If `address(0)`: vouchers are verified against `payer` via `SignatureChecker` (supports EIP-1271). |
| `receiver`           | Where claimed funds are transferred on `settle()`. Can be an EOA or a routing contract (e.g., `PaymentRouter`, `PaymentSplitter`). |
| `receiverAuthorizer` | Authorizes **`claimWithSignature`** / **`refundWithSignature`** (EIP-712); with **`receiver`**, also allowed to call **`claim`** and **`refund`** directly. Can be an EOA or EIP-1271 contract (e.g., `ClaimAuthorizer`). Must not be `address(0)`. |
| `token`              | The ERC-20 token for this channel. |
| `withdrawDelay`      | Grace period for timed withdrawals. Gives the server time to claim outstanding vouchers. Protocol-enforced bounds: 15 minutes minimum, 30 days maximum. |
| `salt`               | Allows multiple channels with otherwise identical parameters. |

---

## EIP-712 Types

All EIP-712 signatures use the contract's domain (`name: "x402 Batch Settlement"`, `version: "1"`, plus `chainId` and `verifyingContract`).

**Voucher** — signed by `payerAuthorizer` (or `payer` if `payerAuthorizer == address(0)`):

```
Voucher(bytes32 channelId, uint128 maxClaimableAmount)
```

**Refund** — signed by `receiverAuthorizer` for `refundWithSignature` (binds **`amount`** and replay protection via **`nonce`**):

```
Refund(bytes32 channelId, uint256 nonce, uint128 amount)
```

The contract exposes **`getRefundDigest(channelId, nonce, amount)`** for the EIP-712 digest clients and servers should sign.

**ClaimBatch** — signed by `receiverAuthorizer` for `claimWithSignature`. Types are **fully nested** (wallets can display structured rows, not an opaque hash):

```
ClaimEntry(bytes32 channelId, uint128 maxClaimableAmount, uint128 totalClaimed)

ClaimBatch(ClaimEntry[] claims)ClaimEntry(bytes32 channelId,uint128 maxClaimableAmount,uint128 totalClaimed)
```

Encoding follows EIP-712: each entry is `hashStruct(ClaimEntry)`; the dynamic array is `keccak256(abi.encodePacked(entryHash_0, entryHash_1, ...))`; then `hashStruct(ClaimBatch) = keccak256(abi.encode(CLAIM_BATCH_TYPEHASH, thatArrayHash))`. Field values match each `VoucherClaim` row (`channelId` from `keccak256(abi.encode(channelConfig))`, plus `maxClaimableAmount` and **`totalClaimed`** as committed onchain by the receiver authorizer).

**Permit2 deposit witness** (for `permitWitnessTransferFrom`):

```
DepositWitness(bytes32 channelId)
```

with witness type string tying `TokenPermissions` + `DepositWitness` as implemented in [`Permit2DepositCollector`](../../../contracts/evm/src/periphery/Permit2DepositCollector.sol).

---

## 402 Response (PaymentRequirements)

The 402 response contains pricing terms and the server's channel parameters. The client uses `payTo` as `ChannelConfig.receiver` and fills in `payer`, `payerAuthorizer`, `token`, and `salt` to construct the full `ChannelConfig`.

```json
{
  "scheme": "batched",
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

The `payTo` field serves as `ChannelConfig.receiver` — no separate `extra.receiver` is needed.

| Field                          | Type     | Required | Description |
| ------------------------------ | -------- | -------- | ----------- |
| `extra.receiverAuthorizer`     | `string` | yes      | Receiver authorizer address (EOA or EIP-1271 contract) |
| `extra.withdrawDelay`          | `number` | yes      | Withdrawal delay in seconds (15 min – 30 days) |
| `extra.assetTransferMethod`    | `string` | optional | `"eip3009"` (default), `"permit2"`, or `"direct"` |
| `extra.name`                   | `string` | yes      | EIP-712 domain name of the token contract |
| `extra.version`                | `string` | yes      | EIP-712 domain version of the token contract |

---

## Client: Payment Construction

The client constructs a `PaymentPayload` whose type depends on channel state:

- **`deposit`**: No channel exists or balance is exhausted — client signs a token authorization and first voucher
- **`voucher`**: Channel has sufficient balance — client signs a new cumulative voucher

### Deposit Payload

The `deposit.authorization` field contains the token transfer authorization — exactly one of `erc3009Authorization`, `permit2Authorization`, or `directDeposit` MUST be present.

```json
{
  "x402Version": 2,
  "accepted": {
    "scheme": "batched",
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
    "withdraw": true
  }
}
```

The optional `withdraw` flag signals a cooperative **refund** request (server will use `refund` / `refundWithSignature` with an agreed **`amount`**, after bringing onchain claims in line via `claim` / `claimWithSignature`).

---

## Server: State & Forwarding

The server is the sole owner of per-channel session state.

### Per-Channel State

The server MUST maintain per-channel state, keyed by `channelId`:

| State Field               | Type            | Description                                                     |
| ------------------------- | --------------- | --------------------------------------------------------------- |
| `channelConfig`           | `ChannelConfig` | Full channel configuration object |
| `chargedCumulativeAmount` | `uint128`       | Actual accumulated cost for this channel                        |
| `signedMaxClaimable`      | `uint128`       | `maxClaimableAmount` from the latest client-signed voucher      |
| `signature`               | `bytes`         | Client's voucher signature for `signedMaxClaimable`             |
| `balance`                 | `uint128`       | Current channel balance (mirrored from onchain)                 |
| `totalClaimed`            | `uint128`       | Total claimed onchain (mirrored from onchain)                   |
| `withdrawRequestedAt`     | `uint64`        | Unix timestamp when timed withdrawal was initiated, or `0` if none (mirrored from onchain) |
| `refundNonce`             | `uint256`       | Next `nonce` required for `refundWithSignature` (mirrored from onchain `refundNonce(channelId)`) |
| `lastRequestTimestamp`     | `uint64`        | Timestamp of the last paid request                              |

### Request Processing (MUST)

The server MUST serialize request processing per channel. The server MUST NOT update voucher state until the resource handler has succeeded.

1. **Verify**: Check increment locally, call facilitator `/verify`
2. **Execute**: Run the resource handler
3. **On success** — commit state:
   - `chargedCumulativeAmount += actualPrice` (where `actualPrice <= PaymentRequirements.amount`)
   - Mirror `balance`, `totalClaimed`, `withdrawRequestedAt`, and `refundNonce` from the facilitator response
4. **On failure**: State unchanged, client can retry the same voucher.

### Cooperative refund settle flow

When the server receives a voucher with `withdraw: true`:

**Path A — Signature path (`refundWithSignature`, relayer-friendly):**

1. Update `chargedCumulativeAmount` as with a normal voucher.
2. Build `VoucherClaim[]` for outstanding rows; sign **`ClaimBatch`** (nested `ClaimEntry` types) as the `receiverAuthorizer`.
3. Sign **`Refund(channelId, nonce, amount)`** with the same `nonce` as onchain `refundNonce(channelId)` and `amount ≤ balance - totalClaimed` after claims (often full available).
4. Submit **`claimWithSignature(claims, claimSig)`** then **`refundWithSignature(config, amount, nonce, refundSig)`** (order matters: claims first if they increase `totalClaimed`).
5. On success, the chain increments `refundNonce`; mirror it in server state and reset session fields as needed.

**Path B — Direct-call path (`refund`, facilitator is `receiverAuthorizer` or `receiver`):**

1. Update `chargedCumulativeAmount` as with a normal voucher.
2. Build voucher claims with **`totalClaimed`** equal to the new cumulative committed total.
3. The facilitator calls **`claim(claims)`** then **`refund(config, amount)`** as `msg.sender` (**`receiverAuthorizer`** or **`receiver`**).
4. On success, mirror the updated onchain **`refundNonce`** (incremented after every successful refund, direct or signed).

---

## Facilitator Interface

Uses the standard x402 facilitator interface (`/verify`, `/settle`, `/supported`). The facilitator is an SDK-level convenience — it is not committed in the channel config.

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

(`refundNonce` mirrors `refundNonce(channelId)` for signed refund flows.)

### POST /settle

| `settleAction`          | When Used                        | Onchain Effect                                         |
| ----------------------- | -------------------------------- | ------------------------------------------------------ |
| `"deposit"`             | First request or top-up          | `deposit(config, amount, collector, collectorData)` — tokens via pluggable collector |
| `"claim"`               | Server batches voucher claims    | Validate vouchers, update accounting (no transfer)     |
| `"claimWithSignature"`  | Claim via receiverAuthorizer sig | Same as `claim`; nested EIP-712 `ClaimBatch`          |
| `"settle"`              | Server transfers earned funds    | Transfer unsettled amount to receiver                  |
| `"refund"`              | Cooperative refund (direct)      | `refund(config, amount)` — caller must be `receiverAuthorizer` or `receiver`; **partial or full** refund to payer |
| `"refundWithSignature"` | Cooperative refund (signed)      | `refundWithSignature(config, amount, nonce, sig)` — `Refund` digest + nonce replay protection |

**Response:**

```json
{
  "success": true,
  "transaction": "0x...transactionHash",
  "network": "eip155:8453",
  "payer": "0xPayerAddress",
  "amount": "700",
  "extra": {
    "channelId": "0xabc123...",
    "balance": "100000",
    "totalClaimed": "3200",
    "withdrawRequestedAt": 0,
    "refundNonce": "1"
  }
}
```

### GET /supported

```json
{
  "kinds": [
    { "x402Version": 2, "scheme": "batched", "network": "eip155:8453" }
  ]
}
```

### Verification Rules (MUST)

A facilitator MUST enforce:

1. **Channel config consistency** (`deposit` and `voucher`): `keccak256(abi.encode(channelConfig)) == channelId`. The client-provided config MUST hash to the claimed channel id.
2. **Token match**: `channelConfig.token` MUST match `paymentRequirements.asset`.
3. **Receiver match**: `channelConfig.receiver` MUST equal `paymentRequirements.payTo`.
4. **Receiver authorizer match**: `channelConfig.receiverAuthorizer` MUST equal `paymentRequirements.extra.receiverAuthorizer`.
5. **Withdraw delay match**: `channelConfig.withdrawDelay` MUST equal `paymentRequirements.extra.withdrawDelay`.
6. **Signature validity**: Recover the signer from the EIP-712 `Voucher` digest. If `payerAuthorizer != address(0)`, the signer MUST equal `payerAuthorizer` (ECDSA only). If `payerAuthorizer == address(0)`, validate via `SignatureChecker` against `payer`.
7. **Channel existence**: The channel MUST have a positive balance (`balance > 0`).
8. **Balance check** (`deposit` only): Client MUST have sufficient token balance.
9. **Deposit sufficiency**: `maxClaimableAmount` MUST be `<= balance` (or `<= balance + depositAmount` for deposit payloads).
10. **Not below claimed**: `maxClaimableAmount` MUST be `> totalClaimed`.
11. **Signed refunds** (`refundWithSignature`): `nonce` MUST equal onchain `refundNonce(channelId)`; EIP-712 `Refund` digest MUST include the same **`amount`** submitted in the transaction.

The facilitator MUST return the channel snapshot (`balance`, `totalClaimed`, `withdrawRequestedAt`, and **`refundNonce`** where applicable) in every `/verify` and `/settle` response `extra` field. If `withdrawRequestedAt != 0`, the server should claim outstanding vouchers promptly before the withdraw delay elapses.

#### Server Check (off-chain)

The server MUST additionally verify:

- `payload.maxClaimableAmount == chargedCumulativeAmount + paymentRequirements.amount`

If the check fails, reject with `batch_settlement_stale_cumulative_amount` and return a corrective 402.

---

## Claim & Settlement Strategy

**`claim(VoucherClaim[])`** validates payer voucher signatures and updates accounting across multiple channels in a single transaction. No token transfer occurs. The committed cumulative total is **`totalClaimed`** (receiver authorizer–determined, `≤ maxClaimableAmount`). Caller must be **`receiverAuthorizer`** or **`receiver`** for each row's channel.

**`claimWithSignature(VoucherClaim[], bytes)`** performs the same accounting but accepts an off-chain `receiverAuthorizer` signature over EIP-712 **`ClaimBatch`** / **`ClaimEntry`** (see above). Anyone can submit the transaction.

**`settle(address, address)`** transfers all claimed-but-unsettled funds for a receiver+token pair to the receiver in one transfer. Permissionless — anyone can call.

```
struct Voucher {
    ChannelConfig channel;
    uint128 maxClaimableAmount;  // client-signed cumulative ceiling
}

struct VoucherClaim {
    Voucher voucher;
    bytes signature;             // EIP-712 Voucher signature from payerAuthorizer (or payer)
    uint128 totalClaimed;        // receiverAuthorizer-determined cumulative claimed total (onchain)
}
```

| Strategy            | Description                                             | Trade-off                        |
| ------------------- | ------------------------------------------------------- | -------------------------------- |
| **Periodic**        | Claim + settle every N minutes                          | Predictable gas costs            |
| **Threshold**       | Claim + settle when unclaimed amount exceeds T          | Bounds server's risk exposure    |
| **On withdrawal**   | Claim + settle when withdrawal is initiated             | Minimum gas, maximum risk window |

The server MUST claim all outstanding vouchers before the withdraw delay elapses. Unclaimed vouchers become unclaimable after `finalizeWithdraw()` reduces the channel balance.

---

## Trust Model

The `batched` scheme operates under the following trust assumptions:

1. **Client trusts server for claim amounts**: The client signs `maxClaimableAmount` (a ceiling). The `receiverAuthorizer` determines the actual **`totalClaimed`** onchain within that bound. Over-claiming is a trust violation, not a protocol violation. The client's risk is bounded by `maxClaimableAmount - totalClaimed`.

2. **ReceiverAuthorizer is server-controlled**: The `receiverAuthorizer` is committed in the `ChannelConfig` and jointly agreed upon by client and server. It authorizes **`claimWithSignature`** / **`refundWithSignature`** and, together with **`receiver`**, may call **`claim`** / **`refund`** directly. It can be an EOA, a hot wallet, or an EIP-1271 contract like `ClaimAuthorizer` for key rotation.

3. **Receiver side authorizes cooperative refunds**: **`refund(config, amount)`** accepts **`msg.sender == receiverAuthorizer`** or **`msg.sender == receiver`**. **`refundWithSignature`** still requires an EIP-712 signature from **`receiverAuthorizer`** (anyone may relay). **`Refund`** binds **`amount`**; **`nonce`** replays are prevented per channel. Supports EIP-1271 for smart contract authorizers.

4. **Incremental signing bounds risk**: The SDK signs `maxClaimableAmount = chargedSoFar + oneRequestMax` for each request. The gap between actual consumption and the authorized ceiling is at most one request's price.

---

## Channel Discovery

A channel is identified by `channelId = keccak256(abi.encode(channelConfig))`. The client knows all config fields from the 402 response and its own parameters. A single RPC read of `channels[channelId]` retrieves current state.

For state recovery after client state loss, channels can be discovered via `ChannelCreated` events indexed by payer address.

---

## Client Verification Rules (MUST)

### In-Session

Before signing the next voucher, the client MUST verify from `PAYMENT-RESPONSE`:

1. `amount <= PaymentRequirements.amount`
2. `chargedCumulativeAmount == previous + amount`
3. `balance` is consistent with the client's expectation
4. `channelId` matches

If any check fails, the client MUST NOT sign further vouchers and SHOULD initiate withdrawal.

### Recovery After State Loss

The client reads the channel onchain via `channels[channelId]`. If the server holds unsettled vouchers above the onchain state, it returns a corrective 402 with `chargedCumulativeAmount`, `signedMaxClaimable`, and `signature`. The client MUST verify the returned voucher signature matches its own `payerAuthorizer` (or `payer`) before resuming.

---

## Periphery contracts (deposits)

Deposits use **`IDepositCollector`** implementations that pull tokens from the payer into `x402BatchSettlement` (witness-bound to `channelId` where applicable). The reference repo ships:

- **[`DepositCollector`](../../../contracts/evm/src/periphery/DepositCollector.sol)** — abstract base (binds collector to settlement).
- **[`ERC3009DepositCollector`](../../../contracts/evm/src/periphery/ERC3009DepositCollector.sol)** — ERC-3009 `receiveWithAuthorization`.
- **[`Permit2DepositCollector`](../../../contracts/evm/src/periphery/Permit2DepositCollector.sol)** — Permit2 `permitWitnessTransferFrom` with optional EIP-2612 `permit` segment in `collectorData` for tokens that need it.

Optional deployment patterns (not required by the core contract; may live in other packages):

- **PaymentRouter** — mutable `receiver` proxy for `settle()` proceeds.
- **PaymentSplitter** — multi-payee split.
- **ClaimAuthorizer** — EIP-1271 `receiverAuthorizer` with rotatable keys.

---

## Lifecycle Summary

- **Channel Creation**: Implicit on first deposit. The `ChannelConfig` is immutable — all parameters are committed at creation.
- **Deposit & Top-Up**: Deposits create or top up channel **`balance`**. A top-up does **not** clear a pending timed withdrawal; clients and servers should coordinate if both deposit and `initiateWithdraw` are in play.
- **Claim & Settle**: `claim()` (or `claimWithSignature()`) validates voucher signatures and updates accounting (no transfer). `settle()` sweeps all claimed-but-unsettled funds for a receiver+token pair in one transfer.
- **Refund & withdrawal**: **Cooperative refund** — `refund(config, amount)` or `refundWithSignature(config, amount, nonce, sig)` returns up to **`balance - totalClaimed`** to the payer (partial or full); requested **`amount`** is **capped** to available unclaimed escrow (no revert if over). **Timed withdrawal** — `initiateWithdraw(config, amount)` (**`payer`** or **`payerAuthorizer`**) → wait **`withdrawDelay`** → **`finalizeWithdraw(config)`** (caller must be **`payer`** or **`payerAuthorizer`**). Any successful refund clears a pending timed withdrawal for that channel (onchain).
- **Parameter Changes**: To rotate `payerAuthorizer`, change `receiverAuthorizer`, or modify other config fields, the client withdraws from the old channel and deposits into a new one. No atomic migration helper — this is a deliberate simplification.
- **Token transfers**: Implementations MUST handle both standard and non-standard ERC-20 return values (e.g., USDT).

---

## Error Codes

Implementers MUST use the generic `batched` error codes from [scheme_batch_settlement.md](./scheme_batch_settlement.md#error-codes) when applicable.

EVM-specific codes:

| Error Code                                          | Description                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `batch_settlement_evm_channel_not_found`            | No channel with positive balance for the given `channelId`         |
| `batch_settlement_evm_withdrawal_pending`           | Withdrawal request is pending on this channel                      |
| `batch_settlement_evm_cumulative_exceeds_balance`   | Voucher `maxClaimableAmount` exceeds onchain balance               |
| `batch_settlement_evm_withdraw_delay_out_of_range`  | `withdrawDelay` is outside the 15 min – 30 day bounds             |
| `batch_settlement_stale_cumulative_amount`          | Client voucher base doesn't match server state; corrective 402    |
| `batch_settlement_evm_refund_not_supported`          | Server cannot produce `refund` / `refundWithSignature` (e.g. no signing key) |
| `batch_settlement_evm_channel_id_mismatch`           | `channelConfig` does not hash to the claimed `channelId`             |
| `batch_settlement_evm_receiver_mismatch`             | `channelConfig.receiver` does not match `paymentRequirements.payTo`  |
| `batch_settlement_evm_receiver_authorizer_mismatch`  | `channelConfig.receiverAuthorizer` does not match `extra.receiverAuthorizer` |
| `batch_settlement_evm_withdraw_delay_mismatch`       | `channelConfig.withdrawDelay` does not match `extra.withdrawDelay`   |

---

## Security Considerations

1. **Capital risk**: Clients bear risk up to their `maxClaimableAmount` ceiling. Servers bear risk of unclaimed vouchers during the withdrawal delay.
2. **Withdrawal delay**: Bounds (15 min – 30 day) prevent unreasonable delays that trap funds. Cooperative **`refund`** provides an immediate return of unclaimed balance when the server cooperates; otherwise the payer uses timed **`initiateWithdraw` / `finalizeWithdraw`**.
3. **Dual-mode payer verification**: When `payerAuthorizer` is set, vouchers are verified statelessly via ECDSA — no RPC required. When `payerAuthorizer == address(0)`, verification falls back to `SignatureChecker` against `payer`, supporting EIP-1271 smart wallets at the cost of an RPC call.
4. **Receiver-side commitment**: For direct **`claim`** and **`refund`**, `msg.sender` must be **`receiverAuthorizer`** or **`receiver`**. For **`claimWithSignature`** and **`refundWithSignature`**, signatures are verified against **`receiverAuthorizer`**.
5. **Cumulative replay protection**: Without nonces, the cumulative model ensures `totalClaimed` only increases. Old vouchers with lower ceilings are naturally superseded. The client's risk gap is bounded by incremental signing.
6. **Cross-function replay prevention**: **`Voucher`**, **`Refund`**, and **`ClaimBatch`** use distinct EIP-712 type hashes; **`Refund`** additionally scopes replay with a per-channel **`nonce`**.

---

## Annex

### Reference Implementation: `x402BatchSettlement`

The reference implementation is deployed via CREATE2 (same address on all EVM chains). Source: [`contracts/evm/src/x402BatchSettlement.sol`](../../../contracts/evm/src/x402BatchSettlement.sol).

### Deposit collectors (same repo)

- [`DepositCollector`](../../../contracts/evm/src/periphery/DepositCollector.sol), [`ERC3009DepositCollector`](../../../contracts/evm/src/periphery/ERC3009DepositCollector.sol), [`Permit2DepositCollector`](../../../contracts/evm/src/periphery/Permit2DepositCollector.sol) — see [Periphery contracts (deposits)](#periphery-contracts-deposits).

### Canonical Permit2

The Canonical Permit2 contract address can be found at [https://docs.uniswap.org/contracts/v4/deployments](https://docs.uniswap.org/contracts/v4/deployments).

---

## Version History

| Version | Date       | Changes                                                              | Author         |
| ------- | ---------- | -------------------------------------------------------------------- | -------------- |
| v0.10   | 2026-04-14 | Direct **`claim`** / **`refund`**: `msg.sender` may be **`receiver`** or **`receiverAuthorizer`** (unchanged: **`claimWithSignature`** / **`refundWithSignature`** verify **`receiverAuthorizer`** only) | @CarsonRoscoe  |
| v0.9    | 2026-04-14 | Align doc with `x402BatchSettlement`: nested EIP-712 **`ClaimBatch`/`ClaimEntry`**; **`Refund(channelId, nonce, amount)`** + **`refund`/`refundWithSignature`** (partial/full cooperative refund); **`finalizeWithdraw`** caller = `payer` or `payerAuthorizer`; `VoucherClaim.totalClaimed`; deposit collectors in-repo; deposits do not cancel pending withdraw; facilitator/`refundNonce` notes | @CarsonRoscoe  |
| v0.9    | 2026-04-09 | `finalizeWithdraw` permissionless after delay; removed `finalizeWithdrawWithSignature`, `FinalizeWithdraw` EIP-712 type and `getFinalizeWithdrawDigest`; Dual-path cooperative withdraw: `cooperativeWithdraw(config)` msg.sender-gated + `cooperativeWithdrawWithSignature(config, sig)` signature-based; Voucher payload now includes `channelConfig` | @phdargen      |
| v0.8    | 2026-04-08 | Dual-authorizer model: `payerAuthorizer` (EOA or address(0) for EIP-1271), `receiverAuthorizer` replaces `facilitator`, `claimWithSignature` and `finalizeWithdrawWithSignature`, removed migration helper, added `ClaimAuthorizer` periphery, removed EIP-1271 from PaymentRouter/PaymentSplitter | @CarsonRoscoe  |
| v0.7    | 2026-04-08 | Stateless channel-config model: immutable ChannelConfig, 2 typehashes, nonce-less cumulative vouchers, committed facilitator, cooperative withdraw via receiver signature, channel migration, EIP-1271 for non-voucher ops | @CarsonRoscoe  |
| v0.6    | 2026-04-07 | Multi-token subchannels, client signer delegation, withdrawWindow bounds, replay-protected requestWithdrawalFor, renamed to `batched` | @CarsonRoscoe  |
| v0.5    | 2026-04-02 | Add cooperativeWithdraw                                              | @phdargen      |
| v0.4    | 2026-03-31 | Service registry + subchannel architecture                           | @CarsonRoscoe  |
| v0.3    | 2026-03-31 | Add voucherId for concurrency                                        | @phdargen      |
| v0.2    | 2025-03-30 | Add dynamic price                                                    | @phdargen      |
| v0.1    | 2025-03-21 | Initial draft                                                        | @phdargen      |
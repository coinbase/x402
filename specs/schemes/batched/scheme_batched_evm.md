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
5. **Receiver Authorizer**: The `receiverAuthorizer` address controls claim authorization and cooperative withdrawals. Can be an EOA or an EIP-1271 contract (e.g., `ClaimAuthorizer` for key rotation).
6. **Cooperative Withdrawal**: Two paths — `cooperativeWithdraw(config)` when the caller IS the `receiverAuthorizer` (direct call), or `cooperativeWithdrawWithSignature(config, sig)` when an off-chain `receiverAuthorizer` signature is provided. Supports both EOA and EIP-1271 (smart contract) authorizers.

---

## ChannelConfig

All channel parameters are committed in the config struct. The `channelId` is the keccak256 hash of the ABI-encoded struct.

```solidity
struct ChannelConfig {
    address payer;              // Client wallet (EOA or smart wallet)
    address payerAuthorizer;    // EOA for voucher signing, or address(0) for EIP-1271 via payer
    address receiver;           // Server's payment destination (EOA or routing contract)
    address receiverAuthorizer; // Controls claims, cooperative withdraw
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
| `receiverAuthorizer` | The address that authorizes claims (direct call or signature) and cooperative withdrawals. Can be an EOA or EIP-1271 contract (e.g., `ClaimAuthorizer`). Must not be `address(0)`. |
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

**CooperativeWithdraw** — signed by `receiverAuthorizer` for `cooperativeWithdrawWithSignature`:

```
CooperativeWithdraw(bytes32 channelId)
```

**ClaimBatch** — signed by `receiverAuthorizer` for `claimWithSignature`:

```
ClaimBatch(bytes32 claimsHash)
```

where `claimsHash = keccak256(abi.encodePacked(h_0, h_1, ...))` and each `h_i = keccak256(abi.encode(channelId_i, maxClaimableAmount_i, claimAmount_i))`.

**Permit2 Deposit Witness:**

```
DepositWitness(bytes32 channelId)
```

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

The optional `withdraw` flag signals a cooperative withdraw request.

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
| `lastRequestTimestamp`     | `uint64`        | Timestamp of the last paid request                              |

### Request Processing (MUST)

The server MUST serialize request processing per channel. The server MUST NOT update voucher state until the resource handler has succeeded.

1. **Verify**: Check increment locally, call facilitator `/verify`
2. **Execute**: Run the resource handler
3. **On success** — commit state:
   - `chargedCumulativeAmount += actualPrice` (where `actualPrice <= PaymentRequirements.amount`)
   - Mirror `balance`, `totalClaimed`, `withdrawRequestedAt` from the facilitator response
4. **On failure**: State unchanged, client can retry the same voucher.

### Cooperative Withdraw Settle Flow

When the server receives a voucher with `withdraw: true`:

**Path A — Server has `receiverAuthorizerSigner` (signature path):**

1. Update `chargedCumulativeAmount` as with a normal voucher.
2. Sign a `CooperativeWithdraw(channelId)` digest as the `receiverAuthorizer`.
3. Sign a `ClaimBatch(claimsHash)` digest for the outstanding claims.
4. Build a voucher claim with `claimAmount = chargedCumulativeAmount - totalClaimed`.
5. Submit a `cooperativeWithdrawWithSignature` settle action containing the claim, receiverAuthorizer signature, and claim authorizer signature.
6. On success, reset the session for that channel.

**Path B — Facilitator IS the `receiverAuthorizer` (direct-call path):**

1. Update `chargedCumulativeAmount` as with a normal voucher.
2. Build a voucher claim with `claimAmount = chargedCumulativeAmount - totalClaimed`.
3. Submit a `cooperativeWithdraw` settle action containing the claim (no signatures).
4. The facilitator calls `claim(claims)` then `cooperativeWithdraw(config)` as `msg.sender`.
5. On success, reset the session for that channel.

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
    "withdrawRequestedAt": 0
  }
}
```

### POST /settle

| `settleAction`          | When Used                        | Onchain Effect                                         |
| ----------------------- | -------------------------------- | ------------------------------------------------------ |
| `"deposit"`             | First request or top-up          | Deposit tokens into channel                            |
| `"claim"`               | Server batches voucher claims    | Validate vouchers, update accounting (no transfer)     |
| `"claimWithSignature"`  | Claim via receiverAuthorizer sig | Same as claim, anyone can submit with valid signature  |
| `"settle"`              | Server transfers earned funds    | Transfer unsettled amount to receiver                  |
| `"cooperativeWithdraw"` | Instant refund (msg.sender-gated) | Refund unclaimed deposits to payer (caller is receiverAuthorizer) |
| `"cooperativeWithdrawWithSignature"` | Instant refund (signature-authorized) | Refund unclaimed deposits to payer (off-chain receiverAuthorizer signature) |

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
    "withdrawRequestedAt": 0
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

The facilitator MUST return the channel snapshot (`balance`, `totalClaimed`, `withdrawRequestedAt`) in every `/verify` and `/settle` response `extra` field. If `withdrawRequestedAt != 0`, the server should claim outstanding vouchers promptly before the withdraw delay elapses.

#### Server Check (off-chain)

The server MUST additionally verify:

- `payload.maxClaimableAmount == chargedCumulativeAmount + paymentRequirements.amount`

If the check fails, reject with `batch_settlement_stale_cumulative_amount` and return a corrective 402.

---

## Claim & Settlement Strategy

**`claim(VoucherClaim[])`** validates payer voucher signatures and updates accounting across multiple channels in a single transaction. No token transfer occurs. The `claimAmount` is determined by the `receiverAuthorizer`. Caller must be the `receiverAuthorizer`.

**`claimWithSignature(VoucherClaim[], bytes)`** performs the same accounting but accepts an off-chain `receiverAuthorizer` signature instead of requiring the authorizer to be `msg.sender`. Anyone can submit the transaction.

**`settle(address, address)`** transfers all claimed-but-unsettled funds for a receiver+token pair to the receiver in one transfer. Permissionless — anyone can call.

```
struct Voucher {
    ChannelConfig channel;
    uint128 maxClaimableAmount;  // client-signed cumulative ceiling
}

struct VoucherClaim {
    Voucher voucher;
    bytes signature;             // EIP-712 Voucher signature from payerAuthorizer (or payer)
    uint128 claimAmount;         // receiverAuthorizer-determined actual claim
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

1. **Client trusts server for claim amounts**: The client signs `maxClaimableAmount` (a ceiling). The `receiverAuthorizer` determines the actual `claimAmount` within that bound. Over-claiming is a trust violation, not a protocol violation. The client's risk is bounded by `maxClaimableAmount - totalClaimed`.

2. **ReceiverAuthorizer is server-controlled**: The `receiverAuthorizer` is committed in the `ChannelConfig` and jointly agreed upon by client and server. It controls claim authorization and cooperative withdrawal. It can be an EOA, a hot wallet, or an EIP-1271 contract like `ClaimAuthorizer` for key rotation.

3. **Receiver authorizes cooperative withdrawals**: The `receiverAuthorizer` (not the receiver itself) authorizes instant refunds — either as `msg.sender` via `cooperativeWithdraw(config)` or via off-chain signature through `cooperativeWithdrawWithSignature(config, sig)`. This ensures the server's authorized agent decides to forgo revenue. Supports EIP-1271 for smart contract authorizers.

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

## Periphery Contracts

Three example periphery contracts are provided for common use cases:

### PaymentRouter

A mutable `receiver` proxy. Deploy and set as `ChannelConfig.receiver`. Funds from `settle()` arrive here; authorizers call `forward()` to route them to the current destination. Supports `updateDestination()` to change routing without opening a new channel.

### PaymentSplitter

Like `PaymentRouter` but distributes to multiple payees by basis-point shares. `distribute()` splits funds per configured shares; `updatePayees()` changes the split.

### ClaimAuthorizer

An EIP-1271 contract used as `ChannelConfig.receiverAuthorizer`. Allows servers to rotate claim-signing keys without opening new channels. Multiple authorizer EOAs are supported for redundancy and key rotation. The contract validates signatures from any registered authorizer.

---

## Lifecycle Summary

- **Channel Creation**: Implicit on first deposit. The `ChannelConfig` is immutable — all parameters are committed at creation.
- **Deposit & Top-Up**: Deposits create or top up a channel. Deposits cancel pending withdrawal requests.
- **Claim & Settle**: `claim()` (or `claimWithSignature()`) validates voucher signatures and updates accounting (no transfer). `settle()` sweeps all claimed-but-unsettled funds for a receiver+token pair in one transfer.
- **Withdrawal**: Two paths — cooperative (instant, via `cooperativeWithdraw` when caller is receiverAuthorizer, or `cooperativeWithdrawWithSignature` with off-chain signature), or timed (`initiateWithdraw` → wait `withdrawDelay` → `finalizeWithdraw`).
- **Parameter Changes**: To rotate `payerAuthorizer`, change `receiverAuthorizer`, or modify other config fields, the client withdraws from the old channel and deposits into a new one. No atomic migration helper — this is a deliberate simplification.
- **Token transfers**: Implementations MUST handle both standard and non-standard ERC-20 return values (e.g., USDT).

---

## Error Codes

Implementers MUST use the generic `batched` error codes from [scheme_batch_settlement.md](./scheme_batch_settlement.md#error-codes) when applicable.

EVM-specific codes:

| Error Code                                                    | Description                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `batch_settlement_evm_channel_not_found`                      | No channel with positive balance for the given `channelId`                     |
| `batch_settlement_evm_withdrawal_pending`                     | Withdrawal request is pending on this channel                                  |
| `batch_settlement_evm_cumulative_exceeds_balance`             | Voucher `maxClaimableAmount` exceeds onchain balance                           |
| `batch_settlement_evm_cumulative_below_claimed`               | Voucher `maxClaimableAmount` is at or below `totalClaimed`                     |
| `batch_settlement_evm_withdraw_delay_out_of_range`            | `withdrawDelay` is outside the 15 min – 30 day bounds                         |
| `batch_settlement_evm_channel_id_mismatch`                    | `channelConfig` does not hash to the claimed `channelId`                       |
| `batch_settlement_evm_receiver_mismatch`                      | `channelConfig.receiver` does not match `paymentRequirements.payTo`            |
| `batch_settlement_evm_receiver_authorizer_mismatch`           | `channelConfig.receiverAuthorizer` does not match `extra.receiverAuthorizer`   |
| `batch_settlement_evm_withdraw_delay_mismatch`                | `channelConfig.withdrawDelay` does not match `extra.withdrawDelay`             |
| `batch_settlement_evm_token_mismatch`                         | `channelConfig.token` does not match `paymentRequirements.asset`               |
| `batch_settlement_evm_invalid_voucher_signature`              | Voucher EIP-712 signature verification failed                                  |
| `batch_settlement_evm_insufficient_balance`                   | Payer token balance is insufficient for the deposit amount                     |
| `batch_settlement_evm_deposit_transaction_failed`             | Onchain deposit transaction reverted                                          |
| `batch_settlement_evm_claim_transaction_failed`               | Onchain claim transaction reverted                                            |
| `batch_settlement_evm_settle_transaction_failed`              | Onchain settle transaction reverted                                           |
| `batch_settlement_evm_cooperative_withdraw_transaction_failed`| Onchain cooperative withdraw transaction reverted                             |
| `batch_settlement_evm_invalid_receive_authorization_signature`| ERC-3009 `ReceiveWithAuthorization` signature verification failed              |
| `batch_settlement_evm_erc3009_authorization_required`         | Deposit payload missing required ERC-3009 authorization                        |
| `batch_settlement_evm_missing_eip712_domain`                  | Payment requirements missing `name` or `version` for EIP-712 domain           |
| `batch_settlement_evm_deposit_voucher_mismatch`               | Deposit and voucher channel identifiers do not match                           |
| `batch_settlement_evm_invalid_payload_type`                   | Payload type is not recognized or not supported                                |
| `batch_settlement_evm_invalid_scheme`                         | Payload or requirements `scheme` is not `batched`                     |
| `batch_settlement_evm_network_mismatch`                       | Payload `network` does not match requirements `network`                        |
| `batch_settlement_evm_payload_authorization_valid_before`     | ERC-3009 authorization `validBefore` has expired                               |
| `batch_settlement_evm_payload_authorization_valid_after`      | ERC-3009 authorization `validAfter` is in the future                           |
| `batch_settlement_stale_cumulative_amount`                    | Client voucher base doesn't match server state; corrective 402                 |

---

## Security Considerations

1. **Capital risk**: Clients bear risk up to their `maxClaimableAmount` ceiling. Servers bear risk of unclaimed vouchers during the withdrawal delay.
2. **Withdrawal delay**: Bounds (15 min – 30 day) prevent unreasonable delays that trap funds. Cooperative withdraw provides an instant exit when the server cooperates.
3. **Dual-mode payer verification**: When `payerAuthorizer` is set, vouchers are verified statelessly via ECDSA — no RPC required. When `payerAuthorizer == address(0)`, verification falls back to `SignatureChecker` against `payer`, supporting EIP-1271 smart wallets at the cost of an RPC call.
4. **ReceiverAuthorizer commitment**: The `receiverAuthorizer` is committed in `ChannelConfig` and gated by `msg.sender` (for `claim` and `cooperativeWithdraw`) or signature verification (for `claimWithSignature` and `cooperativeWithdrawWithSignature`). This prevents unauthorized claim or withdrawal operations.
5. **Cumulative replay protection**: Without nonces, the cumulative model ensures `totalClaimed` only increases. Old vouchers with lower ceilings are naturally superseded. The client's risk gap is bounded by incremental signing.
6. **Cross-function replay prevention**: `CooperativeWithdraw` and `ClaimBatch` use distinct EIP-712 type hashes to prevent signature reuse across operations.

---

## Annex

### Reference Implementation: `x402BatchSettlement`

The reference implementation is deployed via CREATE2 (same address on all EVM chains). Source: [`contracts/evm/src/x402BatchSettlement.sol`](../../../contracts/evm/src/x402BatchSettlement.sol).

### Periphery Contracts

- [`PaymentRouter`](../../../contracts/evm/src/periphery/PaymentRouter.sol) — Mutable receiver routing
- [`PaymentSplitter`](../../../contracts/evm/src/periphery/PaymentSplitter.sol) — Multi-payee distribution
- [`ClaimAuthorizer`](../../../contracts/evm/src/periphery/ClaimAuthorizer.sol) — EIP-1271 authorizer rotation

### Canonical Permit2

The Canonical Permit2 contract address can be found at [https://docs.uniswap.org/contracts/v4/deployments](https://docs.uniswap.org/contracts/v4/deployments).

---

## Version History

| Version | Date       | Changes                                                              | Author         |
| ------- | ---------- | -------------------------------------------------------------------- | -------------- |
| v1.2    | 2026-04-09 | `finalizeWithdraw` permissionless after delay; removed `finalizeWithdrawWithSignature`, `FinalizeWithdraw` EIP-712 type and `getFinalizeWithdrawDigest`; Dual-path cooperative withdraw: `cooperativeWithdraw(config)` msg.sender-gated + `cooperativeWithdrawWithSignature(config, sig)` signature-based; Voucher payload now includes `channelConfig` | @phdargen      |
| v1.1    | 2026-04-08 | Dual-authorizer model: `payerAuthorizer` (EOA or address(0) for EIP-1271), `receiverAuthorizer` replaces `facilitator`, `claimWithSignature` and `finalizeWithdrawWithSignature`, removed migration helper, added `ClaimAuthorizer` periphery, removed EIP-1271 from PaymentRouter/PaymentSplitter | @CarsonRoscoe  |
| v1.0    | 2026-04-08 | Stateless channel-config model: immutable ChannelConfig, 2 typehashes, nonce-less cumulative vouchers, committed facilitator, cooperative withdraw via receiver signature, channel migration, EIP-1271 for non-voucher ops | @CarsonRoscoe  |
| v0.6    | 2026-04-07 | Multi-token subchannels, client signer delegation, withdrawWindow bounds, replay-protected requestWithdrawalFor, renamed to `batched` | @CarsonRoscoe  |
| v0.5    | 2026-04-02 | Add cooperativeWithdraw                                              | @phdargen      |
| v0.4    | 2026-03-31 | Service registry + subchannel architecture                           | @CarsonRoscoe  |
| v0.3    | 2026-03-31 | Add voucherId for concurrency                                        | @phdargen      |
| v0.2    | 2025-03-30 | Add dynamic price                                                    | @phdargen      |
| v0.1    | 2025-03-21 | Initial draft                                                        | @phdargen      |
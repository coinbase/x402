# Scheme: `batch-settlement` on `EVM`

## Summary

The `batch-settlement` scheme on EVM is a **capital-backed** network binding using stateless unidirectional payment channels. Clients deposit funds into onchain channels and sign off-chain cumulative vouchers per request. The server accumulates vouchers and batch-claims them onchain at its discretion; claimed funds are transferred to the receiver via a separate settle operation.

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
5. **Receiver Authorizer**: The `receiverAuthorizer` address controls claim authorization, cooperative withdrawals, and finalize-withdrawal operations. Can be an EOA or an EIP-1271 contract (e.g., `ClaimAuthorizer` for key rotation).
6. **Cooperative Withdrawal**: The `receiverAuthorizer` can sign an instant cooperative withdrawal. Supports both EOA and EIP-1271 (smart contract) authorizers.

---

## ChannelConfig

All channel parameters are committed in the config struct. The `channelId` is the keccak256 hash of the ABI-encoded struct.

```solidity
struct ChannelConfig {
    address payer;              // Client wallet (EOA or smart wallet)
    address payerAuthorizer;    // EOA for voucher signing, or address(0) for EIP-1271 via payer
    address receiver;           // Server's payment destination (EOA or routing contract)
    address receiverAuthorizer; // Controls claims, cooperative withdraw, finalize withdraw
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
| `receiverAuthorizer` | The address that authorizes claims (direct call or signature), cooperative withdrawals, and finalize withdrawals. Can be an EOA or EIP-1271 contract (e.g., `ClaimAuthorizer`). Must not be `address(0)`. |
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

**CooperativeWithdraw** — signed by `receiverAuthorizer`:

```
CooperativeWithdraw(bytes32 channelId)
```

**ClaimBatch** — signed by `receiverAuthorizer` for `claimWithSignature`:

```
ClaimBatch(bytes32 claimsHash)
```

where `claimsHash = keccak256(abi.encodePacked(h_0, h_1, ...))` and each `h_i = keccak256(abi.encode(channelId_i, maxClaimableAmount_i, claimAmount_i))`.

**FinalizeWithdraw** — signed by `receiverAuthorizer` for `finalizeWithdrawWithSignature`:

```
FinalizeWithdraw(bytes32 channelId)
```

**Permit2 Deposit Witness:**

```
DepositWitness(bytes32 channelId)
```

---

## 402 Response (PaymentRequirements)

The 402 response contains pricing terms and the server's channel parameters. The client uses `payTo` as `ChannelConfig.receiver` and fills in `payer`, `payerAuthorizer`, `token`, and `salt` to construct the full `ChannelConfig`.

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

| State Field               | Type      | Description                                                     |
| ------------------------- | --------- | --------------------------------------------------------------- |
| `chargedCumulativeAmount` | `uint128` | Actual accumulated cost for this channel                        |
| `signedMaxClaimable`      | `uint128` | `maxClaimableAmount` from the latest client-signed voucher      |
| `signature`               | `bytes`   | Client's voucher signature for `signedMaxClaimable`             |
| `balance`                 | `uint128` | Current channel balance (mirrored from onchain)                 |
| `totalClaimed`            | `uint128` | Total claimed onchain (mirrored from onchain)                   |
| `lastRequestTimestamp`    | `uint64`  | Timestamp of the last paid request                              |

### Request Processing (MUST)

The server MUST serialize request processing per channel. The server MUST NOT update voucher state until the resource handler has succeeded.

1. **Verify**: Check increment locally, call facilitator `/verify`
2. **Execute**: Run the resource handler
3. **On success** — commit state:
   - `chargedCumulativeAmount += actualPrice` (where `actualPrice <= PaymentRequirements.amount`)
   - Mirror `balance`, `totalClaimed` from the facilitator response
4. **On failure**: State unchanged, client can retry the same voucher.

### Cooperative Withdraw Settle Flow

When the server receives a voucher with `withdraw: true` and has access to the `receiverAuthorizer`'s signing key:

1. Update `chargedCumulativeAmount` as with a normal voucher.
2. Sign a `CooperativeWithdraw(channelId)` digest as the `receiverAuthorizer`.
3. Build a voucher claim with `claimAmount = chargedCumulativeAmount - totalClaimed`.
4. Submit a `cooperativeWithdraw` settle action containing the claim and receiverAuthorizer signature.
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
    "totalClaimed": "500000"
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
| `"cooperativeWithdraw"` | Instant refund (auth-signed)     | Refund unclaimed deposits to payer                     |
| `"initiateWithdraw"`    | Client requests withdrawal       | Record withdrawal timestamp on channel                 |
| `"finalizeWithdraw"`    | After delay elapses              | Refund unclaimed deposit, reduce balance               |

**Response:**

```json
{
  "success": true,
  "transaction": "0x...transactionHash",
  "network": "eip155:8453",
  "payer": "0xPayerAddress",
  "extra": {
    "channelId": "0xabc123...",
    "balance": "100000",
    "totalClaimed": "3200"
  }
}
```

### GET /supported

```json
{
  "kinds": [
    { "x402Version": 2, "scheme": "batch-settlement", "network": "eip155:8453" }
  ]
}
```

### Verification Rules (MUST)

A facilitator MUST enforce:

1. **Signature validity**: Recover the signer from the EIP-712 `Voucher` digest. If `payerAuthorizer != address(0)`, the signer MUST equal `payerAuthorizer` (ECDSA only). If `payerAuthorizer == address(0)`, validate via `SignatureChecker` against `payer`.
2. **Channel existence**: The channel MUST have a positive balance (`balance > 0`).
3. **Token match**: `paymentRequirements.asset` MUST match `ChannelConfig.token`.
4. **Balance check** (`deposit` only): Client MUST have sufficient token balance.
5. **Deposit sufficiency**: `maxClaimableAmount` MUST be `<= balance` (or `<= balance + depositAmount` for deposit payloads).
6. **Not below claimed**: `maxClaimableAmount` MUST be `> totalClaimed`.

The facilitator MUST return the channel snapshot (`balance`, `totalClaimed`) in every response.

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

The `batch-settlement` scheme operates under the following trust assumptions:

1. **Client trusts server for claim amounts**: The client signs `maxClaimableAmount` (a ceiling). The `receiverAuthorizer` determines the actual `claimAmount` within that bound. Over-claiming is a trust violation, not a protocol violation. The client's risk is bounded by `maxClaimableAmount - totalClaimed`.

2. **ReceiverAuthorizer is server-controlled**: The `receiverAuthorizer` is committed in the `ChannelConfig` and jointly agreed upon by client and server. It controls claim authorization, cooperative withdrawal, and finalize-withdrawal. It can be an EOA, a hot wallet, or an EIP-1271 contract like `ClaimAuthorizer` for key rotation.

3. **Receiver signs cooperative withdrawals via receiverAuthorizer**: The `receiverAuthorizer` (not the receiver itself) authorizes instant refunds. This ensures the server's authorized agent decides to forgo revenue. Supports EIP-1271 for smart contract authorizers.

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
- **Withdrawal**: Three paths — cooperative (instant, receiverAuthorizer-signed), timed (initiate → wait `withdrawDelay` → finalize by payer or receiverAuthorizer), or timed with signature (`finalizeWithdrawWithSignature`).
- **Parameter Changes**: To rotate `payerAuthorizer`, change `receiverAuthorizer`, or modify other config fields, the client withdraws from the old channel and deposits into a new one. No atomic migration helper — this is a deliberate simplification.
- **Token transfers**: Implementations MUST handle both standard and non-standard ERC-20 return values (e.g., USDT).

---

## Error Codes

Implementers MUST use the generic `batch-settlement` error codes from [scheme_batch_settlement.md](./scheme_batch_settlement.md#error-codes) when applicable.

EVM-specific codes:

| Error Code                                          | Description                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `batch_settlement_evm_channel_not_found`            | No channel with positive balance for the given `channelId`         |
| `batch_settlement_evm_withdrawal_pending`           | Withdrawal request is pending on this channel                      |
| `batch_settlement_evm_cumulative_exceeds_balance`   | Voucher `maxClaimableAmount` exceeds onchain balance               |
| `batch_settlement_evm_withdraw_delay_out_of_range`  | `withdrawDelay` is outside the 15 min – 30 day bounds             |
| `batch_settlement_stale_cumulative_amount`          | Client voucher base doesn't match server state; corrective 402    |
| `cooperative_withdraw_not_supported`                 | Server has no receiverAuthorizer signing key for cooperative withdraw |

---

## Security Considerations

1. **Capital risk**: Clients bear risk up to their `maxClaimableAmount` ceiling. Servers bear risk of unclaimed vouchers during the withdrawal delay.
2. **Withdrawal delay**: Bounds (15 min – 30 day) prevent unreasonable delays that trap funds. Cooperative withdraw provides an instant exit when the server cooperates.
3. **Dual-mode payer verification**: When `payerAuthorizer` is set, vouchers are verified statelessly via ECDSA — no RPC required. When `payerAuthorizer == address(0)`, verification falls back to `SignatureChecker` against `payer`, supporting EIP-1271 smart wallets at the cost of an RPC call.
4. **ReceiverAuthorizer commitment**: The `receiverAuthorizer` is committed in `ChannelConfig` and gated by `msg.sender` (for direct calls) or signature verification (for `WithSignature` variants). This prevents unauthorized claim or withdrawal operations.
5. **Cumulative replay protection**: Without nonces, the cumulative model ensures `totalClaimed` only increases. Old vouchers with lower ceilings are naturally superseded. The client's risk gap is bounded by incremental signing.
6. **Cross-function replay prevention**: `CooperativeWithdraw`, `ClaimBatch`, and `FinalizeWithdraw` use distinct EIP-712 type hashes to prevent signature reuse across operations.

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
| v1.1    | 2026-04-08 | Dual-authorizer model: `payerAuthorizer` (EOA or address(0) for EIP-1271), `receiverAuthorizer` replaces `facilitator`, `claimWithSignature` and `finalizeWithdrawWithSignature`, removed migration helper, added `ClaimAuthorizer` periphery, removed EIP-1271 from PaymentRouter/PaymentSplitter | @CarsonRoscoe  |
| v1.0    | 2026-04-08 | Stateless channel-config model: immutable ChannelConfig, 2 typehashes, nonce-less cumulative vouchers, committed facilitator, cooperative withdraw via receiver signature, channel migration, EIP-1271 for non-voucher ops | @CarsonRoscoe  |
| v0.6    | 2026-04-07 | Multi-token subchannels, client signer delegation, withdrawWindow bounds, replay-protected requestWithdrawalFor, renamed to `batch-settlement` | @CarsonRoscoe  |
| v0.5    | 2026-04-02 | Add cooperativeWithdraw                                              | @phdargen      |
| v0.4    | 2026-03-31 | Service registry + subchannel architecture                           | @CarsonRoscoe  |
| v0.3    | 2026-03-31 | Add voucherId for concurrency                                        | @phdargen      |
| v0.2    | 2025-03-30 | Add dynamic price                                                    | @phdargen      |
| v0.1    | 2025-03-21 | Initial draft                                                        | @phdargen      |

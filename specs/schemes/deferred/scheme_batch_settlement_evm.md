# Scheme: `batch-settlement` on `EVM`

## Summary

The `batch-settlement` scheme on EVM is a **capital-backed** network binding where clients deposit funds into onchain subchannels and sign off-chain cumulative vouchers per request. The server accumulates vouchers and batch-claims them onchain at its discretion; claimed funds are transferred to the service's `payTo` via a separate settle operation.

The two-phase **claim/settle** split allows the server to batch-claim vouchers from many clients and batch-settle in separate transactions, minimizing gas costs for high-volume services.


| AssetTransferMethod | Use Case                                                        | Recommendation                                           |
| ------------------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| **`eip3009`**       | Tokens with `receiveWithAuthorization` (e.g., USDC)             | **Recommended** (simplest, truly gasless)                |
| **`permit2`**       | Tokens without EIP-3009, payer already has Permit2 approval     | **Universal Fallback** (works for any ERC-20)            |
| **`eip2612`**       | Tokens with EIP-2612 permit, no prior Permit2 approval by payer | **Gasless Onboarding** (EIP-2612 + Permit2, two sigs)   |


Default: `eip3009` if `extra.assetTransferMethod` is omitted.

---

## EVM Core Properties (MUST)

1. **Cumulative Monotonic Vouchers**: Each voucher carries a `cumulativeAmount` strictly greater than the previous and a monotonically increasing `nonce`. Only the highest voucher matters for claiming.
2. **Capital-Backed Escrow**: Clients deposit funds into an onchain subchannel before consuming resources. The deposit is refundable (unclaimed remainder returns on withdrawal) and can be topped up.
3. **Multi-Token Subchannels**: A subchannel is identified by `(serviceId, payer, token)`. Services are token-agnostic — the token is a property of the subchannel, not the service.
4. **Persistent Subchannels with Bounded Withdrawal Window**: Subchannels persist indefinitely. Withdrawal requires a request followed by a configurable grace period (15 minutes – 30 days) before funds can be reclaimed. The voucher `nonce` is preserved across withdrawal and re-deposit cycles to prevent replay.
5. **Mutable payTo**: The service's `payTo` address can be updated by an authorizer at any time. Funds flow to the current `payTo` at settle time.
6. **Client Signer Delegation**: A payer can authorize an EOA to sign vouchers on their behalf. This enables smart contract wallets to delegate to a hot wallet. All verification is pure ECDSA recovery — no EIP-1271 required.

---

## EIP-712 Types

All EIP-712 signatures use the contract's domain (`name: "Batch Settlement"`, `version: "1"`, plus `chainId` and `verifyingContract`).

**Voucher** — `token` is `paymentRequirements.asset`, included in the hash to prevent cross-token replay:

```
Voucher(bytes32 serviceId, address payer, address token, uint128 cumulativeAmount, uint64 nonce)
```

**CooperativeWithdraw** — includes per-subchannel `withdrawNonce` for replay protection:

```
CooperativeWithdraw(bytes32 serviceId, address payer, address token, uint64 withdrawNonce)
```

**RequestWithdrawal** — includes `withdrawNonce` to prevent replay after cooperative withdraw:

```
RequestWithdrawal(bytes32 serviceId, address payer, address token, uint64 withdrawNonce)
```

**Register:**

```
Register(bytes32 serviceId, address payTo, address authorizer, uint64 withdrawWindow)
```

**Client Signer Delegation:**

```
AuthorizeClientSigner(bytes32 serviceId, address payer, address signer, uint256 nonce)
RevokeClientSigner(bytes32 serviceId, address payer, address signer, uint256 nonce)
```

**Admin Operations** — share a per-service `adminNonce`:

```
AddAuthorizer(bytes32 serviceId, address newAuthorizer, uint256 nonce)
RemoveAuthorizer(bytes32 serviceId, address target, uint256 nonce)
UpdatePayTo(bytes32 serviceId, address newPayTo, uint256 nonce)
UpdateWithdrawWindow(bytes32 serviceId, uint64 newWindow, uint256 nonce)
```

**Permit2 Deposit Witness:**

```
DepositWitness(bytes32 serviceId)
```

---

## 402 Response (PaymentRequirements)

The 402 contains pricing terms and the service's `serviceId`. `PaymentRequirements.amount` represents the **maximum** per-request price.

```json
{
  "scheme": "batch-settlement",
  "network": "eip155:8453",
  "amount": "100000",
  "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "payTo": "0xServerPayToAddress",
  "maxTimeoutSeconds": 3600,
  "extra": {
    "serviceId": "0xabc123...serviceId",
    "name": "USDC",
    "version": "2"
  }
}
```

| Field                           | Type     | Required | Description                                                                   |
| ------------------------------- | -------- | -------- | ----------------------------------------------------------------------------- |
| `extra.serviceId`               | `string` | yes      | The service's identifier (first-come-first-serve at registration)             |
| `extra.assetTransferMethod`     | `string` | optional | `"eip3009"` (default), `"permit2"`, or `"eip2612"`.                           |
| `extra.name`                    | `string` | yes      | EIP-712 domain name of the token contract (e.g., `"USDC"`)                   |
| `extra.version`                 | `string` | yes      | EIP-712 domain version of the token contract (e.g., `"2"`)                   |

---

## Client: Payment Construction

The client constructs a `PaymentPayload` whose type depends on subchannel state:

- **`deposit`**: No subchannel exists or balance is exhausted — client signs a token authorization and first voucher
- **`voucher`**: Subchannel has sufficient balance — client signs a new cumulative voucher

### Deposit Payload

The `deposit.authorization` field contains the token transfer authorization — exactly one of `erc3009Authorization`, `permit2Authorization`, or `eip2612Authorization` MUST be present.

```json
{
  "x402Version": 2,
  "accepted": {
    "scheme": "batch-settlement",
    "network": "eip155:8453",
    "amount": "1000",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "payTo": "0xServerPayToAddress",
    "maxTimeoutSeconds": 3600,
    "extra": { "serviceId": "0xabc123...", "name": "USDC", "version": "2" }
  },
  "payload": {
    "type": "deposit",
    "deposit": {
      "serviceId": "0xabc123...",
      "payer": "0xClientAddress",
      "amount": "100000",
      "authorization": "<erc3009Authorization | permit2Authorization | eip2612Authorization>"
    },
    "voucher": {
      "serviceId": "0xabc123...",
      "payer": "0xClientAddress",
      "cumulativeAmount": "1000",
      "nonce": 1,
      "signature": "0x...EIP-712 voucher signature"
    }
  }
}
```

**Authorization variants:**

```json
"erc3009Authorization": {
  "validAfter": 0,
  "validBefore": 1679616000,
  "nonce": "0x...random nonce",
  "signature": "0x...ERC-3009 ReceiveWithAuthorization signature"
}
```

```json
"permit2Authorization": {
  "nonce": 0,
  "deadline": 1679616000,
  "signature": "0x...Permit2 PermitWitnessTransferFrom signature (with DepositWitness)"
}
```

```json
"eip2612Authorization": {
  "permit": { "deadline": 1679616000, "v": 27, "r": "0x...", "s": "0x..." },
  "permit2": { "nonce": 0, "deadline": 1679616000, "signature": "0x..." }
}
```

### Voucher Payload

The optional `withdraw` flag signals a cooperative withdraw request.

```json
{
  "x402Version": 2,
  "accepted": {
    "scheme": "batch-settlement",
    "network": "eip155:8453",
    "amount": "1000",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "payTo": "0xServerPayToAddress",
    "maxTimeoutSeconds": 3600,
    "extra": { "serviceId": "0xabc123...", "name": "USDC", "version": "2" }
  },
  "payload": {
    "type": "voucher",
    "serviceId": "0xabc123...",
    "payer": "0xClientAddress",
    "cumulativeAmount": "5000",
    "nonce": 5,
    "signature": "0x...EIP-712 voucher signature",
    "withdraw": true
  }
}
```

---

## Server: State & Facilitator Forwarding

The server is the sole owner of per-subchannel session state. The facilitator is stateless.

### Per-Subchannel State

The server MUST maintain per-subchannel state, keyed by `(serviceId, payer, token)`:

| State Field               | Type      | Description                                                         |
| ------------------------- | --------- | ------------------------------------------------------------------- |
| `chargedCumulativeAmount` | `uint128` | Actual accumulated cost for this subchannel                         |
| `signedCumulativeAmount`  | `uint128` | `cumulativeAmount` from the latest client-signed voucher            |
| `lastNonce`               | `uint64`  | Nonce from the latest accepted voucher                              |
| `signature`               | `bytes`   | Client's voucher signature for `signedCumulativeAmount`             |
| `deposit`                 | `uint128` | Current subchannel deposit (mirrored from facilitator response)     |
| `totalClaimed`            | `uint128` | Total claimed onchain (mirrored from facilitator response)          |
| `withdrawRequestedAt`     | `uint64`  | Withdrawal request timestamp, 0 if none                            |
| `withdrawNonce`           | `uint64`  | Per-subchannel nonce for cooperative withdraw replay protection     |
| `lastRequestTimestamp`    | `uint64`  | Timestamp of the last paid request                                  |

### Request Processing (MUST)

The server MUST serialize request processing per subchannel. The server MUST NOT update voucher state until the resource handler has succeeded.

1. **Verify**: Check increment locally, call facilitator `/verify`
2. **Execute**: Run the resource handler
3. **On success** — commit state:
   - `chargedCumulativeAmount += actualPrice` (where `actualPrice <= PaymentRequirements.amount`)
   - Mirror `deposit`, `totalClaimed`, `withdrawRequestedAt`, `withdrawNonce` from the facilitator response
4. **On failure**: State unchanged, client can retry the same voucher.

### Cooperative Withdraw Settle Flow

When the server receives a voucher with `withdraw: true` and has access to an authorizer key:

1. Update `chargedCumulativeAmount` as with a normal voucher.
2. Sign a `CooperativeWithdraw(serviceId, payer, token, withdrawNonce)` digest as authorizer.
3. Build a `VoucherClaim` with `claimAmount = chargedCumulativeAmount`.
4. Submit a `cooperativeWithdraw` settle action containing the claim and authorizer signature.
5. On success, reset the session for that payer.

If the server has no authorizer key, it MUST reject with `cooperative_withdraw_not_supported`.

---

## Facilitator Interface

Uses the standard x402 facilitator interface (`/verify`, `/settle`, `/supported`). The facilitator is stateless.

### POST /verify

Verifies a payment payload. Returns the onchain subchannel snapshot:

```json
{
  "isValid": true,
  "payer": "0xPayerAddress",
  "extra": {
    "deposit": "1000000",
    "totalClaimed": "500000",
    "withdrawRequestedAt": 0,
    "withdrawNonce": 0
  }
}
```

### POST /settle

| `settleAction`          | When Used                        | Onchain Effect                                         |
| ----------------------- | -------------------------------- | ------------------------------------------------------ |
| `"deposit"`             | First request or top-up          | Deposit tokens into subchannel                         |
| `"claim"`               | Server batches voucher claims    | Validate vouchers, update accounting (no transfer)     |
| `"settle"`              | Server transfers earned funds    | Transfer unsettled amount to `payTo`                   |
| `"requestWithdrawal"`   | Client requests withdrawal       | Record withdrawal timestamp on subchannel              |
| `"cooperativeWithdraw"` | Instant refund (auto-claims)     | Claim then refund unclaimed deposits to payers         |
| `"withdraw"`            | After window elapses             | Refund unclaimed deposit, reset subchannel             |

**Response:**

```json
{
  "success": true,
  "transaction": "0x...transactionHash",
  "network": "eip155:8453",
  "payer": "0xPayerAddress",
  "amount": "700",
  "extra": {
    "serviceId": "0xabc123...",
    "chargedCumulativeAmount": "3200",
    "nonce": 5,
    "deposit": "100000",
    "totalClaimed": "0",
    "withdrawRequestedAt": 0,
    "withdrawNonce": 0
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

1. **Signature validity**: Recover the signer from the EIP-712 `Voucher` digest. The signer MUST be `payer` or an authorized client signer for that payer on that service.
2. **Service existence**: The `serviceId` MUST be registered.
3. **Subchannel state**: For `voucher` payloads, the subchannel MUST have a positive balance (`deposit - totalClaimed > 0`).
4. **Token match**: `paymentRequirements.asset` MUST match the voucher's `token`.
5. **Balance check** (`deposit` only): Client MUST have sufficient token balance.
6. **Deposit sufficiency**: `cumulativeAmount` MUST be `<= deposit` (or `<= deposit + depositAmount` for deposit payloads).
7. **Not below claimed**: `cumulativeAmount` MUST be `> totalClaimed`.
8. **Nonce increasing**: `nonce` MUST be `> subchannel.nonce`.

The facilitator MUST return the subchannel snapshot (`deposit`, `totalClaimed`, `withdrawRequestedAt`, `withdrawNonce`) in every response.

#### Server Check (off-chain)

The server MUST additionally verify:

- `payload.cumulativeAmount == chargedCumulativeAmount + paymentRequirements.amount`
- `payload.nonce == lastNonce + 1`

If the check fails, reject with `batch_settlement_stale_cumulative_amount` and return a corrective 402.

---

## Claim & Settlement Strategy

**`claim`** validates voucher signatures and updates accounting across multiple subchannels (same token) in a single transaction. No token transfer occurs.

**`settle`** transfers all claimed-but-unsettled funds for a token to `payTo` in one transfer.

```
struct VoucherClaim {
    address payer;
    uint128 cumulativeAmount;   // client-signed maximum
    uint128 claimAmount;        // actual amount to claim (<= cumulativeAmount, <= deposit)
    uint64 nonce;
    bytes signature;            // EIP-712 Voucher signature from payer or authorized delegate
}
```

| Strategy            | Description                                             | Trade-off                        |
| ------------------- | ------------------------------------------------------- | -------------------------------- |
| **Periodic**        | Claim + settle every N minutes                          | Predictable gas costs            |
| **Threshold**       | Claim + settle when unclaimed amount exceeds T          | Bounds server's risk exposure    |
| **On withdrawal**   | Claim + settle when `withdrawRequestedAt` becomes non-0 | Minimum gas, maximum risk window |

The server MUST claim all outstanding vouchers before the withdraw window elapses. Unclaimed vouchers become unclaimable after `withdraw()` resets the subchannel.

---

## Subchannel Discovery

A subchannel is identified by `(serviceId, payer, token)`. The client knows all three values from the 402 response and its own address. A single RPC read retrieves current subchannel state. No scanning or server cooperation required.

---

## Client Verification Rules (MUST)

### In-Session

Before signing the next voucher, the client MUST verify from `PAYMENT-RESPONSE`:

1. `amount <= PaymentRequirements.amount`
2. `chargedCumulativeAmount == previous + amount`
3. `deposit` is consistent with the client's expectation
4. `serviceId` matches

If any check fails, the client MUST NOT sign further vouchers and SHOULD initiate `requestWithdrawal`.

### Recovery After State Loss

The client reads the subchannel onchain. If the server holds unsettled vouchers above the onchain state, it returns a corrective 402 with `chargedCumulativeAmount`, `signedCumulativeAmount`, `nonce`, and `signature`. The client MUST verify the returned voucher signature matches its own address before resuming.

---

## Lifecycle Summary

- **Registration**: First-come-first-serve on `serviceId`. Services are token-agnostic. `withdrawWindow` must be between 15 minutes and 30 days.
- **Deposit & Top-Up**: Deposits create or top up a `(serviceId, payer, token)` subchannel. Deposits cancel pending withdrawal requests.
- **Withdrawal**: Three paths — cooperative (instant, authorizer-signed), gasless non-cooperative (time-delayed, payer-signed), or direct (time-delayed, payer calls directly). Both withdrawal types reset balances but preserve the voucher `nonce`. Cooperative withdraw increments `withdrawNonce` to prevent signature replay after re-deposit.
- **Subchannel Persistence**: Never deleted. Voucher nonce is monotonic for the lifetime of `(serviceId, payer, token)`.
- **Token transfers**: Implementations MUST handle both standard and non-standard ERC-20 return values (e.g., USDT).

---

## Error Codes

Implementers MUST use the generic `batch-settlement` error codes from [scheme_batch_settlement.md](./scheme_batch_settlement.md#error-codes) when applicable.

EVM-specific codes:

| Error Code                                          | Description                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `batch_settlement_evm_service_not_found`            | No registered service for the given `serviceId`                    |
| `batch_settlement_evm_subchannel_not_found`         | No subchannel (or zero balance) for `(serviceId, payer, token)`    |
| `batch_settlement_evm_withdrawal_pending`           | Withdrawal request is pending on this subchannel                   |
| `batch_settlement_evm_invalid_increment`            | Voucher delta does not equal the required `amount`                 |
| `batch_settlement_evm_cumulative_exceeds_deposit`   | Voucher `cumulativeAmount` exceeds onchain deposit                 |
| `batch_settlement_evm_withdraw_window_out_of_range` | `withdrawWindow` is outside the 15 min – 30 day bounds            |
| `batch_settlement_stale_cumulative_amount`          | Client voucher base doesn't match server state; corrective 402    |
| `cooperative_withdraw_not_supported`                 | Server has no authorizer key for cooperative withdraw              |

---

## Security Considerations

1. **Capital risk**: Clients bear risk up to their deposit amount. Servers bear risk of unclaimed vouchers during the withdrawal window.
2. **Withdrawal window**: Bounds (15 min – 30 day) prevent servers from setting unreasonable windows that trap funds. Cooperative withdraw provides an instant exit when the server cooperates.
3. **Replay protection**: Voucher `nonce` is preserved across withdrawal/re-deposit. `withdrawNonce` prevents cooperative withdraw and withdrawal request signature replay. Admin operations share a `adminNonce`.
4. **Signature delegation**: Client signer delegation keeps all verification as ECDSA recovery, avoiding EIP-1271 RPC overhead. Payers should only authorize trusted EOAs.

---

## Annex

### Reference Implementation: `x402BatchSettlement`

The reference implementation is deployed at `0x4020...0003` (CREATE2, same address on all EVM chains). Source: [`contracts/evm/src/x402BatchSettlement.sol`](../../../contracts/evm/src/x402BatchSettlement.sol).

### Canonical Permit2

The Canonical Permit2 contract address can be found at [https://docs.uniswap.org/contracts/v4/deployments](https://docs.uniswap.org/contracts/v4/deployments).

---

## Version History

| Version | Date       | Changes                                                              | Author         |
| ------- | ---------- | -------------------------------------------------------------------- | -------------- |
| v0.6    | 2026-04-07 | Multi-token subchannels, client signer delegation, withdrawWindow bounds, replay-protected requestWithdrawalFor, renamed to `batch-settlement` | @CarsonRoscoe  |
| v0.5    | 2026-04-02 | Add cooperativeWithdraw                                              | @phdargen      |
| v0.4    | 2026-03-31 | Service registry + subchannel architecture                           | @CarsonRoscoe  |
| v0.3    | 2026-03-31 | Add voucherId for concurrency                                        | @phdargen      |
| v0.2    | 2025-03-30 | Add dynamic price                                                    | @phdargen      |
| v0.1    | 2025-03-21 | Initial draft                                                        | @phdargen      |

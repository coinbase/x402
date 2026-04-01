# Scheme: `deferred` on `EVM`

## Summary

The `deferred` scheme on EVM is a **capital-backed** network binding that uses a **DeferredEscrow** contract for onchain escrow, settlement and subchannel lifecycle management. Servers register as services with a mutable `payTo` address. Clients deposit funds into subchannels identified by `(serviceId, payer)` and sign off-chain cumulative vouchers per request. The server accumulates vouchers and claims them onchain at its discretion; claimed funds are transferred to the service's current `payTo` via a separate settle operation.

The two-phase **claim/settle** split allows the server to batch-claim vouchers from many clients and batch-settle to its `payTo` in separate transactions, minimizing gas costs for high-volume services.


| AssetTransferMethod | Use Case                                                        | Recommendation                                           |
| ------------------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| **`eip3009`**       | Tokens with `receiveWithAuthorization` (e.g., USDC)             | **Recommended** (simplest, truly gasless)                |
| **`permit2`**       | Tokens without EIP-3009, payer already has Permit2 approval     | **Universal Fallback** (works for any ERC-20)            |
| **`eip2612`**       | Tokens with EIP-2612 permit, no prior Permit2 approval by payer | **Gasless Onboarding** (EIP-2612 + Permit2, two sigs)   |


Default: `eip3009` if `extra.assetTransferMethod` is omitted.

---

## EVM Core Properties (MUST)

The `deferred` scheme on EVM MUST enforce the following invariants:

1. **Cumulative Monotonic Vouchers**: Each voucher carries a `cumulativeAmount` strictly greater than the previous. Only the highest voucher matters for claiming. This eliminates double-spend risk without per-voucher nonce tracking.
2. **Capital-Backed Escrow**: Clients deposit funds into an onchain subchannel before consuming resources. The deposit is refundable (unclaimed remainder returns on withdrawal) and can be topped up. This guarantees the server can always claim up to the deposit amount without further client cooperation.
3. **Persistent Subchannels with Withdrawal Window**: Subchannels live forever — there is no expiry. When a client wants funds back, it calls `requestWithdrawal`, which records a timestamp. After the service's configured `withdrawWindow` elapses, anyone can trigger `withdraw` to return unclaimed funds and reset the subchannel for future deposits. This avoids subchannel collisions and supports long-lived client-service relationships.
4. **Voucher Replay Protection**: Each voucher carries a monotonically increasing `nonce`. Subsequent claims require a strictly higher `nonce`, preventing replay of previously claimed vouchers regardless of their `cumulativeAmount`.
5. **Mutable payTo**: The service's `payTo` address is decoupled from subchannel identity and can be updated by an authorizer at any time. Funds are transferred to the current `payTo` at settle time, not at claim time.

---

## DeferredEscrow Contract

The DeferredEscrow contract manages two layers: a **service registry** (one per server) and **subchannels** (one per client-service pair). Services register once and can update their `payTo`, authorizers, and withdraw window. Clients deposit into subchannels and sign cumulative vouchers. Anyone can claim vouchers, settle funds, and withdraw after the withdrawal window.

### Service Registration

A service registers by claiming a `serviceId`:

```solidity
function register(
    bytes32 serviceId,       // chosen by the server, first-come-first-serve
    address payTo,           // initial payout address
    address token,           // ERC-20 token the service accepts
    address authorizer,      // initial authorizer address
    uint64 withdrawWindow    // time (seconds) between requestWithdrawal and withdraw eligibility
) external
```

Registration is first-come-first-serve — the server chooses any unclaimed `serviceId`. After registration, the `serviceId` is public and used for all operations. The `withdrawWindow` determines how long the server has to claim outstanding vouchers after a client requests withdrawal.

### Service Management

Authorizers can update the service's configuration. These functions require an EIP-712 signature from a registered authorizer, so anyone (including a facilitator) can submit the transaction.

```solidity
function addAuthorizer(bytes32 serviceId, address newAuthorizer, bytes calldata authSignature) external
function removeAuthorizer(bytes32 serviceId, address target, bytes calldata authSignature) external
function updatePayTo(bytes32 serviceId, address newPayTo, bytes calldata authSignature) external
function updateWithdrawWindow(bytes32 serviceId, uint64 newWindow, bytes calldata authSignature) external
```

A service MUST always have at least one authorizer. The authorizer signature covers the specific action via EIP-712 typed data (see [contract spec](./scheme_deferred_evm_contract.md) for signature types).

### Contract Interface Summary


| Function                     | Caller                  | Description                                                                   |
| ---------------------------- | ----------------------- | ----------------------------------------------------------------------------- |
| `register`                   | Anyone                  | One-time service registration (sets token, payTo, authorizer, withdrawWindow) |
| `addAuthorizer`              | Anyone (with auth sig)  | Add an authorizer to a service                                                |
| `removeAuthorizer`           | Anyone (with auth sig)  | Remove an authorizer from a service                                           |
| `updatePayTo`                | Anyone (with auth sig)  | Change the service's payout address                                           |
| `updateWithdrawWindow`       | Anyone (with auth sig)  | Change the service's withdrawal grace period                                  |
| `depositWithERC3009`         | Anyone (facilitator)    | Gasless deposit via ERC-3009 `receiveWithAuthorization`                       |
| `depositWithPermit2`          | Anyone (facilitator)    | Gasless deposit via Permit2 `PermitTransferFrom`                              |
| `depositWithEIP2612`         | Anyone (facilitator)    | Gasless deposit via EIP-2612 permit + Permit2 (two signatures)                |
| `claim`                      | Anyone                  | Validate vouchers and update subchannel accounting (no token transfer)        |
| `settle`                     | Anyone                  | Transfer claimed funds to the service's current `payTo`                       |
| `requestWithdrawal`          | Payer                   | Start withdrawal countdown (`withdrawRequestedAt = now`)                      |
| `requestWithdrawalFor`       | Anyone (with payer sig) | Gasless `requestWithdrawal` via payer's EIP-712 authorization                 |
| `withdraw`                   | Anyone                  | After withdraw window, refund unclaimed deposit and reset subchannel          |
| `getService`                 | View                    | Read service state                                                            |
| `getSubchannel`              | View                    | Read subchannel state for a `(serviceId, payer)` pair                         |


In the x402 deferred flow on EVM, the **facilitator** is the primary gas-paying entity:

- **Client** signs token transfer authorizations (off-chain) → facilitator submits `depositWith*`
- **Client** signs withdrawal authorization (off-chain) → facilitator submits `requestWithdrawalFor`
- **Server** forwards vouchers to the facilitator → facilitator submits `claim`, `settle`
- **Anyone** can trigger `withdraw` after the withdrawal window elapses

> **Requirement**: This contract MUST be deployed to the same address across all supported EVM chains using `CREATE2`.

See [scheme_deferred_evm_contract.md](./scheme_deferred_evm_contract.md) for the full contract specification.

### Voucher EIP-712 Type

Vouchers are signed using the EIP-712 typed data standard.

**Domain:**

```
name:    "Deferred Escrow"   (deployed contract constant)
version: "1"
```

**Type:**

```
Voucher(bytes32 serviceId, address payer, uint128 cumulativeAmount, uint64 nonce)
```

### RequestWithdrawal EIP-712 Type

Used for gasless withdrawal requests via `requestWithdrawalFor`.

**Type:**

```
RequestWithdrawal(bytes32 serviceId, address payer)
```

### Subchannel Identity

A subchannel is uniquely identified by `(serviceId, payer)`. The client always knows both values — `serviceId` from the 402 response and `payer` is their own address. No salt, scanning, or server cooperation is needed for discovery.

### Contract Constants

There are no global constants. The withdrawal grace period is configured per service via `withdrawWindow` at registration time and can be updated by an authorizer via `updateWithdrawWindow`.


---

## 402 Response (PaymentRequirements)

### Generic 402 (Default)

The 402 contains pricing terms and the service's `serviceId`. `PaymentRequirements.amount` represents the **maximum** per-request price.

```json
{
  "scheme": "deferred",
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

### `extra` Field Reference


| Field                           | Type     | Required | Description                                                                                           |
| ------------------------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `extra.serviceId`               | `string` | yes      | The service's identifier (chosen at registration, first-come-first-serve)                             |
| `extra.assetTransferMethod`     | `string` | optional | `"eip3009"` (default), `"permit2"`, or `"eip2612"`. Omit to use default.                             |
| `extra.name`                    | `string` | yes      | EIP-712 domain name of the token contract (e.g., `"USDC"`)                                           |
| `extra.version`                 | `string` | yes      | EIP-712 domain version of the token contract (e.g., `"2"`)                                           |


---

## Client: Payment Construction

After receiving a 402, the client constructs a `PaymentPayload` containing its signed commitment. The payload type depends on the subchannel state:

- **`deposit`**: No subchannel exists or balance is exhausted; client signs a token authorization and first voucher
- **`voucher`**: Subchannel exists with sufficient balance; client signs a new cumulative voucher

### Deposit Methods

All deposits are indirect — the client signs off-chain authorization(s) and the facilitator submits the transaction. The method depends on `extra.assetTransferMethod`. Depositing into an existing subchannel tops up the balance.

#### EIP-3009: `depositWithERC3009()`

```solidity
function depositWithERC3009(
    bytes32 serviceId,          // from PaymentRequirements.extra.serviceId
    address payer,              // client's address
    uint128 amount,             // deposit amount (must match ERC-3009 value)
    uint256 validAfter,         // ERC-3009 authorization start time
    uint256 validBefore,        // ERC-3009 authorization expiry time
    bytes32 nonce,              // ERC-3009 authorization nonce
    bytes calldata signature    // ERC-3009 ReceiveWithAuthorization signature from payer
) external
```

#### Permit2: `depositWithPermit2()`

```solidity
function depositWithPermit2(
    bytes32 serviceId,          // from PaymentRequirements.extra.serviceId
    address payer,              // client's address
    uint128 amount,             // deposit amount (must match Permit2 value)
    uint256 nonce,              // Permit2 nonce
    uint256 deadline,           // Permit2 signature deadline
    bytes calldata signature    // Permit2 PermitTransferFrom signature from payer
) external
```

#### EIP-2612 + Permit2: `depositWithEIP2612()`

```solidity
function depositWithEIP2612(
    bytes32 serviceId,          // from PaymentRequirements.extra.serviceId
    address payer,              // client's address
    uint128 amount,             // deposit amount
    uint256 permitDeadline,     // EIP-2612 permit deadline
    uint8 v,                    // EIP-2612 permit signature v
    bytes32 r,                  // EIP-2612 permit signature r
    bytes32 s,                  // EIP-2612 permit signature s
    uint256 permit2Nonce,       // Permit2 nonce
    uint256 permit2Deadline,    // Permit2 signature deadline
    bytes calldata permit2Signature // Permit2 PermitTransferFrom signature from payer
) external
```

### PaymentPayload Examples

**Type: `deposit`**

Used when no subchannel exists or the existing subchannel needs more funds. The `deposit.authorization` field contains the token transfer authorization — exactly one of `erc3009Authorization`, `permit2Authorization`, or `eip2612Authorization` MUST be present.

```json
{
  "x402Version": 2,
  "accepted": {
    "scheme": "deferred",
    "network": "eip155:8453",
    "amount": "1000",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "payTo": "0xServerPayToAddress",
    "maxTimeoutSeconds": 3600,
    "extra": {
      "serviceId": "0xabc123...serviceId",
      "name": "USDC",
      "version": "2"
    }
  },
  "payload": {
    "type": "deposit",
    "deposit": {
      "serviceId": "0xabc123...serviceId",
      "payer": "0xClientAddress",
      "amount": "100000",
      "authorization": "<erc3009Authorization | permit2Authorization | eip2612Authorization>"
    },
    "voucher": {
      "serviceId": "0xabc123...serviceId",
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
  "signature": "0x...Permit2 PermitTransferFrom signature"
}
```

```json
"eip2612Authorization": {
  "permit": {
    "deadline": 1679616000,
    "v": 27,
    "r": "0x...",
    "s": "0x..."
  },
  "permit2": {
    "nonce": 0,
    "deadline": 1679616000,
    "signature": "0x...Permit2 PermitTransferFrom signature"
  }
}
```

**Type: `voucher`**

Used when a subchannel exists with sufficient remaining balance.

```json
{
  "x402Version": 2,
  "accepted": {
    "scheme": "deferred",
    "network": "eip155:8453",
    "amount": "1000",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "payTo": "0xServerPayToAddress",
    "maxTimeoutSeconds": 3600,
    "extra": {
      "serviceId": "0xabc123...serviceId",
      "name": "USDC",
      "version": "2"
    }
  },
  "payload": {
    "type": "voucher",
    "serviceId": "0xabc123...serviceId",
    "payer": "0xClientAddress",
    "cumulativeAmount": "5000",
    "nonce": 5,
    "signature": "0x...EIP-712 voucher signature"
  }
}
```

---

## Server: State & Facilitator Forwarding

The server is the sole owner of per-subchannel session state. The facilitator is stateless.

### Per-Subchannel State

The server MUST maintain per-subchannel state:


| State Field               | Type      | Description                                                               |
| ------------------------- | --------- | ------------------------------------------------------------------------- |
| `serviceId`               | `bytes32` | Service identifier                                                        |
| `payer`                   | `address` | Client address                                                            |
| `chargedCumulativeAmount` | `uint128` | Actual accumulated cost for this subchannel                               |
| `signedCumulativeAmount`  | `uint128` | `cumulativeAmount` from the latest client-signed voucher                  |
| `lastNonce`               | `uint64`  | Nonce from the latest accepted voucher                                    |
| `signature`               | `bytes`   | Client's voucher signature for `signedCumulativeAmount`                   |
| `deposit`                 | `uint128` | Current subchannel deposit (mirrored from facilitator `/verify` response) |
| `totalClaimed`            | `uint128` | Total claimed onchain (mirrored from facilitator response)                |
| `withdrawRequestedAt`     | `uint64`  | Withdrawal request timestamp, 0 if none (mirrored from facilitator)       |
| `lastRequestTimestamp`    | `uint64`  | Timestamp of the last paid request on this subchannel                     |


### Request Processing (MUST)

The server MUST serialize request processing per subchannel. The server MUST NOT update voucher state until the resource handler has succeeded.

1. **Verify**: Check increment locally, call facilitator `/verify`
2. **Execute**: Run the resource handler
3a. **On success** — commit state:
  - Determine `actualPrice` (the actual charge for this request, `<= PaymentRequirements.amount`)
  - `chargedCumulativeAmount += actualPrice`
  - `signedCumulativeAmount = payload.cumulativeAmount`
  - `lastNonce = payload.nonce`
  - `signature = payload.signature`
  - Mirror `deposit`, `totalClaimed`, `withdrawRequestedAt` from the facilitator response
  - Update `lastRequestTimestamp`
3b. **On failure**: State unchanged, client can retry the same voucher.

---

## Facilitator Interface

The `deferred` scheme on EVM uses the standard x402 facilitator interface (`/verify`, `/settle`, `/supported`). The facilitator is stateless and derives context from `payload` (client's signed commitment), `paymentRequirements` (base 402 terms) and onchain state.

### `/settle` Behavior on EVM

The EVM binding uses `/settle` for multiple purposes:

1. **Subchannel lifecycle** (deposit, requestWithdrawal, withdraw): These execute onchain immediately and `SettlementResponse.transaction` contains a real tx hash.
2. **Per-request voucher flow**: For normal voucher requests, the server does NOT call `/settle`. It only calls `/verify` and stores the voucher locally. The server batches claim and settlement at its discretion.
3. **Claim & settle**: The server sends accumulated vouchers to the facilitator, which submits `claim()` and optionally `settle()` onchain.

### POST /verify

Verifies a payment payload without onchain interaction.

Verification logic is defined in [Verification Rules](#verification-rules-must).

**Response:**

```json
{
  "isValid": true,
  "payer": "0xPayerAddress",
  "extra": {
    "deposit": "1000000",
    "totalClaimed": "500000",
    "withdrawRequestedAt": 0
  }
}
```

The server mirrors `deposit`, `totalClaimed`, and `withdrawRequestedAt` into its per-subchannel state (see [Request Processing](#request-processing-must)).

### POST /settle

Performs onchain operations. The facilitator infers the action from the payload:


| `settleAction`        | Payload Type  | Onchain Operation                                                              | When Used                                           |
| --------------------- | ------------- | ------------------------------------------------------------------------------ | --------------------------------------------------- |
| `"deposit"`           | `deposit`     | `depositWith{ERC3009,Permit,EIP2612}()` (per authorization variant)            | First request or top-up                              |
| `"claim"`             | `voucher[]`   | `claim(serviceId, VoucherClaim[])`                                             | Server batches voucher claims                        |
| `"settle"`            | (none)        | `settle(serviceId)`                                                            | Server transfers claimed funds to payTo              |
| `"requestWithdrawal"` | (payer auth)  | `requestWithdrawalFor(serviceId, payer, authorization)`                        | Client requests withdrawal                           |
| `"withdraw"`          | (none)        | `withdraw(serviceId, payer)`                                                   | After withdraw window elapses, resets subchannel     |


**Settlement Logic:**

- **`deposit`**: Submit the appropriate `depositWith*()` variant based on `payload.deposit.authorization`. Returns the transaction hash.
- **`claim`**: Submit `claim(serviceId, VoucherClaim[])` with one or more voucher entries from different subchannels. The contract verifies each voucher signature and updates subchannel accounting. No token transfer occurs.
- **`settle`**: Submit `settle(serviceId)`. Transfers all claimed-but-unsettled funds to the service's current `payTo`.
- **`requestWithdrawal`**: Submit `requestWithdrawalFor(serviceId, payer, authorization)` with the payer's EIP-712 signature. Records `withdrawRequestedAt = now` on the subchannel.
- **`withdraw`**: Submit `withdraw(serviceId, payer)`. After `withdrawRequestedAt + service.withdrawWindow`, refunds unclaimed deposit to the payer and resets the subchannel for future deposits.

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
    "withdrawRequestedAt": 0
  }
}
```

The `amount` field contains the actual charge for the request (`<= PaymentRequirements.amount`). The server mirrors `deposit`, `totalClaimed`, `withdrawRequestedAt`, and `nonce` into its state and uses them along with `amount` and `chargedCumulativeAmount` to populate the `PAYMENT-RESPONSE` header.

### GET /supported

```json
{
  "kinds": [
    { "x402Version": 2, "scheme": "deferred", "network": "eip155:8453" },
    { "x402Version": 2, "scheme": "exact", "network": "eip155:8453" }
  ],
  "extensions": [],
  "signers": {
    "eip155:*": ["0xFacilitatorSignerAddress"]
  }
}
```

### Verification Rules (MUST)

A facilitator verifying a `deferred`-scheme payment on EVM MUST enforce:

1. **Signature validity**: Compute the EIP-712 digest for `Voucher(serviceId, payer, cumulativeAmount, nonce)` using the `DeferredEscrow` domain separator. Recover the signer via `ecrecover`. The recovered signer MUST match `payer`.
2. **Service existence**: Read `DeferredEscrow.getService(serviceId)` — the service MUST be registered.
3. **Subchannel state**: For `voucher` payloads, read `DeferredEscrow.getSubchannel(serviceId, payer)` — the subchannel MUST have a positive balance (`deposit - totalClaimed > 0`). For `deposit` payloads, the subchannel may or may not already have a balance (new or top-up).
4. **Token match**: The service's registered token MUST equal `paymentRequirements.asset`. The contract MUST be on the correct chain.
5. **Balance check** (`deposit` only): Verify the client has sufficient token balance (`>= deposit amount`). For `voucher` payloads this is not needed as funds are already in escrow.
6. **Deposit sufficiency**: `payload.cumulativeAmount` MUST be `<= subchannel.deposit` (onchain). For `deposit` payloads, `payload.cumulativeAmount` MUST be `<= subchannel.deposit + deposit.amount`.
7. **Not below claimed**: `payload.cumulativeAmount` MUST be `> subchannel.totalClaimed` (onchain). Prevents replay of already-claimed vouchers.
8. **Nonce increasing**: `payload.nonce` MUST be `> subchannel.nonce` (onchain). Prevents replay of previously claimed vouchers.

The facilitator MUST return the onchain subchannel snapshot (`deposit`, `totalClaimed`, `withdrawRequestedAt`) in the `/verify` and `/settle` response `extra` field. If `withdrawRequestedAt != 0`, the server should claim outstanding vouchers promptly before the withdraw window elapses.

#### Server Check (off-chain)

The server MUST check the cumulative amount increment locally:

- `payload.cumulativeAmount` MUST equal `chargedCumulativeAmount + paymentRequirements.amount`
- `payload.nonce` MUST equal `lastNonce + 1`

The client bases its next voucher on the server-reported actual cumulative (from `PAYMENT-RESPONSE.extra.chargedCumulativeAmount`) and nonce (from `PAYMENT-RESPONSE.extra.nonce`).

If the check fails, the server rejects with `deferred_stale_cumulative_amount` and returns a corrective 402.

For time-critical applications the server may skip the `/verify` facilitator call for `voucher` payloads and perform the verification itself based on cached onchain state.

---

## Claim & Settlement Strategy

The two-phase claim/settle model gives the server flexibility in how it redeems earned funds:

**`claim(serviceId, VoucherClaim[])`** validates voucher signatures and updates each subchannel's `totalClaimed`. Multiple subchannels (different payers) can be claimed in a single transaction. No token transfer occurs — the contract only updates accounting.

**`settle(serviceId)`** transfers all claimed-but-unsettled funds to the service's current `payTo` in a single token transfer. The `payTo` at settle time determines where funds go, allowing the server to rotate payout addresses freely between settles.

```
struct VoucherClaim {
    address payer;
    uint128 cumulativeAmount;   // client-signed maximum
    uint128 claimAmount;        // actual amount to claim (<= cumulativeAmount, <= subchannel.deposit)
    uint64 nonce;
    bytes signature;            // EIP-712 Voucher signature from payer
}
```


| Strategy            | Description                                             | Trade-off                        |
| ------------------- | ------------------------------------------------------- | -------------------------------- |
| **Periodic**        | Claim + settle every N minutes                          | Predictable gas costs            |
| **Threshold**       | Claim + settle when unclaimed amount exceeds T          | Bounds server's risk exposure    |
| **On withdrawal**   | Claim + settle when `withdrawRequestedAt` becomes non-0 | Minimum gas, maximum risk window |


The server MUST claim all outstanding vouchers before the withdraw window elapses (i.e., before `withdrawRequestedAt + service.withdrawWindow`). After the window passes, anyone can call `withdraw()` and unclaimed funds are returned to the payer.

---

## Subchannel Discovery

A subchannel is uniquely identified by `(serviceId, payer)`. The client always knows both values:

- `serviceId` is provided in the 402 response (`extra.serviceId`)
- `payer` is the client's own address

To check if a subchannel exists and its current state, the client calls `DeferredEscrow.getSubchannel(serviceId, payer)` — a single RPC read. No scanning, salt conventions, or server cooperation is required.


---

## Client Verification Rules (MUST)

The facilitator's verification rules protect the server. The following rules protect the **client** from a misbehaving server.

### In-Session Verification

Before using `PAYMENT-RESPONSE` values as the base for the next voucher, the client MUST check:

1. **Actual charge within bounds**: `PAYMENT-RESPONSE.amount` MUST be `<= PaymentRequirements.amount`.
2. **Cumulative amount increment**: `PAYMENT-RESPONSE.extra.chargedCumulativeAmount` MUST equal `previousChargedCumulativeAmount + PAYMENT-RESPONSE.amount`.
3. **Deposit consistency**: For non-deposit responses, `PAYMENT-RESPONSE.extra.deposit` MUST equal the client's last known deposit. For deposit responses, it MUST equal `previousDeposit + depositAmount`.
4. **ServiceId consistency**: `PAYMENT-RESPONSE.extra.serviceId` MUST match the service the client is operating with.

The client computes the next voucher as: `nextCumulativeAmount = PAYMENT-RESPONSE.extra.chargedCumulativeAmount + PaymentRequirements.amount` and `nextNonce = PAYMENT-RESPONSE.extra.nonce + 1`.

If any check fails, the client MUST NOT sign further vouchers and SHOULD initiate `requestWithdrawal`.

### Recovery After State Loss

If the client has lost session state, it can recover by reading the subchannel onchain via `getSubchannel(serviceId, payer)`. The onchain `totalClaimed` and `nonce` represent the last claimed state. If the server holds unsettled vouchers above the onchain state, the server rejects with `deferred_stale_cumulative_amount` and returns a corrective 402 containing `chargedCumulativeAmount`, `signedCumulativeAmount`, `nonce`, and `signature` in `extra`.

The client MUST verify the server's claimed state before resuming:

1. **Verify voucher signature**: Compute the EIP-712 `Voucher(serviceId, payer, signedCumulativeAmount, nonce)` digest, recover the signer from `signature`, confirm it matches the client's own address.
2. **Charged within signed**: `chargedCumulativeAmount` MUST be `<= signedCumulativeAmount`.
3. **Onchain consistency**: `chargedCumulativeAmount` MUST be `>=` the onchain `subchannel.totalClaimed`.
4. **Resume**: The client resumes with `chargedCumulativeAmount` as the base for the next voucher (`nextCumulativeAmount = chargedCumulativeAmount + PaymentRequirements.amount`) and `nextNonce = nonce + 1`.

If the signature does not verify, the client MUST NOT sign based on the server's claimed state and SHOULD fall back to `requestWithdrawal`.

---

## Lifecycle Notes

**Service Registration**: A server registers once per service by calling `register()` with a chosen `serviceId` (first-come-first-serve). The server includes `serviceId` in all subsequent 402 responses. Registration specifies the accepted token, initial `payTo`, initial authorizer, and `withdrawWindow`.

**Depositing & Top-Up**: When a client first interacts with a service, it deposits funds into a subchannel via `depositWith*()`. Subsequent deposits to the same `(serviceId, payer)` subchannel top up the balance. Deposits also cancel any pending withdrawal request (`withdrawRequestedAt` is reset to 0).

**payTo Rotation**: The service's authorizer can call `updatePayTo()` at any time. This takes effect at the next `settle()` call. No subchannel closures or channel rotations are needed — claimed funds simply flow to the new `payTo` when settled.

**Withdrawal Flow**: When a client wants funds back:
1. Client calls `requestWithdrawal` (or `requestWithdrawalFor` via facilitator). This sets `withdrawRequestedAt = block.timestamp` on the subchannel.
2. The server has `withdrawWindow` seconds (configured at service registration) to claim outstanding vouchers via `claim()`.
3. After `withdrawRequestedAt + service.withdrawWindow`, anyone can call `withdraw(serviceId, payer)` to refund unclaimed funds to the payer.
4. `withdraw` **resets** the subchannel (deposit, totalClaimed, nonce, and withdrawRequestedAt all go to 0) rather than deleting it. The subchannel remains addressable at `(serviceId, payer)` and the client can deposit again at any time.

**Subchannel Persistence**: Subchannels are never deleted. They are created implicitly on first deposit and persist forever. After withdrawal, the subchannel is reset to a zero state, ready for future deposits. This avoids collision issues if the same payer re-engages with the same service.

**Server Claim Timing**: The server MUST claim all outstanding vouchers before the withdraw window elapses. Unclaimed vouchers become unclaimable after `withdraw()` resets the subchannel. The facilitator returns `withdrawRequestedAt` in every `/verify` and `/settle` response, so the server is always aware of pending withdrawal requests.

---

## Error Codes

Implementers MUST use the generic `deferred` error codes from [scheme_deferred.md](./scheme_deferred.md#error-codes) when the failure matches the generic semantics.

The EVM network binding additionally defines these binding-specific codes:


| Error Code                            | Description                                                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `deferred_evm_service_not_found`      | No registered service exists for the given `serviceId`                                                                |
| `deferred_evm_subchannel_not_found`   | No subchannel exists (or has zero balance) for the given `(serviceId, payer)`                                         |
| `deferred_evm_withdrawal_pending`     | A withdrawal request is pending on this subchannel; client should wait or deposit to cancel it                        |
| `deferred_evm_invalid_increment`      | Voucher delta does not equal the required `amount` per request                                                        |
| `deferred_evm_token_mismatch`         | Service's registered token does not match `asset` in requirements                                                     |
| `deferred_stale_cumulative_amount`    | Client voucher base does not match the server's last known `chargedCumulativeAmount`; server returns a corrective 402 |


---

## Version History


| Version | Date       | Changes                                       | Author    |
| ------- | ---------- | --------------------------------------------- | --------- |
| v0.4    | 2026-03-31 | Service registry + subchannel architecture     | @CarsonRoscoe |
| v0.3    | 2026-03-31 | Add voucherId for concurrency                  | @phdargen |
| v0.2    | 2025-03-30 | Add dynamic price                              | @phdargen |
| v0.1    | 2025-03-21 | Initial draft                                  | @phdargen |

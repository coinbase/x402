# Scheme: `exact` on `NEAR`

## Versions supported

- ❌ `v1`
- ✅ `v2`

## Supported Networks

This spec uses CAIP-style network identifiers:

- `near:mainnet`
- `near:testnet`

## Summary

The `exact` scheme on NEAR transfers a specific amount of a NEP-141 fungible token from the client to the resource server using a signed `DelegateAction` (NEP-366).

The facilitator sponsors transaction fees by wrapping the client-signed delegate action in an on-chain transaction. The client still controls payment intent (asset, recipient, and amount) through its signature.

## Protocol Flow

1. Client requests a protected resource.
2. Resource server returns a payment-required signal with `PAYMENT-REQUIRED` and `PaymentRequired` data.
3. `accepts[].extra.relayerId` communicates the facilitator relayer account that will sponsor gas.
4. Client builds a `DelegateAction` that invokes NEP-141 `ft_transfer` for the required token and amount.
5. Client signs the delegate action and serializes `SignedDelegateAction` with Borsh.
6. Client sends a second request with `PAYMENT-SIGNATURE`, containing a base64-encoded `PaymentPayload`.
7. Resource server forwards payload and requirements to facilitator `/verify`.
8. Facilitator verifies structure, intent, replay/expiry, and sponsorship safety.
9. Resource server fulfills work after successful verification.
10. Resource server calls facilitator `/settle`.
11. Facilitator wraps the signed delegate action in `Action::Delegate`, signs as relayer, and submits to NEAR.
12. Resource server returns the final response including `PAYMENT-RESPONSE`.

## `PaymentRequirements` for `exact`

In addition to standard x402 fields, NEAR `exact` uses `extra.relayerId`:

```json
{
  "scheme": "exact",
  "network": "near:mainnet",
  "amount": "1000000",
  "asset": "usdc.near",
  "payTo": "merchant.near",
  "maxTimeoutSeconds": 60,
  "extra": {
    "relayerId": "facilitator.near"
  }
}
```

Field notes:

- `asset`: NEP-141 token contract account ID.
- `payTo`: NEAR account ID that receives funds.
- `amount`: Atomic token amount required for access.
- `extra.relayerId`: Facilitator relayer account expected to sponsor settlement.

## PaymentPayload `payload` Field

The `payload` field contains a base64-encoded Borsh `SignedDelegateAction`:

```json
{
  "signedDelegateAction": "BASE64_BORSH_SIGNED_DELEGATE_ACTION"
}
```

Full `PaymentPayload` object:

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://example.com/weather",
    "description": "Access to protected weather data",
    "mimeType": "application/json"
  },
  "accepted": {
    "scheme": "exact",
    "network": "near:mainnet",
    "amount": "1000000",
    "asset": "usdc.near",
    "payTo": "merchant.near",
    "maxTimeoutSeconds": 60,
    "extra": {
      "relayerId": "facilitator.near"
    }
  },
  "payload": {
    "signedDelegateAction": "BASE64_BORSH_SIGNED_DELEGATE_ACTION"
  }
}
```

## `SettlementResponse`

```json
{
  "success": true,
  "transaction": "H9m4hYhX7w8eJ4...",
  "network": "near:mainnet",
  "payer": "alice.near"
}
```

## Facilitator Verification Rules (MUST)

A facilitator verifying `exact` on NEAR MUST enforce all checks below before signing as relayer.

### 1. Protocol and requirement consistency

- `x402Version` MUST be `2`.
- `payload.accepted.scheme` and `requirements.scheme` MUST both equal `"exact"`.
- `payload.accepted.network` MUST equal `requirements.network`.
- `payload.accepted.asset` MUST equal `requirements.asset`.
- `payload.accepted.payTo` MUST equal `requirements.payTo`.
- `payload.accepted.amount` MUST equal `requirements.amount` exactly.

### 2. Signed delegate action validity

- `payload.signedDelegateAction` MUST decode as a valid Borsh `SignedDelegateAction`.
- The delegate signature MUST be valid for `delegate_action.public_key`.
- `delegate_action.sender_id` MUST resolve to an account authorized by the included public key.
- `delegate_action.max_block_height` MUST be greater than current block height.
- Expiry horizon MUST be bounded by `maxTimeoutSeconds` policy (implementation-defined conversion to block height).

### 3. Payment intent integrity

- `delegate_action.actions` MUST contain exactly one supported transfer intent.
- The action MUST correspond to NEP-141 `ft_transfer` only.
- Transfer token contract MUST match `requirements.asset`.
- Transfer recipient MUST match `requirements.payTo` exactly.
- Transfer amount MUST match `requirements.amount` exactly.
- `ft_transfer` attached deposit MUST be exactly `1` yoctoNEAR.

### 4. Replay and anti-abuse checks

- Nonce replay protection MUST be enforced for the delegate action.
- Duplicate payload reuse MUST be rejected.
- The delegate action MUST NOT contain additional calls, batched side effects, or unrelated actions.

### 5. Relayer sponsorship safety

- `requirements.extra.relayerId` MUST be present and match the relayer account controlled by the facilitator.
- The relayer account MUST NOT be the payer (`sender_id`) for the delegated transfer.
- The delegated action MUST NOT authorize spending from facilitator-controlled token balances.
- Gas and attached values MUST be bounded by facilitator policy to prevent sponsorship drain.

### 6. Pre-settlement simulation

- Facilitator SHOULD simulate or preflight-check execution before settlement.
- Settlement MUST fail if preflight indicates insufficient funds, expired action, or invalid authorization.

## Settlement Logic

1. Re-run verification checks (do not trust prior `/verify` result).
2. Construct a NEAR transaction including `Action::Delegate(signedDelegateAction)`.
3. Sign with relayer key matching `extra.relayerId`.
4. Broadcast transaction to the configured NEAR RPC.
5. Wait for a terminal on-chain outcome.
6. Return x402 `SettlementResponse` with `success`, `transaction`, `network`, and `payer`.

## Appendix

### SignedDelegateAction shape (conceptual)

```rust
struct SignedDelegateAction {
  delegate_action: DelegateAction,
  signature: Signature,
}

struct DelegateAction {
  sender_id: AccountId,
  receiver_id: AccountId,
  actions: Vec<Action>,
  nonce: u64,
  max_block_height: u64,
  public_key: PublicKey,
}
```

### References

- [x402 v2 core specification](../../x402-specification-v2.md)
- [x402 v2 HTTP transport](../../transports-v2/http.md)
- [NEP-141 Fungible Token Standard](https://nomicon.io/Standards/Tokens/FungibleToken/Core)
- [NEP-366 Delegate Actions](https://github.com/near/NEPs/pull/366)
- [NEAR meta-transaction relayer docs](https://docs.near.org/chain-abstraction/meta-transactions-relayer)

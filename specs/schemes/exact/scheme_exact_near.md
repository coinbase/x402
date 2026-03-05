# Scheme: `exact` on `NEAR`

## Summary

The `exact` scheme on NEAR lets a client pay an exact amount of a NEP-141 token while a facilitator-sponsored relayer submits the on-chain transaction.

The client signs a NEP-366 `SignedDelegateAction` that authorizes one exact `ft_transfer` call. The facilitator verifies that payload against `PaymentRequirements`, then submits it through a configured relayer account.

NEAR account keys and signatures may use either `ed25519` or `secp256k1`; implementers should account for both when validating signed delegate actions.

## Versions Supported

This specification supports **x402 v2 only**.

- `x402Version` in `PAYMENT-REQUIRED` and `PAYMENT-SIGNATURE` MUST be `2`.
- v1 fields and headers are out of scope.

## Supported Networks

NEAR networks MUST use CAIP-style identifiers:

- `near:mainnet`
- `near:testnet`

Implementations MAY support additional `near:*` identifiers, but this spec defines behavior for the two canonical networks above.

## Protocol Flow

1. Client requests a protected resource.
2. Resource server responds `402 Payment Required` with a `PAYMENT-REQUIRED` header containing a v2 `PaymentRequired` object.
3. Client selects one `accepts[]` entry and constructs a NEAR `SignedDelegateAction` for one exact `ft_transfer`.
4. Client retries with `PAYMENT-SIGNATURE`, carrying a v2 `PaymentPayload`.
5. Resource server calls facilitator `verify` with the `PaymentPayload` and selected `PaymentRequirements`.
6. If verification succeeds, resource server calls facilitator `settle`.
7. Facilitator relayer submits the delegate action to NEAR and returns `SettlementResponse`.
8. Resource server returns the protected response and includes `PAYMENT-RESPONSE`.

## `PaymentRequirements` for `exact`

`PaymentRequirements` follows the core v2 schema. For NEAR exact payments, `extra.relayerId` is required.

```json
{
  "scheme": "exact",
  "network": "near:testnet",
  "amount": "1000000",
  "asset": "usdc.testnet",
  "payTo": "merchant.testnet",
  "maxTimeoutSeconds": 60,
  "extra": {
    "relayerId": "x402-relayer.testnet"
  }
}
```

### Field Notes

- `amount`: exact token quantity in atomic units as a decimal string.
- `asset`: NEP-141 token contract account ID.
- `payTo`: recipient NEAR account ID that must receive the transfer.
- `extra.relayerId`: facilitator-managed relayer account that will sponsor submission.
- `extra` MAY contain additional metadata, but unknown keys MUST NOT change verification of amount, recipient, asset, nonce, or expiry.

## `PAYMENT-SIGNATURE` Payload

The NEAR exact payload object is:

```json
{
  "signedDelegateAction": "base64-borsh-signed-delegate-action"
}
```

`signedDelegateAction` is a base64-encoded Borsh `SignedDelegateAction` whose delegate action represents exactly one NEP-141 `ft_transfer`.

### Signature Curve Support

- NEAR protocol-level key/signature support includes both `ed25519` and `secp256k1`.
- Facilitators MUST verify signatures using the algorithm implied by the delegate key type.
- Implementations SHOULD support both curves for interoperability.
- If an implementation intentionally supports only a subset of curves, it MUST document that behavior and reject unsupported key types deterministically.

Full `PaymentPayload` example:

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://example.com/weather",
    "description": "Access to protected content",
    "mimeType": "application/json"
  },
  "accepted": {
    "scheme": "exact",
    "network": "near:testnet",
    "amount": "1000000",
    "asset": "usdc.testnet",
    "payTo": "merchant.testnet",
    "maxTimeoutSeconds": 60,
    "extra": {
      "relayerId": "x402-relayer.testnet"
    }
  },
  "payload": {
    "signedDelegateAction": "AQAAA...<base64>..."
  }
}
```

## Facilitator Verification Rules (MUST)

A facilitator verifying a NEAR `exact` payment MUST reject any payload that fails any rule below.

### 1. Version, Scheme, and Network

- `payload.x402Version` MUST equal `2`.
- `payload.accepted.scheme` and required scheme MUST both be `exact`.
- `payload.accepted.network` MUST equal `PaymentRequirements.network`.
- Network MUST be a NEAR CAIP identifier for this scheme (`near:mainnet` or `near:testnet`).

### 2. Requirement Consistency

- `asset`, `payTo`, and `amount` in `payload.accepted` MUST exactly match `PaymentRequirements`.
- `extra.relayerId` MUST exist and be a string.

### 3. Relayer Sponsorship Abuse Prevention

- `extra.relayerId` MUST be managed by the facilitator.
- Relayer account MUST NOT equal the payer (`delegate_action.sender_id`).
- Facilitator MUST apply policy controls to relayer usage (for example per-relayer allowlists, budget, and rate limits).

### 4. SignedDelegateAction Integrity

- `payload.signedDelegateAction` MUST decode as a valid Borsh `SignedDelegateAction`.
- Signature type and key type MUST be valid NEAR-supported types (`ed25519` or `secp256k1`).
- Signature verification MUST use the matching curve for the declared key type.
- Signature MUST verify against the exact encoded `delegate_action` bytes and the included public key.

### 5. Replay and Expiry Protection

- `delegate_action.max_block_height` MUST be strictly greater than current chain height at verification time.
- Facilitator MUST perform nonce replay protection for `(sender_id, public_key, nonce)`.
- If nonce state cannot be safely determined, verification MUST fail closed.

### 6. Delegated Action Safety (No Extra Actions)

- `delegate_action.actions` MUST contain exactly one action.
- The only allowed action kind is `FunctionCall`.
- `FunctionCall.methodName` MUST be `ft_transfer`.
- No extra delegated actions are permitted.

### 7. Token Transfer Intent and Exactness

- `delegate_action.receiver_id` MUST equal `PaymentRequirements.asset`.
- Parsed `ft_transfer.args.receiver_id` MUST equal `PaymentRequirements.payTo`.
- Parsed `ft_transfer.args.amount` MUST equal `PaymentRequirements.amount` exactly.
- Attached deposit MUST be exactly `1` yoctoNEAR.
- Sponsored gas MUST be within facilitator policy bounds.

### 8. Access-Key Permission Safety

- Facilitator MUST ensure the delegate public key has permission compatible with the intended call.
- At minimum, permission checks MUST prevent the delegate key from being used to authorize actions outside the intended token transfer context.

## Settlement

After successful verification, settlement proceeds as follows:

1. Select relayer from `PaymentRequirements.extra.relayerId`.
2. Decode `signedDelegateAction`.
3. Build an outer relayer transaction containing `Action::Delegate`.
4. Sign outer transaction with relayer key.
5. Submit to the NEAR RPC endpoint for the selected network.
6. Return the resulting transaction id if accepted.

If submission fails, facilitator returns `success: false` with an implementation-specific `errorReason` and empty `transaction`.

## `PAYMENT-RESPONSE` (`SettlementResponse`) Example

Success:

```json
{
  "success": true,
  "transaction": "F7p8QyW8tWnL1QhP9j8uV1q2rM5aZ6xC3e4kT9mN2pR",
  "network": "near:testnet",
  "payer": "alice.testnet"
}
```

Failure:

```json
{
  "success": false,
  "errorReason": "delegate_action_nonce_reused",
  "transaction": "",
  "network": "near:testnet",
  "payer": "alice.testnet"
}
```

## Appendix

### Transport Header Mapping (HTTP v2)

- `PAYMENT-REQUIRED`: carries `PaymentRequired`.
- `PAYMENT-SIGNATURE`: carries `PaymentPayload`.
- `PAYMENT-RESPONSE`: carries `SettlementResponse`.

### References

- [x402 Core Specification v2](../../x402-specification-v2.md)
- [HTTP Transport v2](../../transports-v2/http.md)
- [Exact Scheme Overview](./scheme_exact.md)
- [NEP-141 Fungible Token Standard](https://nomicon.io/Standards/Tokens/FungibleToken/Core)
- [NEP-366 Delegate Action](https://nomicon.io/Standards/ChainAbstraction/MetaTransactions)
- [NEP-413 Signed Message Standard](https://nomicon.io/Standards/Wallets/WalletSignMessage)

# Scheme: `exact` on `ICP`

## Summary

This document specifies the `exact` payment scheme for the x402 protocol on Internet Computer (ICP).

This scheme facilitates payments of a specific amount of an ICRC2 token on the ICP blockchain.

## `PaymentRequirements` for `exact`

No additional fields are required beyond the standard x402 `PaymentRequirements` fields for the `exact` scheme on ICP.

Example:

```json
{
  "scheme": "exact",
  "network": "icp",
  "maxAmountRequired": "100000000",
  "asset": "druyg-tyaaa-aaaaq-aactq-cai",
  "payTo": "77ibd-jp5kr-moeco-kgoar-rro5v-5tng4-krif5-5h2i6-osf2f-2sjtv-kqe",
  "resource": "https://internetcomputer.org",
  "description": "Payment for some resource",
  "maxTimeoutSeconds": 300
}
```

The `network` should be `icp`, since there is no testnet for ICP.

## `X-Payment` header payload

The `payload` field of the `X-PAYMENT` header must contain the following fields:

- `signature`: The signature of the `authorization` signed by Internet Identity.
- `authorization`: Parameters required for payment.

Example:

```json
{
  "signature": "o2Fk92FwWCwwKjAFBgMrZXADIQBLRapCR7X0Q5-C7bXiAmeYjX2E5q_g7k3uIaI3hBlvPGFzWEAPj4lw96yz4NBuPgluhZs2Squup9SZU7IOk8P1vzQ2Ox1WeKxBt88CJHCzU38NzpeXH3JhII_dEP1aQ0IN8j8K",
  "authorization": {
    "scheme": "exact",
    "asset": "druyg-tyaaa-aaaaq-aactq-cai",
    "to": "77ibd-jp5kr-moeco-kgoar-rro5v-5tng4-krif5-5h2i6-osf2f-2sjtv-kqe",
    "value": "100000000",
    "expiresAt": 1761637062000,
    "nonce": 6
  }
}
```

Full `X-PAYMENT` header:

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "icp",
  "payload": {
    "signature": "o2Fk92FwWCwwKjAFBgMrZXADIQBLRapCR7X0Q5-C7bXiAmeYjX2E5q_g7k3uIaI3hBlvPGFzWEAPj4lw96yz4NBuPgluhZs2Squup9SZU7IOk8P1vzQ2Ox1WeKxBt88CJHCzU38NzpeXH3JhII_dEP1aQ0IN8j8K",
    "authorization": {
      "scheme": "exact",
      "asset": "druyg-tyaaa-aaaaq-aactq-cai",
      "to": "77ibd-jp5kr-moeco-kgoar-rro5v-5tng4-krif5-5h2i6-osf2f-2sjtv-kqe",
      "value": "100000000",
      "expiresAt": 1761637062000,
      "nonce": 6
    }
  }
}
```

### `authorization` Schema

The `authorization` schema contains the following fields:

**All fields are required.**

| Field Name  | Type     | Required | Description                                                                                                                                                                           |
| ----------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scheme`    | `string` | Yes      | Payment scheme identifier (e.g., "exact")                                                                                                                                             |
| `asset`     | `string` | Yes      | ICRC2 token ledger canister address                                                                                                                                                   |
| `to`        | `string` | Yes      | Recipient wallet address for the payment                                                                                                                                              |
| `value`     | `string` | Yes      | Required payment amount in atomic token units. For `exact` scheme, this is the exact amount to be transferred. For `upto` scheme, this is the maximum amount that can be transferred. |
| `expiresAt` | `number` | Yes      | Expiration time of the authorization in milliseconds since epoch                                                                                                                      |
| `nonce`     | `number` | Yes      | A self-incrementing number and should be used to prevent replay attacks.                                                                                                              |

### `signature` Signing Flow

Steps to create the `signature` for the `authorization`:

1. Construct the `authorization` object with the required fields.
2. Serialize the `authorization` object to RFC 8949 deterministic CBOR bytes.
3. Digest the CBOR bytes using SHA3-256 to produce a message hash.
4. Sign the message hash using Internet Identity to produce the raw signature bytes.
5. Construct a `Signature` object with the following fields:
   - `signature` or `s`: Required, the raw signature bytes from step 4.
   - `pubkey` or `public_key` or `p`: Required, the public key from Internet Identity.
   - `delegation` or `d`: Optional, Delegation from Internet Identity, if applicable.
6. Serialize the `Signature` object to RFC 8949 deterministic CBOR bytes.
7. Encode the CBOR bytes to a Base64 string to produce the final `signature`.

The `Signature` schema is defined in the ICP's [agent-rs](https://github.com/dfinity/agent-rs/blob/b77f1fc5fe05d8de1065ee4cec837bc3f2ce9976/ic-agent/src/identity/mod.rs#L34) SDK.

Developers can use existing libraries to sign `authorization` with Internet Identity:

Rust: [ic_auth_verifier](https://docs.rs/crate/ic_auth_verifier/latest)
Typescript: [@ldclabs/ic-auth](https://www.npmjs.com/package/@ldclabs/ic-auth)

A full example of interaction with facilitator on ICP can be found in the [anda_x402_example](https://github.com/ldclabs/anda-cloud/blob/main/examples/ts/anda_x402/app.ts).

## Verification

Steps to verify a payment for the `exact` scheme:

1. Verify the authorization parameters are for the agreed-upon ICRC2 contract and chain
2. Verify the signature is valid
3. Verify the value in `payload.authorization` is sufficient to cover `paymentRequirements.maxAmountRequired`
4. Verify the authorization parameters are within the valid time range
5. Verify the nonce is the expected value

We do not require verifying the user's balance or allowance during the Verify phase for two main reasons:

1. Querying `icrc1_balance_of` and `icrc2_allowance` requires asynchronous calls to the asset canister, which must be confirmed by the ICP blockchain consensus and therefore introduces latency.
2. Even if the balance and allowance are checked during the Verify phase, the user could still transfer assets before settlement, causing settlement to fail.

Therefore, we recommend skipping balance checks during verification and relying on the settlement phase to ensure payment validity.

## Settlement

The facilitator settles the payment by calling the `icrc2_transfer_from` method on the specified ICRC2 token ledger canister, using the parameters from the `authorization` object in the `X-PAYMENT` header payload. Users should ensure (via `icrc2_allowance` and `icrc2_approve`) that the facilitator has the necessary allowances to perform the transfer on behalf of the client.

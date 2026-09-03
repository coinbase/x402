# AuthCapture Base Scheme (`@x402/base/auth-capture`, client)

The **auth-capture** scheme adds refundable payments to x402, built on Base's audited
[Commerce Payments Protocol](https://github.com/base/commerce-payments). The client signs a
single payload (ERC-3009 or Permit2) over a payer-agnostic PaymentInfo hash. A facilitator later
submits that payload to `AuthCaptureEscrow`, where funds are held under a `captureAuthorizer` role
rather than transferred straight to the merchant, enabling capture, void, and refund flows before
settlement is final.

Today, `@x402/base`'s `auth-capture` scheme is a thin pass-through wrapper around
[`@x402/evm`'s `auth-capture` scheme](../../../evm/src/auth-capture/README.md) — every method
delegates to an internal `AuthCaptureEvmScheme` instance from `@x402/evm`.

**`@x402/evm` currently ships the auth-capture client only** — there is no server or facilitator
implementation yet, so `@x402/base` mirrors that scope. Server/facilitator wrappers will follow
once `@x402/evm` adds them.

See the [scheme specification](https://github.com/x402-foundation/x402/blob/main/specs/schemes/auth-capture/scheme_auth-capture_evm.md)
for full protocol details.

## Import

| Role | Import |
|------|--------|
| Client | `@x402/base/auth-capture/client` |

## Usage

Register `BaseScheme` with an `x402Client`. The client validates the requirement's `extra`
fields, reconstructs the PaymentInfo struct, computes the payer-agnostic hash, and emits an
ERC-3009 (default) or Permit2 payload — identical behavior to `@x402/evm`.

```typescript
import { x402Client } from "@x402/core/client";
import { BaseScheme } from "@x402/base/auth-capture/client";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);

const client = new x402Client();
client.register("eip155:8453", new BaseScheme(account));
client.register("eip155:84532", new BaseScheme(account));
```

`BaseScheme`'s `BaseClientSigner` only needs `address` + `signTypedData`; a bare viem
`LocalAccount` satisfies the shape, with no `PublicClient` required.

## Payment requirements the client reads

See [`@x402/evm`'s auth-capture docs](../../../evm/src/auth-capture/README.md#payment-requirements-the-client-reads)
for the full `requirements.extra` field table (`captureAuthorizer`, `feeRecipient`,
`captureDeadline`, `refundDeadline`, `minFeeBps`, `maxFeeBps`, `name`, `version`, and the optional
`assetTransferMethod` / `authCaptureEscrow` / `receiverAuthorizer` / `policy` fields) — behavior is
identical to `@x402/evm`.

## Supported networks

| Network | CAIP-2 ID |
|---------|-----------|
| Base Mainnet | `eip155:8453` |
| Base Sepolia | `eip155:84532` |

## See Also

- [`@x402/evm` AuthCapture Scheme](../../../evm/src/auth-capture/README.md) — the implementation this package wraps
- [Scheme specification](https://github.com/x402-foundation/x402/blob/main/specs/schemes/auth-capture/scheme_auth-capture_evm.md)
- [`AuthCaptureEscrow` contract](https://github.com/base/commerce-payments)

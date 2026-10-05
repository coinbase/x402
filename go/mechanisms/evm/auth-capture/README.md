# Auth-Capture EVM Scheme (`go/mechanisms/evm/auth-capture`)

The **auth-capture** scheme adds refundable payments to x402, built on Base's audited [Commerce Payments Protocol](https://github.com/base/commerce-payments). The client signs a single collect payload (ERC-3009 by default, or Permit2) whose nonce is the payer-agnostic PaymentInfo hash.

See the [auth-capture EVM specification](https://github.com/x402-foundation/x402/blob/main/specs/schemes/auth-capture/scheme_auth_capture_evm.md) for protocol details.

## Import Path

| Role   | Import                                                                      |
| ------ | --------------------------------------------------------------------------- |
| Client | `github.com/x402-foundation/x402/go/v2/mechanisms/evm/auth-capture/client` |
| Server | `github.com/x402-foundation/x402/go/v2/mechanisms/evm/auth-capture/server` |
| Facilitator | `github.com/x402-foundation/x402/go/v2/mechanisms/evm/auth-capture/facilitator` |

## Client Usage

Register `AuthCaptureEvmScheme` with an `x402Client`. The client signs the payer-agnostic PaymentInfo hash and emits an ERC-3009 (default) or Permit2 payload.

When `extra.receiverAuthorizer` or `extra.policy` is non-zero, salt binding is on: the client emits a random `saltNonce` and a keccak `salt` committing to those addresses. Otherwise the wire shape is unbound (`salt` is random 32 bytes, no `saltNonce`).

The client resolves the commerce-payments deployment from optional `extra.authCaptureEscrow` (v1.1 default when omitted). That selects the escrow bound into the signature nonce and the collector used for `authorization.to` / `permit2Authorization.spender`.

```go
import (
    x402 "github.com/x402-foundation/x402/go/v2"
    authcaptureclient "github.com/x402-foundation/x402/go/v2/mechanisms/evm/auth-capture/client"
    evmsigners "github.com/x402-foundation/x402/go/v2/signers/evm"
)

signer, _ := evmsigners.NewClientSignerFromPrivateKey(os.Getenv("EVM_PRIVATE_KEY"))

client := x402.Newx402Client()
client.Register("eip155:*", authcaptureclient.NewAuthCaptureEvmScheme(signer))
```

`ClientEvmSigner` only needs `Address()` and `SignTypedData`; no RPC is required for payload construction.

The client participates in the collect (`authorize` / `charge`) step only. Capture, void, and refund lifecycle payloads are server/facilitator responsibilities.

## Server Usage

The server publishes the escrow terms and signs the `Capture`, `Void`, `Charge` and `Refund` messages that let the facilitator release funds. The receiver-authorizer signer is required, except on routes that are both `operatorType: custom` and `captureMode: deferred`, which only collect.

```go
import (
    authcaptureserver "github.com/x402-foundation/x402/go/v2/mechanisms/evm/auth-capture/server"
)

receiverAuthorizer, _ := evmsigners.NewClientSignerFromPrivateKey(os.Getenv("RECEIVER_AUTHORIZER_PRIVATE_KEY"))

scheme := authcaptureserver.NewAuthCaptureEvmScheme(&authcaptureserver.Config{
    ReceiverAuthorizerSigner: receiverAuthorizer,
})
```

Each route's terms come from a route extra, then `Config`, then what the facilitator advertises in `/supported`. `AuthCaptureRouteExtra` is the typed form: pass `Map()` as the route's `Extra`.

| Field | Values | Behaviour |
| --- | --- | --- |
| `PaymentFlow` | `escrow` (default), `authorization` | `authorization` settles a single `charge` after the handler runs. |
| `CaptureMode` | `sync` (default), `deferred` | `deferred` authorizes only and leaves capture to the `LifecycleManager`. Not allowed with `authorization`. |
| `OperatorType` | `delegated` (default), `custom` | `custom` names a contract as `CaptureAuthorizer`. The facilitator must admit it and it requires `deferred`. |
| `CaptureAuthorizer`, `FeeRecipient`, `MinFeeBps`, `MaxFeeBps` | | Merchant-set terms. Invalid terms fail when the requirements are built. |
| `CaptureDeadline`, `RefundDeadline` | Unix seconds | Absolute deadlines. |
| `CaptureDeadlineSeconds`, `RefundDeadlineSeconds` | seconds | Offsets from issue time, added to the start of the current minute so 402s issued in the same minute match. |

`captureDeadline` and `refundDeadline` are dynamic extra fields, so the core server ignores them when matching a payment to its requirements. Set both deadlines of one form, never a mix. `maxTimeoutSeconds` must not exceed the capture window. With no fee terms the server publishes the zero address and `0`/`0` bounds, and the facilitator rejects a zero recipient paired with a non-zero bound.

### Settlement flow

- `escrow` + `sync`: the handler runs after `authorize`. A success captures, a failure or cancel voids.
- `escrow` + `deferred`: the handler runs after `authorize` and nothing is captured. A missing record for the payment aborts the settle.
- `authorization`: the server completes the payload with the final amount, fee and signature after the handler runs, and the facilitator submits a single `charge`.
- Overriding the settled amount below the signed amount captures that part and signs a `Void` for the remainder.

### Lifecycle manager

`scheme.NewLifecycleManager(facilitator)` captures, voids and refunds payments recorded in `Config.Storage` (in memory by default, implement `AuthorizedPaymentStorage` for durability). `Capture` takes optional `CaptureOptions` (amount, fee, `VoidRemainder`). `Refund` needs the facilitator to run with `RefundFunding`. Payments on custom operators and `authorization` payments cannot be captured or voided through the manager.

## Facilitator Usage

The facilitator is the delegated escrow operator: it verifies and settles the collect (`authorize`), then relays the server-signed `capture`, `void` or `refund`. It also submits the server-completed `charge` of an `authorization` flow.

```go
import (
    authcapturefacilitator "github.com/x402-foundation/x402/go/v2/mechanisms/evm/auth-capture/facilitator"
)

scheme := authcapturefacilitator.NewAuthCaptureEvmScheme(signer, authcapturefacilitator.AuthCaptureEvmSchemeConfig{
    CaptureAuthorizer: signer.GetAddresses()[0],
})
```

`CaptureAuthorizer` must be one of the signer's addresses. The escrow gates `authorize`, `capture` and `void` on `msg.sender`, so simulations must `eth_call` from that address. A signer that implements the optional `SenderReader` (`ReadContractFrom`) is called with the operator as the sender explicitly. Otherwise its `ReadContract` must itself call from the operator. Simulation failures map to the spec's `invalid_auth_capture_evm_*` reasons. For counterfactual payers, list the wallet factories in `EIP6492AllowedFactories`; verification then simulates only the factory deployment, since the collect cannot be simulated before the wallet exists.

### Custom operators

A custom operator is a contract that forwards to the escrow. The facilitator relays its collect only when listed in `Operators` (an entry with address `*` admits every custom operator) and the signer implements `CallSimulator` and `GasLimitWriter`. It simulates the call under `CustomOperatorGasLimit`, then checks the escrow event, the payment state and every balance delta before broadcasting, and again against the receipt after. It never relays `capture`, `void` or `refund` for a custom operator. When it supports custom operators, `/supported` advertises them in `extra.operators`.

### Refund funding

The refund collector pulls the refunded tokens from the `CaptureAuthorizer`. Set `RefundFunding` only with an out-of-band funding agreement that keeps every advertised submitter funded and approved. Without it a delegated operator's refund is rejected with `invalid_auth_capture_evm_refund_funding_unavailable`.

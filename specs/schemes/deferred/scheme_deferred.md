# Scheme: `deferred`

## Summary

The `deferred` payment scheme lets clients provide a cryptographic payment commitment at request time, while the transfer of value is not executed synchronously during that request. The server accepts the commitment, grants access immediately and financial settlement occurs later through a process defined by the network binding.

Per-request settlement is appropriate for one-off purchases but introduces per-request latency and transaction costs that become prohibitive at scale. `deferred` serves situations where gas fees exceed the value of individual requests, block confirmation time is incompatible with HTTP response latency, request volume requires batched settlement or settlement happens through infrastructure that operates asynchronously from HTTP (payment channels, fiat billing systems, stablecoin invoices).

The commitment model — how a commitment is formed, what backs it, and how it is eventually redeemed — is defined entirely by the network binding.

The `deferred` scheme supports **dynamic pricing**: the client commits up to the maximum per-request price (`PaymentRequirements.amount`), but the server may charge a lower actual price after executing the request. The actual charge is communicated via the `PAYMENT-RESPONSE`.

## Use Cases

- **Micropayment-scale API access.** An AI agent makes thousands of sub-cent API calls per session. The agent signs a commitment per request against a pre-funded session balance. The provider accumulates commitments and redeems them in a single onchain transaction at session end.
- **Long-running data stream.** A client and provider open a payment channel once. Each request increments a signed running total. The provider closes the channel periodically, collecting accumulated value in one settlement regardless of how many individual requests were made.
- **AI crawler content licensing.** A content publisher monetizes AI crawler access. Crawlers authenticate via a network-registered identity. The network verifies each request, accumulates usage, and invoices the crawler operator on a billing cycle. No wallet or onchain interaction is required from the crawler.

## Protocol Behavior

`deferred` uses the standard x402 facilitator interface (spec §7). The server calls `/verify` to validate commitments and `/settle` when settlement or onchain state changes are needed.

Unlike `exact` and `upto` where `/settle` is called on every request to broadcast a transaction, `deferred` bindings separate verification from settlement. The server calls `/verify` per request but may store the commitment locally and defer `/settle` — calling it later for batched settlement, channel lifecycle operations or not at all if the network handles settlement independently.

## Protocol Flow

```
Client                   Resource Server              Facilitator
  |                             |                            |
  |-- PAYMENT-SIGNATURE ------->|                            |
  |                             |-- POST /verify ----------->|
  |                             |<-- { isValid, extra? } ----|
  |                             |                            |
  |                             |     [ server stores commitment ]
  |<-- 200 + resource ----------|                            |
  |                             |                            |
  |                             |     [ later, at server's discretion ]
  |                             |                            |
  |                             |-- POST /settle ----------->|
  |                             |<-- { success, tx hash } ---|
  |                             |                            |
```

## Commitment Identifier

When `/settle` is called, `SettlementResponse.transaction` MUST be non-empty on success. It carries an identifier meaningful to the network binding such as an onchain tx hash, a commitment reference or equivalent. The network binding defines what `transaction` contains and how it can be used to reference the stored commitment.

## Commitment Models

Network bindings choose one of two trust models for backing the client's commitment.

### Capital-Backed

The client's commitment is backed by onchain capital committed before or during the session — pre-funded escrow, a payment channel, or a delegated authorization against a wallet balance. The trust anchor is the client's own funds. No network intermediary is required to underwrite access.

Signed vouchers, channel receipts, and operator-delegated authorizations are all mechanisms for proving entitlement against pre-committed capital. They differ in commitment format and redemption mechanism, but share the same trust model: if the onchain balance exists and the proof is valid, the commitment is good.

Relevant network bindings: `[scheme_deferred_evm.md](./scheme_deferred_evm.md)` 

### Credit-Backed

The client's commitment is backed by a verified identity associated with a billing account managed by a trusted network intermediary. No onchain capital is required from the client. The network authenticates the identity, underwrites the access obligation and settles with the resource server through off-chain infrastructure (fiat batch, stablecoin invoice, etc.) on a defined schedule.

Relevant network bindings: `scheme_deferred_cloudflare.md` ([#1145](https://github.com/coinbase/x402/pull/1145))

---

## Settlement Lifecycle

All `deferred` network bindings share this abstract lifecycle. The network binding defines the specifics of each phase.

### 1. Commit

At request time the client produces a cryptographic payment commitment and attaches it to the `PAYMENT-SIGNATURE` header. The server calls the facilitator's `/verify` endpoint to confirm validity, then serves the resource immediately.

### 2. Store

The server or network retains the commitment in a local voucher store, channel state, account ledger or billing system. The network binding defines who stores commitments, where, and for how long.

### 3. Redeem

Value is transferred out of band through an onchain contract call, a channel close, a fiat batch invoice or any rail the network defines. The trigger, timing and mechanism are network-defined.

---

## Error Codes

In addition to the standard x402 error codes, the `deferred` scheme defines:


| Error Code                             | Description                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| `deferred_commitment_not_found`        | No stored commitment exists for the given identifier                           |
| `deferred_commitment_expired`          | Commitment has exceeded its validity window                                    |
| `deferred_commitment_already_redeemed` | Commitment has already been redeemed                                           |
| `deferred_invalid_commitment`          | Commitment signature or format is invalid                                      |
| `deferred_insufficient_backing`        | Backing balance or credit is insufficient for the commitment                   |
| `deferred_amount_not_increasing`       | Commitment amount is not greater than the last known value (cumulative models) |
| `deferred_stale_cumulative_amount`     | Commitment's base amount does not match the server's last known value          |


Network bindings MAY define additional error codes with a binding-specific prefix.

---

## Appendix

### Network Binding Requirements

Every `deferred` network binding MUST specify:

1. **Commitment format**: The structure and encoding of `PaymentPayload.payload`, including all fields required for verification and redemption.
2. **Verification rules**: How the facilitator validates the commitment at `/verify` time: signature scheme, balance or credit check, replay prevention, expiry.
3. **Storage and `/settle` behavior**: What constitutes a stored commitment for this network, who stores it (server or network), when `/settle` is called, and what `SettlementResponse.transaction` contains on success.
4. **Double-spend prevention**: How the network ensures the same commitment cannot be accepted or redeemed more than once.
5. **Commitment expiry**: When commitments become invalid and what happens to unaccepted commitments after expiry.
6. **Redemption**: Who triggers redemption, when, and through what rail. For capital-backed models, how unspent balance is returned to the client.
7. **Trust model**: Whether the settlement trust anchor is the client's onchain capital (capital-backed) or a network intermediary (credit-backed) and what guarantee the seller has of eventual settlement.

### Extensions

Network bindings may use the following optional extensions to identify the client or communicate additional requirements in the `PaymentRequired` response:

- `**sign-in-with-x`** — for identifying the client's wallet address `[sign-in-with-x.md](../extensions/sign-in-with-x.md)`. Used by `[scheme_deferred_evm.md](./scheme_deferred_evm.md)`.
- `**http-message-signatures`** — for networks authenticating via HTTP Message Signatures ([RFC 9421](https://www.rfc-editor.org/rfc/rfc9421)). Used by `scheme_deferred_cloudflare.md`.
- `**terms`** — for communicating legal terms and usage rights alongside the 402 response.


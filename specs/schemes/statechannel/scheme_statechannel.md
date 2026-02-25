# Scheme: `statechannel`

## Summary

`statechannel` is an off-chain micropayment scheme for x402. A payer and counterparty
maintain a bidirectional channel and exchange signed balance updates per payment.
On-chain transactions are required only for lifecycle events (open, fund, challenge,
close), not for every request.

This scheme defines two interoperable profile identifiers in `PaymentRequirements.scheme`:

- `statechannel-hub-v1`: payer pays a hub, hub routes settlement to payees
- `statechannel-direct-v1`: payer and payee settle directly through a shared channel

## Use Cases

- High-frequency AI tool/API calls where per-request on-chain settlement is too expensive
- Multi-payee routing through a single funded channel to a hub
- Low-latency "pay and retry" flows over HTTP 402

## Profile Requirements

For both profiles, resource servers MUST return standard x402 `PaymentRequirements`
fields and MAY include profile-specific metadata in `extensions[scheme]`.

Recommended profile metadata:

| Field | Type | Applies To | Description |
|---|---|---|---|
| `hubEndpoint` | string (URL) | `statechannel-hub-v1` | Quote/issue API endpoint for hub-routed tickets |
| `mode` | string | `statechannel-hub-v1` | Settlement policy hint (for example `proxy_hold`) |
| `quoteExpiry` | number | `statechannel-hub-v1` | Unix timestamp when quote expires |
| `challengePeriodSec` | number | both | Challenge window for unilateral close |

Servers SHOULD expose both a statechannel profile and at least one fallback scheme
(for example `exact`) during rollout.

## Core Security Requirements

Implementations MUST enforce:

1. Strictly increasing channel nonces per channel.
2. Signature recovery that binds each state update to the expected payer identity.
3. Expiry checks on quotes, tickets, and state update validity windows.
4. Bounded debit per request (requested amount + disclosed fees).
5. Replay protection for `paymentId`/`invoiceId` style identifiers when present.

Detailed EVM payload and verification requirements are in
[`scheme_statechannel_evm.md`](./scheme_statechannel_evm.md).

## Appendix

- Core protocol types: `specs/x402-specification-v2.md`
- Transport semantics: `specs/transports-v2/http.md`

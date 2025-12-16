# Settlements

This directory contains **x402 settlement specifications**.

A *settlement* defines **how a payment is executed and proven** between a client and a resource server. Settlements are **mutually exclusive per payment** and directly affect security properties such as:

* who moves funds
* how replay is prevented
* who bears confirmation/finality (reorg) risk
* whether payment proofs are public or private

## Default Settlement

The default settlement model in x402 today is **authorization-based settlement**.

In this model:

* The payer signs an authorization permitting a transfer
* The server or facilitator submits an on-chain transaction
* Replay protection is enforced by on-chain logic
* Authorization data becomes public once submitted on-chain

This settlement class is implemented using **chain-specific mechanisms**. For example:

* **EVM chains** commonly use EIP-3009-style transfer authorizations
* **Non-EVM chains** may use program- or instruction-based authorizations with equivalent semantics

Unless otherwise specified, x402 implementations SHOULD assume authorization-based settlement as the default.

## Defining Additional Settlement Types

x402 supports additional settlement types via the `settlement` field (an enumerated identifier selecting the settlement mechanism).

Each settlement type MUST have a corresponding specification in this directory that defines, at minimum:

* required fields and payload structure
* payer identity and signature requirements (if any)
* on-chain verification rules
* replay and idempotency requirements
* confirmation/finality policy requirements
* security and operational considerations

Implementations MUST treat unknown or unsupported settlement identifiers as unsupported, and MUST NOT attempt best-effort interpretation of settlement-specific fields.

## Settlement Layering Guidance (Informative)

Settlement types are selected by the `settlement` identifier. Settlement-specific parameters and proof material MUST be carried in a schema-valid way and MUST be unambiguously scoped to the selected settlement.

To support forward compatibility and additional settlement types (e.g., permit-based mechanisms), implementations SHOULD prefer existing extensibility hooks over introducing new top-level fields. Depending on x402 version and scheme, these hooks may include scheme-specific `payload` structures, `extra` fields, or protocol `extensions` containers.

The canonical layering model for settlement-specific data is expected to evolve as x402 standardizes support for additional settlement types. Settlement specifications in this directory SHOULD describe where their settlement-specific data is carried for each supported x402 version, and implementations MUST reject unknown or unsupported settlement identifiers rather than attempting best-effort interpretation.

## Relationship to Other Specification Layers

* **Schemes** define *what* is being paid (e.g., exact pricing).
* **Settlements** define *how payment is executed and verified*.
* **Transports** define *how messages are exchanged*.
* **Extensions** add optional features layered on top of any settlement.

## Evolution and Forward Compatibility

The x402 protocol and its settlement layering model may evolve over time as new settlement types are introduced. Settlement specifications in this directory are expected to evolve accordingly. However, **security and verification requirements within each settlement specification are normative**.

Implementers SHOULD design settlement handling to be explicit, conservative, and forward-compatible.

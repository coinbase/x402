# Signed-Transfer Settlement Specification

## Overview

Signed-Transfer Settlement is the default settlement mechanism in x402.

In this settlement model, the payer signs a structured payload that is **directly consumed on-chain** by a smart contract or program to execute a transfer of funds. The signed payload itself authorizes and effects the transfer when submitted on-chain.

In Signed-Transfer Settlement, the payer does not submit the on-chain transaction directly. Instead, the payer signs a transfer payload off-chain, and a server or facilitator submits the transaction that consumes the signed payload. The server or facilitator is responsible for transaction submission and associated transaction fees (e.g., gas).

This settlement class is implemented using chain-specific mechanisms, such as:

* **EVM chains**: EIP-3009-style signed transfer authorizations
* **Non-EVM chains**: signed instruction payloads interpreted by on-chain programs with equivalent semantics

The full specification for Signed-Transfer Settlement is available at the top level of the Specs directory (both v1 and v2).

## Settlement Properties

Signed-Transfer Settlement has the following defining properties:

* **Payer-signed transfer payload**
  The payer signs a structured payload that specifies the transfer parameters.

* **Facilitated on-chain execution**
  A server or facilitator submits the on-chain transaction that consumes the signed transfer payload and pays the associated transaction fees.

* **Immediate fund movement**
  Funds move at the moment the signed payload is accepted on-chain.

* **Protocol-level replay protection**
  Replay protection is enforced by on-chain state (e.g., nonces, sequence numbers, or equivalent mechanisms).

* **Public authorization data**
  The signed payload and its parameters become publicly visible once submitted on-chain.

## Payer Identity and Binding

Signed-Transfer Settlement requires that the signed payload unambiguously identifies the payer whose funds are transferred.

The settlement mechanism MUST ensure that:
- the signature authorizing the transfer is cryptographically bound to the account from which funds are moved, and
- the on-chain execution environment enforces this binding.

The exact mechanism by which this binding is enforced is chain- and implementation-specific and is outside the scope of this specification.

## Replay Protection

Signed-Transfer Settlement relies on **protocol-level replay protection** enforced by the on-chain execution environment.

Typical mechanisms include:

* nonces
* sequence numbers
* one-time authorization identifiers
* equivalent chain-specific constructs

Replay protection MUST be enforced on-chain. Servers or facilitators MUST NOT attempt to implement replay protection solely off-chain for this settlement type.

## Confirmation and Finality

In Signed-Transfer Settlement:

* Funds are transferred as part of the on-chain execution of the signed payload.
* Servers and facilitators MUST define a confirmation or finality threshold appropriate to their risk tolerance before treating the payment as final.
* Reorganization (reorg) risk is borne by the **server or facilitator**, not the payer.

## Security Posture

Signed-Transfer Settlement has the following security characteristics:

### Strengths

* **Strong payer protection**: funds cannot be transferred without a valid payer signature.
* **Protocol-enforced replay protection**: double-spending is prevented by on-chain state.
* **Stateless verification**: servers can rely on on-chain execution results rather than maintaining extensive off-chain state.

### Tradeoffs

* **Public disclosure of authorization data**: signed payloads are visible on-chain.
* **Service-theft risk via authorization reuse**: observers with access to the signed payload may attempt to reuse it to claim off-chain services, depending on application design.
* **Server custody or facilitation required**: the server or facilitator submits the transaction that consumes the signed payload.

These tradeoffs contrast with settlement models where the payer executes the transfer directly and proves payment by reference.

---

## Relationship to Schemes and Transports

* **Schemes** define the pricing and economic semantics of the payment (e.g., exact pricing).
* **Signed-Transfer Settlement** defines how the payment is executed and verified.
* **Transports** define how messages and payloads are exchanged.
* **Extensions** may add optional features layered on top of this settlement but MUST NOT alter its settlement semantics.

---

## Evolution

Signed-Transfer Settlement defines a settlement *class*, not a single chain implementation.

Future settlement mechanisms may differ in how signed payloads are interpreted (e.g., delegation-based mechanisms). Such mechanisms MUST be specified separately and MUST NOT be conflated with Signed-Transfer Settlement.

## Use Cases (Informative)

The following use cases illustrate scenarios where Signed-Transfer Settlement is a suitable choice due to its security and operational properties. These examples are informative and do not introduce additional requirements.

### Facilitator- or Server-Paid Gas Fees

Signed-Transfer Settlement is well-suited to scenarios in which the payer does not submit an on-chain transaction directly.

In this model:

* The payer signs a transfer payload off-chain.
* A server or facilitator submits the transaction that consumes the signed payload.
* The server or facilitator pays the associated transaction fees (e.g., gas).

This enables payment flows where:

* clients are not required to hold native gas tokens,
* transaction submission is centralized or batched,
* or fee sponsorship is used to improve user experience.

Protocol-level replay protection ensures that the signed payload cannot be reused to transfer funds more than once.

---

### Environments Requiring Protocol-Enforced Replay Protection

Signed-Transfer Settlement is appropriate when replay protection for fund movement must be enforced by the underlying blockchain rather than by application logic.

Examples include:

* systems where servers do not wish to maintain long-lived off-chain replay state,
* environments with multiple independent facilitators,
* or deployments where operational state loss must not risk duplicate fund transfers.

Because replay protection is enforced on-chain, servers can rely on the execution outcome rather than application-level idempotency.

---

### Facilitated Payment Submission Models

This settlement mechanism supports architectures in which:

* clients authorize payments,
* but do not control when or how transactions are submitted.

Such models may involve:

* batching or scheduling of transactions,
* routing through specialized infrastructure,
* or separation of authorization from execution for operational or compliance reasons.

Signed-Transfer Settlement ensures that the scope and limits of the transfer are fully defined by the signed payload, regardless of how or when the transaction is submitted.

---

### Public Verifiability of Payment Authorization

Signed-Transfer Settlement is suitable when it is acceptable or desirable for payment authorization data to be publicly verifiable on-chain.

This may be useful for:

* auditing or dispute resolution,
* third-party verification of payment execution,
* or environments where transparency of authorization is a feature rather than a liability.

Implementations should account for the fact that signed transfer payloads become publicly visible once submitted on-chain.


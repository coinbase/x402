# Glossary

Quick reference for x402 terminology.

### Client

Any entity making HTTP requests that may require payment—browsers, scripts, AI agents, or backend services.

### Resource Server

An HTTP server providing paid resources. It declares payment requirements and decides whether to fulfill requests based on payment verification.

### Facilitator

A service that handles payment verification and settlement on behalf of servers. Servers can verify and settle payments without running blockchain infrastructure themselves. See [Facilitator](core-concepts/facilitator.md) for details.

### Payment Payload

A signed data structure from the client containing all information needed to execute a payment. Encoded in Base64 and sent via the `PAYMENT-SIGNATURE` header.

### Verification

The process of checking whether a payment payload is valid before fulfilling a request. This includes signature validation, amount checks, and replay prevention.

### Settlement

Executing the actual payment on the blockchain. Once settled, funds move from the client's wallet to the server's designated address.

### Scheme

The payment mechanism used for a transaction. Currently supported:

* `exact` — fixed amount, pay-per-request
* `upto` — maximum amount with actual cost determined after work is done (coming soon)

### Replay

Reusing a previously submitted payment payload. The protocol prevents this through nonce tracking and expiration times.

### 402 Payment Required

The HTTP status code that signals a resource requires payment. The response includes payment details the client needs to construct a valid payment.

---

Next, explore:

* [HTTP 402](core-concepts/http-402.md) — how payment requirements are communicated
* [Client / Server](core-concepts/client-server.md) — roles and responsibilities
* [Facilitator](core-concepts/facilitator.md) — verification and settlement service

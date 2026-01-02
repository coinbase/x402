# Exact Payment Scheme for Solana Virtual Machine (SVM) (`exact`)

This document specifies the `exact` payment scheme for the x402 protocol on Solana.

The `exact` scheme defines **outcome-based payment semantics**: a client MUST effect an on-chain payment of an exact amount of a specified asset to a specified recipient.

How transaction fees are sponsored—and how the sponsoring party evaluates risk, limits cost, or constrains transaction structure—is intentionally separated from the payment semantics and described as a **Sponsor Acceptance Policy**. The sponsor MAY be the merchant itself or a third-party facilitator.

---

## Scheme Name

`exact`

---

## Terminology

- **Client**: The end user initiating the payment.
- **Merchant**: The resource server receiving payment, identified by `payTo`.
- **Sponsor**: The entity that signs the transaction as `feePayer`.  
  The sponsor MAY be:
  - the **merchant** itself, or
  - a **third-party facilitator**.
- **Fee Payer (`feePayer`)**: The Solana account of the Sponsor that pays transaction fees and provides the final required signature.

---

## Protocol Flow

The protocol flow for `exact` on Solana is client-driven.

1. Client makes a request to a Resource Server.
2. Resource Server responds with a payment required signal containing `PaymentRequired`. The `extra` field contains a `feePayer`, identifying the sponsor.
3. Client creates a transaction that effects a payment of an asset to the merchant for a specified amount.
4. Client signs the transaction, producing a partially signed transaction.
5. Client serializes the partially signed transaction as Base64.
6. Client sends a request to the Resource Server, submitting the transaction via `PaymentPayload` alongside the `PaymentRequirements`.
7. Resource Server forwards the payload to the Sponsor `/verify` endpoint.
8. Sponsor inspects the transaction.
9. Sponsor returns a `VerifyResponse` to the Resource Server.
10. Resource Server forwards the payload to the Sponsor `/settle`.
11. Sponsor signs as `feePayer` and submits the transaction to the network.
12. Upon settlement, a `SettlementResponse` is returned from the Sponsor to the Resource Server.
13. Resource Server grants the Client access to the resource in its response.

---

## PaymentRequirements for `exact`

In addition to the standard x402 `PaymentRequirements` fields, the `exact` scheme on Solana requires the following:

```json
{
  "scheme": "exact",
  "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  "amount": "1000",
  "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "payTo": "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4",
  "maxTimeoutSeconds": 60,
  "extra": {
    "feePayer": "EwWqGE4ZFKLofuestmU4LDdK7XM1N4ALgdZccwYugwGd"
  }
}
```
- **asset**: The public key of the token mint.
- **payTo**: The merchant’s public key.
- **extra.feePayer**: The sponsor’s public key. This MAY equal `payTo` (merchant-sponsored fees) or be a distinct third party.

## PaymentPayload `payload` Field

The `payload` field of the `PaymentPayload` contains:

```json
{
  "transaction": "AAAAAAAAAAAAA...AAAAAAAAAAAAA="
}
```

The `transaction` field contains the base64-encoded, serialized, **partially-signed** versioned Solana transaction.

Full `PaymentPayload` object:

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
    "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    "amount": "1000",
    "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "payTo": "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4",
    "maxTimeoutSeconds": 60,
    "extra": {
      "feePayer": "EwWqGE4ZFKLofuestmU4LDdK7XM1N4ALgdZccwYugwGd"
    }
  },
  "payload": {
    "transaction": "AAAAAAAAAAAAA...AAAAAAAAAAAAA="
  }
}
```

## `SettlementResponse`

The `SettlementResponse` for the exact scheme on Solana:

```json
{
  "success": true,
  "transaction": "base58 encoded transaction signature",
  "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  "payer": "base58 encoded public address of the transaction fee payer"
}
```

---

## 1. Exact Payment Outcome Definition (Normative)

A transaction satisfies the `exact` payment scheme **if and only if**, when executed on-chain, it produces the following outcome.

### 1.1 Required Payment Outcome (MUST)

The transaction MUST result in:

- A transfer of exactly `PaymentRequirements.amount`
- Of the asset identified by `PaymentRequirements.asset`
- To the recipient identified by `PaymentRequirements.payTo`
- Using one of:
  - `spl-token` `TransferChecked`
  - `token-2022` `TransferChecked`
  - Native SOL transfer (if `asset` denotes SOL, for future extensions)

The payment MUST be:

- **Exact** (no overpayment or underpayment)
- **Atomic** (no partial fulfillment)
- **Unconditional** (not dependent on post-transaction behavior)

### 1.2 Payment Identification (MUST)

A verifier MUST be able to deterministically identify the payment instruction and confirm:

- Correct mint
- Correct destination account (including ATA derivation)
- Correct amount
- Correct token program

The presence of additional instructions does not invalidate the payment, provided the required outcome is achieved.

### 1.3 Non-Prescriptive Structure (Explicit)

The `exact` scheme:

- DOES NOT prescribe a fixed instruction count
- DOES NOT require a fixed instruction order
- DOES NOT restrict additional instructions, provided the payment outcome is achieved

This ensures forward compatibility with wallet behavior, protocol evolution, and auxiliary instructions (e.g., compute budget, safety checks, memos).

---

## 2. Sponsor Acceptance Policy (Reference)

This section defines minimum required and recommended checks for any sponsor that signs as `feePayer` (merchant or third-party facilitator).

These rules concern sponsor safety and cost control, not payment validity.

A sponsor MAY reject transactions that satisfy the `exact` scheme but violate its local policy.

---

## 2.1 Minimal Safety Baseline (Normative MUSTs)

A sponsor that signs a transaction as `feePayer` MUST enforce all of the following.

### 2.1.1 Fee Payer Signer Scope (MUST)

The sponsor’s signature MUST be used only to authorize payment of transaction fees.

Concretely:

- The `feePayer` MUST NOT appear as a required signer (`isSigner = true`) in the account metadata of any instruction.
- The `feePayer` MUST NOT be used as an authority for any instruction.
- No instruction may rely on the `feePayer` signature to authorize state changes other than fee payment.

The `feePayer` MAY appear in instruction account lists as a **non-signer** (read-only or writable), including as the payment recipient when `feePayer == payTo`.

### 2.1.2 Fee Payer Fund Safety (MUST)

The sponsor MUST reject any transaction in which the sponsor’s funds could be debited beyond the network fee.

This includes transactions where:

- SOL could be transferred from an account controlled by the sponsor
- Tokens could be transferred from an account for which the sponsor is the authority
- Accounts owned by the sponsor could be closed, allocated, or reassigned in a way that moves lamports

Enforcing §2.1.1 is sufficient to prevent these conditions in standard Solana programs.

### 2.1.3 Signer Set Integrity (MUST)

The transaction MUST NOT require any additional signatures beyond:

- The client, and
- The sponsor (`feePayer`)

Additional signatures MAY be present but MUST NOT be required for transaction validity.

### 2.1.4 Exact Payment Verification (MUST)

The transaction MUST satisfy the **Exact Payment Outcome Definition** (§1).

---

## 2.2 Cost and Griefing Controls (Recommended SHOULDs)

The following controls are strongly recommended to mitigate gas griefing and denial-of-service risks.

### 2.2.1 Compute Budget Controls (SHOULD)

Sponsors SHOULD:

- Reject or override client-supplied `ComputeBudgetProgram` instructions
- Enforce maximum compute unit limits
- Enforce maximum compute unit price

### 2.2.2 Instruction Count Limits (SHOULD)

Sponsors SHOULD impose a maximum instruction count to bound execution cost.

### 2.2.3 Simulation-Based Rejection (SHOULD)

Sponsors SHOULD simulate the exact signed transaction and reject it if:

- Execution fails
- Compute usage exceeds configured limits
- Unexpected program behavior is observed

### 2.2.4 Program Allow/Deny Lists (SHOULD)

Sponsors SHOULD maintain allowlists for commonly accepted programs (e.g., token programs, ATA, compute budget).

Unknown or high-risk programs SHOULD be rejected or reviewed.

---

## 2.3 Policy Flexibility (Explicit)

- A transaction MAY be valid under the `exact` scheme while being rejected by a sponsor’s policy.
- Clients SHOULD NOT assume universal sponsorship for all valid `exact` transactions.

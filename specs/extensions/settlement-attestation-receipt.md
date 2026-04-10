# Extension: `settlement-attestation-receipt`

## Summary

The `settlement-attestation-receipt` extension closes the **delivery gap** in x402: after settlement, neither party holds a single artifact that binds payment proof to resource delivery. The existing `offer-receipt` extension proves that a server _issued_ a receipt, but does not commit to _what was delivered_ or _whether it matched the offer_.

A Settlement Attestation Receipt (SAR) is a signed object that binds three facts into one verifiable claim:

1. **Payment settled** — transaction hash and network.
2. **Resource delivered** — content hash or delivery descriptor.
3. **Terms matched** — the offer the client accepted.

This enables dispute resolution, automated SLA verification, and cross-agent trust without requiring either party to expose raw content or payment details to a third-party verifier.

---

## Motivation

### The gap today

| What exists | What it proves | What it does not prove |
|---|---|---|
| Blockchain tx hash | Funds moved | That the resource was delivered |
| `offer-receipt` receipt | Server acknowledges payment | That delivered content matches terms |
| HTTP 200 after payment | Server responded | That the response is the contracted resource |

In agent-to-agent commerce (the primary x402 use case), the paying agent needs a machine-verifiable artifact it can present to its principal (human or upstream agent) proving it got what it paid for. Conversely, the serving agent needs proof it delivered, in case of a dispute.

### Use cases

- **Agent accountability**: an orchestrating agent delegates a paid API call to a sub-agent. The SAR lets the orchestrator verify delivery without replaying the call.
- **SLA enforcement**: automated systems compare the SAR's `deliveredAt` against the offer's `validUntil` to detect timeout violations.
- **Audit trail**: compliance systems collect SARs as evidence of fulfilled commercial obligations.
- **Dispute resolution**: a verifier can check the SAR's `contentHash` against the actual response to determine whether the server delivered what it committed to.

---

## `PaymentRequired`

Server advertises SAR support in the payment requirements response:

```json
{
  "extensions": {
    "settlement-attestation-receipt": {
      "info": {
        "supported": true,
        "contentHashAlgorithm": "sha-256",
        "includesContentHash": true
      },
      "schema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "supported": { "type": "boolean" },
          "contentHashAlgorithm": {
            "type": "string",
            "enum": ["sha-256", "sha-384", "sha-512"]
          },
          "includesContentHash": { "type": "boolean" }
        },
        "required": ["supported"]
      }
    }
  }
}
```

---

## `PaymentPayload`

Client requests a SAR by echoing the extension:

```json
{
  "extensions": {
    "settlement-attestation-receipt": {
      "info": {
        "requested": true
      }
    }
  }
}
```

The client MAY omit this extension or set `requested: false`. The server MAY still return a SAR regardless, if it always produces them.

---

## SAR Object Shape

The SAR is returned in the `extensions` field of the successful response, alongside the response body.

```json
{
  "extensions": {
    "settlement-attestation-receipt": {
      "info": {
        "sar": {
          "format": "jws",
          "signature": "<JWS compact serialization>"
        }
      }
    }
  }
}
```

Or with EIP-712:

```json
{
  "extensions": {
    "settlement-attestation-receipt": {
      "info": {
        "sar": {
          "format": "eip712",
          "payload": { "...see below..." },
          "signature": "0x..."
        }
      }
    }
  }
}
```

---

## SAR Payload Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `version` | string | Yes | `"1"` |
| `resourceUrl` | string | Yes | The URL of the resource that was served |
| `network` | string | Yes | CAIP-2 network identifier (e.g., `eip155:8453`) |
| `transaction` | string | No | Settlement transaction hash |
| `payer` | string | Yes | Payer address or identifier |
| `contentHash` | string | Conditional | Hex-encoded hash of the response body. Required if server advertised `includesContentHash: true` |
| `contentHashAlgorithm` | string | Conditional | Hash algorithm used. Required when `contentHash` is present |
| `deliveryDescriptor` | string | No | Machine-readable delivery type (e.g., `"full"`, `"partial"`, `"streaming"`) |
| `deliveredAt` | string | Yes | ISO 8601 timestamp of delivery completion |
| `offerDigest` | string | No | Hash of the signed offer payload, if the `offer-receipt` extension was used. Links the SAR to the original terms |
| `metadata` | object | No | Arbitrary key-value pairs for domain-specific data |

---

## EIP-712 Type Definition

```javascript
{
  domain: {
    name: "x402 settlement attestation receipt",
    version: "1",
    chainId: 1
  },
  types: {
    SettlementAttestationReceipt: [
      { name: "version", type: "string" },
      { name: "resourceUrl", type: "string" },
      { name: "network", type: "string" },
      { name: "payer", type: "address" },
      { name: "contentHash", type: "string" },
      { name: "contentHashAlgorithm", type: "string" },
      { name: "deliveredAt", type: "string" },
      { name: "offerDigest", type: "string" }
    ]
  }
}
```

The `chainId` is hardcoded to `1` consistent with the `offer-receipt` extension convention: EIP-712 is used here as an off-chain signing format, not for on-chain submission. The actual payment network is identified by the `network` field.

---

## Verification

A verifier holding a SAR can confirm:

1. **Signature validity**: recover the signer from the SAR and confirm they are authorized to act for `resourceUrl`.
2. **Content integrity**: hash the received response body with `contentHashAlgorithm` and compare against `contentHash`.
3. **Settlement**: look up `transaction` on `network` to confirm funds transferred to the expected address.
4. **Terms compliance**: if `offerDigest` is present, compare it against the hash of the original signed offer to confirm the SAR references the agreed terms.

### Verification Matrix

| Check | Input | Against | Proves |
|---|---|---|---|
| Signature | SAR signature | Signer public key | Server authored this SAR |
| Content | Response body | `contentHash` | Delivered content matches attestation |
| Settlement | `transaction` | On-chain record | Payment executed |
| Terms | `offerDigest` | Signed offer hash | Delivery was for this specific deal |

---

## Interaction with `offer-receipt`

The `settlement-attestation-receipt` extension is designed to compose with — not replace — the `offer-receipt` extension.

| Artifact | Issued by | Proves | Timing |
|---|---|---|---|
| Signed Offer | Resource server | Server committed to terms | Before payment |
| Signed Receipt | Resource server | Server acknowledges payment | After settlement |
| SAR | Resource server | Delivery occurred and matched terms | After delivery |

When both extensions are present, the `offerDigest` field in the SAR SHOULD reference the hash of the signed offer payload, creating a cryptographic chain: **terms committed → payment settled → delivery attested**.

---

## Responsibilities

- **Resource server**: generates the SAR after completing delivery. MUST sign the SAR with a key authorized for `resourceUrl`. MUST include `contentHash` if advertised in `PaymentRequired`.
- **Facilitator**: no additional responsibilities. The facilitator is not involved in SAR generation or verification.
- **Client**: MAY request a SAR. SHOULD verify the SAR signature and content hash before considering the transaction complete. SHOULD store the SAR for dispute resolution.

---

## Security Considerations

- **Content hash scope**: the `contentHash` covers the response body only, not headers. Servers MUST NOT rely on headers for contractually significant content.
- **Replay**: a SAR is bound to a specific `transaction` and `resourceUrl`. Verifiers MUST check both fields to prevent cross-transaction replay.
- **Privacy**: `contentHash` is a one-way hash. It proves content integrity without revealing content to third-party verifiers. Servers concerned about metadata leakage MAY omit `transaction` (at the cost of weaker settlement proof).
- **Clock skew**: `deliveredAt` is server-attested. Verifiers relying on timing guarantees SHOULD cross-reference against block timestamps when `transaction` is provided.

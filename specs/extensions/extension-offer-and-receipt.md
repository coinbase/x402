# Offer and Receipt Extension

**1. Overview**

The Offer and Receipt Extension adds **server-side signatures** to x402, enabling:

1. **Signed offers**: the resource server can cryptographically commit to the payment terms it presents in `accepts[]`.
2. **Signed receipts**: after successful payment and service delivery, the resource server can return a signed receipt confirming the transaction.

This extension supports downstream use cases including:

- dispute evidence and auditability,
- user-review attestations (e.g., "I paid and received service"),
- verifiable proof of commercial interactions for reputation systems.

The signed offer and receipt payloads are **x402 version-agnostic** and work identically for both x402 v1 and v2.

**2. Status, Evolution, and Forward Compatibility**

This extension is specified as an optional, composable addition to x402. The x402 ecosystem may introduce additional extensions over time.

Accordingly:

- **Wire shape and field placement are not considered stable** and may change to align with x402 canonical extension architecture once standardized.
- **Behavioral requirements are stable**: the payload structures, signature formats, and verification rules in this document are normative and MUST be implemented as written, independent of serialization details.
- Implementers SHOULD design with forward compatibility in mind and SHOULD treat unknown extension-specific fields as unsupported rather than attempting best-effort interpretation.

**3. Signed Artifact Structure**

This extension defines exactly two signed artifacts:

1. **Offer** — attached to each `accepts[]` entry
2. **Receipt** — returned only on success

Both artifacts use the same top-level structure, differing only in their payload fields.

**3.1 Common Object Shape**

Both `offer` and `receipt` objects MUST have the following structure:

| Field       | Type   | Required     | Description                                 |
| ----------- | ------ | ------------ | ------------------------------------------- |
| `format`    | string | Yes          | `"eip712"` or `"jws"`                       |
| `payload`   | object | EIP-712 only | The canonical payload fields (omit for JWS) |
| `signature` | string | Yes          | The signature (format-specific encoding)    |

**3.1.1 Format-Specific Rules**

**When `format = "eip712"`:**
- `payload` is REQUIRED and contains the canonical payload fields
- `signature` is a hex-encoded ECDSA signature (`0x`-prefixed, 65 bytes: r+s+v)
- `network` MUST be `eip155:<chainId>` and `payTo` MUST be a valid EVM address

**When `format = "jws"`:**
- `payload` MUST be omitted (the JWS compact string already contains the payload)
- `signature` is a JWS Compact Serialization string (`header.payload.signature`)

The `payload` field is omitted for JWS to avoid duplication and ambiguity — the payload is already encoded inside the JWS compact string.

**3.2 EIP-712 Domain**

All EIP-712 signatures in this extension use the following domain structure:

```javascript
{
  name: "<artifact-specific name>",
  version: "1",
  chainId: <chainId from network>
}
```

Where `name` is:
- `"x402 offer"` for signed offers
- `"x402 receipt"` for receipts

When constructing the EIP-712 domain, `chainId` MUST be derived from the `network` field. For CAIP-2 identifiers of the form `eip155:<id>`, the numeric `<id>` value is used as the EIP-712 `chainId`.

**3.2.1 EIP-712 Schema Is Normative and Not Transmitted**

For `format = "eip712"`, the signing digest is computed using the EIP-712 domain, the message (the artifact payload), and the canonical `types` and `primaryType` defined in this specification.

- The canonical `types` and `primaryType` definitions MUST NOT be included in transmitted x402 messages (offers/receipts).
- Signers MUST use the canonical `types` and `primaryType` definitions from this specification when producing EIP-712 signatures.
- Verifiers MUST obtain and use the same canonical `types` and `primaryType` definitions from this specification when verifying EIP-712 signatures.
- Because EIP-712 hashes the schema into the signature, any change to the canonical `types` or `primaryType` constitutes a breaking change and MUST be accompanied by explicit versioning (e.g., bumping the EIP-712 domain `version` or publishing a new spec version).

> **Non-normative note:** Conceptually, EIP-712 maps to JWS as follows: `domain` ≈ signing context (like a header), `message` ≈ payload, `signature` ≈ signature. The EIP-712 schema (`types` and `primaryType`) is "implicit" only in the sense that it is not transmitted on the wire — it is not optional.

> **Interoperability note:** Some ecosystems represent EIP-712 signatures as `{ domain, message, signature }`. This extension transmits EIP-712 artifacts as `{ format, payload, signature }`, where `payload` corresponds to the EIP-712 `message`. Implementations may wrap or translate these fields for use in external proof or attestation formats.

**3.3 JWS Header Requirements**

For JWS format, the header MUST include:

| Field | Type   | Required | Description                                 |
| ----- | ------ | -------- | ------------------------------------------- |
| `alg` | string | Yes      | Signing algorithm (e.g., `ES256K`, `EdDSA`) |
| `kid` | string | Yes      | Key identifier (DID URL) for key lookup     |


**4. Signed Offer**

A signed offer is a cryptographic commitment by the resource server to the payment terms presented in an `accepts[]` entry.

**4.1 Placement**

Each entry in `accepts[]` MAY include an `offer` object:

```
accepts[i].offer
```

**4.2 Offer Payload Fields**

The canonical offer payload contains the following fields:

| Field               | Type   | Required                | Description                               |
| ------------------- | ------ | ----------------------- | ----------------------------------------- |
| `resourceUrl`       | string | Yes                     | The paid resource URL                     |
| `scheme`            | string | Yes                     | Payment scheme identifier (e.g., "exact") |
| `settlement`        | string | Yes (v2), Optional (v1) | Settlement type (e.g., "txid")            |
| `network`           | string | Yes                     | Blockchain network identifier             |
| `asset`             | string | Yes                     | Token contract address or "native"        |
| `payTo`             | string | Yes                     | Recipient wallet address                  |
| `amount`            | string | Yes                     | Required payment amount                   |
| `maxTimeoutSeconds` | number | Server optional         | Offer validity window in seconds          |
| `issuedAt`          | number | Server optional         | Unix timestamp when offer was created     |

**Note**: For x402 v1, servers copy `maxAmountRequired` to `amount` when constructing the offer payload.

**4.3 EIP-712 Types for Offer (Normative Schema)**

The following `types` and `primaryType` are the canonical EIP-712 schema for offers. Per §3.2.1, these definitions are used for signing and verification but MUST NOT be transmitted on the wire.

```javascript
{
  "primaryType": "Offer",
  "types": {
    "EIP712Domain": [
      { "name": "name", "type": "string" },
      { "name": "version", "type": "string" },
      { "name": "chainId", "type": "uint256" }
    ],
    "Offer": [
      { "name": "resourceUrl", "type": "string" },
      { "name": "scheme", "type": "string" },
      { "name": "settlement", "type": "string" },
      { "name": "network", "type": "string" },
      { "name": "asset", "type": "string" },
      { "name": "payTo", "type": "address" },
      { "name": "amount", "type": "string" },
      { "name": "maxTimeoutSeconds", "type": "uint256" },
      { "name": "issuedAt", "type": "uint256" }
    ]
  }
}
```

For optional fields (`maxTimeoutSeconds`, `issuedAt`), implementations MUST set unused fields to `0`. This rule applies only to EIP-712 signing, where fixed schemas require all fields to be present.

**4.4 Offer Examples**

**EIP-712 format:**

```json
{
  "offer": {
    "format": "eip712",
    "payload": {
      "resourceUrl": "https://api.example.com/premium-data",
      "scheme": "exact",
      "settlement": "txid",
      "network": "eip155:8453",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "amount": "10000",
      "maxTimeoutSeconds": 60,
      "issuedAt": 1703123456
    },
    "signature": "0x1234567890abcdef..."
  }
}
```

**JWS format:**

```json
{
  "offer": {
    "format": "jws",
    "signature": "eyJhbGciOiJFUzI1NksiLCJraWQiOiJkaWQ6d2ViOmFwaS5leGFtcGxlLmNvbSNrZXktMSJ9.eyJyZXNvdXJjZVVybCI6Imh0dHBzOi8vYXBpLmV4YW1wbGUuY29tL3ByZW1pdW0tZGF0YSJ9.sig"
  }
}
```

**4.5 Offer Verification**

**For EIP-712:**
1. Extract `offer.payload` and `offer.signature`
2. Construct the EIP-712 typed data hash using the domain (`name: "x402 offer"`, `version: "1"`, `chainId` from `payload.network`) and the types defined in §4.3. The `offer.payload` object MUST be used exactly as transmitted; verifiers MUST NOT reconstruct or infer payload fields from surrounding x402 context.
3. Recover the signer address from the signature
4. Confirm the signer is authorized to sign for the service identified by `payload.resourceUrl` (see §4.5.1)

**For JWS:**
1. Parse the JWS compact string from `offer.signature`
2. Extract `kid` from the JWS header
3. Resolve `kid` to a public key
4. Verify the JWS signature against the resolved public key
5. Confirm the key is authorized to sign for the service identified by the payload's `resourceUrl` (see §4.5.1)

**4.5.1 Signer Authorization**

Verifiers MUST confirm that the signing key is authorized to act on behalf of the service identified by `resourceUrl`. This specification does not mandate a specific authorization mechanism. Common approaches include:

- **`payTo` address signing**: The simplest approach — the service signs with the private key corresponding to the `payTo` address. Verifiers accept the signature if the recovered signer matches `payTo`.
- **External key registry**: An external system (e.g., DID documents, on-chain attestations, or other key binding mechanisms) maps the signing key or `kid` to the service identity.

**4.6 Offer Expiration**

If `issuedAt` and `maxTimeoutSeconds` are both present and non-zero, verifiers MAY reject offers where:

```
now > issuedAt + maxTimeoutSeconds
```


**5. Receipt**

A receipt is a signed statement returned by the resource server **only on success**, confirming that payment was received and service was delivered.

**5.1 Placement**

On success, the response MAY include a `receipt` object:

- **x402 v1**: `receipt`
- **x402 v2**: `extensions.receipt`

**5.2 Receipt Payload Fields**

The canonical receipt payload contains the following fields:

| Field         | Type   | Required | Description                                      |
| ------------- | ------ | -------- | ------------------------------------------------ |
| `resourceUrl` | string | Yes      | The paid resource URL                            |
| `payer`       | string | Yes      | Payer identifier (commonly a wallet address)     |
| `issuedAt`    | number | Yes      | Unix timestamp (seconds) when receipt was issued |

The receipt is **privacy-minimal** and intentionally omits transaction references and economic terms to reduce correlation risk.

**5.3 EIP-712 Types for Receipt (Normative Schema)**

The following `types` and `primaryType` are the canonical EIP-712 schema for receipts. Per §3.2.1, these definitions are used for signing and verification but MUST NOT be transmitted on the wire.

```javascript
{
  "primaryType": "Receipt",
  "types": {
    "EIP712Domain": [
      { "name": "name", "type": "string" },
      { "name": "version", "type": "string" },
      { "name": "chainId", "type": "uint256" }
    ],
    "Receipt": [
      { "name": "resourceUrl", "type": "string" },
      { "name": "payer", "type": "string" },
      { "name": "issuedAt", "type": "uint256" }
    ]
  }
}
```

**5.4 Receipt Examples**

**EIP-712 format:**

```json
{
  "receipt": {
    "format": "eip712",
    "payload": {
      "resourceUrl": "https://api.example.com/premium-data",
      "payer": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
      "issuedAt": 1703123456
    },
    "signature": "0x1234567890abcdef..."
  }
}
```

**JWS format:**

```json
{
  "receipt": {
    "format": "jws",
    "signature": "eyJhbGciOiJFUzI1NksiLCJraWQiOiJkaWQ6d2ViOmFwaS5leGFtcGxlLmNvbSNrZXktMSJ9.eyJyZXNvdXJjZVVybCI6Imh0dHBzOi8vYXBpLmV4YW1wbGUuY29tL3ByZW1pdW0tZGF0YSIsInBheWVyIjoiMHg4NTdiMDY1MTlFOTFlM0E1NDUzOGI5MWJEYmIwRTIyMzczZTM2YjY2IiwiaXNzdWVkQXQiOjE3MDMxMjM0NTZ9.sig"
  }
}
```

**5.5 Receipt Verification**

**For EIP-712:**
1. Extract `receipt.payload` and `receipt.signature`
2. Construct the EIP-712 typed data hash using the domain (`name: "x402 receipt"`, `version: "1"`, `chainId`) and the types defined in §5.3. The `receipt.payload` object MUST be used exactly as transmitted; verifiers MUST NOT reconstruct or infer payload fields from surrounding x402 context.
3. Recover the signer address from the signature
4. Confirm the signer is authorized to sign for the service identified by `payload.resourceUrl` (see §4.5.1)
5. Confirm `issuedAt` is within acceptable verifier policy

**For JWS:**
1. Parse the JWS compact string from `receipt.signature`
2. Extract `kid` from the JWS header; the receipt payload is obtained by base64url-decoding the JWS payload component
3. Resolve `kid` to a public key
4. Verify the JWS signature against the resolved public key
5. Confirm the key is authorized to sign for the service identified by the payload's `resourceUrl` (see §4.5.1)
6. Confirm `issuedAt` (from the JWS payload) is within acceptable verifier policy


**6. Protocol Integration Examples**

**6.1 Payment Requirements with Signed Offer (x402 v2)**

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://api.example.com/premium-data",
    "description": "Access to premium market data",
    "mimeType": "application/json"
  },
  "accepts": [
    {
      "scheme": "exact",
      "settlement": "txid",
      "network": "eip155:8453",
      "amount": "10000",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "maxTimeoutSeconds": 60,
      "offer": {
        "format": "eip712",
        "payload": {
          "resourceUrl": "https://api.example.com/premium-data",
          "scheme": "exact",
          "settlement": "txid",
          "network": "eip155:8453",
          "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
          "amount": "10000",
          "maxTimeoutSeconds": 60,
          "issuedAt": 1703123456
        },
        "signature": "0x1234567890abcdef..."
      }
    }
  ]
}
```

**6.2 Success Response with Receipt (x402 v2)**

```json
{
  "success": true,
  "extensions": {
    "receipt": {
      "format": "eip712",
      "payload": {
        "resourceUrl": "https://api.example.com/premium-data",
        "payer": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
        "issuedAt": 1703123456
      },
      "signature": "0x1234567890abcdef..."
    }
  }
}
```

**6.3 Success Response with Receipt (x402 v1)**

```json
{
  "success": true,
  "receipt": {
    "format": "eip712",
    "payload": {
      "resourceUrl": "https://api.example.com/premium-data",
      "payer": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
      "issuedAt": 1703123456
    },
    "signature": "0x1234567890abcdef..."
  }
}
```

**7. Key Discovery and Trust**

This extension does not mandate a specific trust system for mapping the server's signing key to an identity. See §4.5.1 for signer authorization options.

For EIP-712 signatures, the signer address is recovered from the signature. The simplest deployment uses the `payTo` address as the signing key.

For JWS signatures, the `kid` header field provides the key identifier for lookup.

**8. Use Cases (Non-Normative)**

This extension defines signed offers and signed receipts that can be carried alongside x402 flows. These artifacts are designed to be portable and independently verifiable, enabling optional trust and audit layers without changing payment execution or settlement semantics.

- **Attestation-backed discovery and trust for paid endpoints**: Signed offers and receipts can be embedded as evidence in attestations (e.g., user reviews). Those attestations can support discovery, filtering, and reputation scoring for paid API/service endpoints — an area that typically lacks the trust provided by user reviews in app stores and ecommerce sites.

- **Auditability and dispute/feedback evidence**: Signed artifacts provide verifiable evidence of what terms were presented and, when applicable, that service was delivered. This supports auditing, customer support, and dispute workflows, including scenarios involving automated purchasers (agents) and enterprise procurement.

- **Agent-to-agent commerce**: Autonomous agents making purchasing decisions need machine-verifiable proof of terms and delivery. Signed offers let an agent's principal (human or system) audit what deals the agent accepted; receipts prove the agent received the promised service.

- **Why offers matter even without receipts**: A signed offer can be used as evidence even when no receipt is available (e.g., the user did not complete payment, the service did not return a receipt, or the user wants to provide feedback about pricing/terms). Offers prove the server's stated terms at a point in time; receipts prove successful service delivery.

**9. Integration with Proof Systems**

The `offer` and `receipt` objects defined in this extension are designed to be usable as proof artifacts in attestation systems. These objects are intentionally self-contained so they can be lifted verbatim into external proof or attestation formats without reconstruction.

**10. Security Considerations**

- Implementations MUST ensure canonicalization rules are applied consistently (JCS for JWS payloads, EIP-712 rules for EIP-712).
- Servers MUST NOT include the `signature` field in the payload being signed to avoid circularity.
- Servers should consider replay implications of long-lived signed offers; including `issuedAt` and `maxTimeoutSeconds` can reduce risk.
- Receipts and offers are transferable artifacts; possession of a valid server signature is sufficient for verification. Transport-layer security (HTTPS) is essential.

**11. Privacy Considerations**

- Receipts are minimal by design — they omit settlement references and amounts to reduce correlation risk.
- Offers reveal economic terms (amount, asset, payTo address).
- Attestations MAY include either offers, receipts, or both.
- Implementations SHOULD consider privacy implications when deciding which artifacts to include in public attestations.

**12. Version History**

| Version | Date       | Changes                                     | Author                     |
| ------- | ---------- | ------------------------------------------- | -------------------------- |
| 0.1     | 2025-12-22 | Initial extension draft                     | Alfred Tom                 |

# TXID Payment Payload Specification

**1. Overview**

TXID is a payment payload type for x402 that enables payments using **any transferable asset on any blockchain**, without requiring the asset to implement a specialized "transfer-with-authorization" or permit interface.

In TXID settlement, the payer executes an on-chain transfer directly using the native transaction mechanics of the underlying network. The client then proves payment to the resource server by presenting:

- a **transaction reference** (`txRef`) identifying the on-chain transfer, and
- a **payer signature** demonstrating that the entity requesting the resource controls the account that funded the transaction.

This payment payload type allows x402 to support:

- tokens and native assets that do not implement standardized authorization-based transfer interfaces,
- non-EVM chains and heterogeneous execution environments,
- payment flows where the payer submits the transaction and pays network fees directly, including with the native token of the chain, although existing gas subsidy tools can still be used.

TXID settlement deliberately shifts responsibility from protocol-enforced guarantees to facilitator-side correctness. In exchange for supporting payments in any transferable asset on any chain, TXID requires facilitators to correctly implement additional verification and state-management logic. Unlike facilitated signed-transfer settlements—where replay protection for fund movement is enforced by on-chain mechanisms, TXID requires facilitators to enforce replay protection for **service delivery**. This includes:

- maintaining persistent state to de-duplicate accepted transaction references,
- aligning transaction acceptance rules with transaction-reference retention policies.

In return, TXID enables resource servers to accept payments for assets that do not support standardized authorization-based transfer interfaces, including:

- native assets of a chain (e.g. ETH),
- tokens without permit or transfer-with-authorization functionality.

**2. Payload Type Discriminator**

TXID payloads are identified by the `type` field within the `payload` object:

```
payload.type = "txid"
```

This explicit discriminator allows facilitators to route verification logic without inspecting payload shape or guessing based on field presence. The `scheme` field (e.g., `"exact"`) identifies the payment method family, while `payload.type` specifies the exact proof mechanism.

**3. Protocol Integration**

This section describes how TXID is represented within x402 message structures. TXID is compatible with both x402 v1 and v2 protocols.

**3.1 Payment Requirements (Server → Client)**

When a resource server requires payment via TXID, it responds with payment requirements containing TXID-specific fields.

**3.1.1 x402 v1 Payment Requirements Example**

```json
{
  "x402Version": 1,
  "error": "Payment required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:1",
      "maxAmountRequired": "10000",
      "asset": "native",
      "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "resource": "https://api.example.com/premium-data",
      "description": "Access to premium market data",
      "mimeType": "application/json",
      "outputSchema": null,
      "maxTimeoutSeconds": 60
    }
  ]
}
```

**3.1.2 x402 v2 Payment Requirements Example**

In v2, the resource information is separated into a top-level `resource` object, network identifiers use CAIP-2 format, and the amount field is renamed:

```json
{
  "x402Version": 2,
  "error": "Payment required",
  "resource": {
    "url": "https://api.example.com/premium-data",
    "description": "Access to premium market data",
    "mimeType": "application/json"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:1",
      "amount": "10000",
      "asset": "native",
      "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "maxTimeoutSeconds": 60
    }
  ],
  "extensions": {}
}
```

**3.1.3 TXID Payment Requirements Fields (v1)**

| Field Name          | Type     | Required | Description                                                              |
| ------------------- | -------- | -------- | ------------------------------------------------------------------------ |
| `scheme`            | `string` | Required | Payment scheme identifier (e.g., "exact")                                |
| `network`           | `string` | Required | Blockchain network identifier (e.g., "base-sepolia", "eip155:1")         |
| `maxAmountRequired` | `string` | Required | Required payment amount in atomic token units (e.g.- Wei or Lamport)     |
| `asset`             | `string` | Required | Token contract address, or "native" for the native token of "network"    |
| `payTo`             | `string` | Required | Recipient wallet address for the payment                                 |
| `resource`          | `string` | Required | URL of the protected resource                                            |
| `description`       | `string` | Required | Human-readable description of the resource                               |
| `mimeType`          | `string` | Optional | MIME type of the expected response                                       |
| `outputSchema`      | `object` | Optional | JSON schema describing the response format                               |
| `maxTimeoutSeconds` | `number` | Optional | Maximum time allowed for payment completion (payment offer expiration)   |
| `extra`             | `object` | Optional | Scheme-specific additional information                                   |

**3.1.4 TXID Payment Requirements Fields (v2 Differences)**

v2 uses the same fields as v1 with the following differences:

| Field Name          | Change                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `network`           | Uses CAIP-2 format (e.g., "eip155:84532") instead of human-readable identifiers             |
| `amount`            | Replaces `maxAmountRequired`                                                                |
| `resource`          | Moved to top-level `resource` object (not in each payment requirement)                      |
| `description`       | Moved to top-level `resource.description`                                                   |
| `mimeType`          | Moved to top-level `resource.mimeType`                                                      |
| `outputSchema`      | Removed from payment requirements                                                           |
| `maxTimeoutSeconds` | Now Required (was Optional in v1)                                                           |

**Note on `maxTimeoutSeconds`**: For TXID, `maxTimeoutSeconds` indicates the window during which the client can reasonably expect the quoted terms to remain valid.

**3.2 TXID Payment Payload (Client → Server)**

For TXID, the client returns a payment proof containing the transaction reference and a signature binding it to the payment terms.

**3.2.1 x402 v1**

**3.2.1.1 Payment Payload Fields (v1)**

| Field Name    | Type     | Required | Description                                                              |
| ------------- | -------- | -------- | ------------------------------------------------------------------------ |
| `x402Version` | `number` | Required | Protocol version identifier (1)                                          |
| `scheme`      | `string` | Required | Payment scheme identifier (e.g., "exact")                                |
| `network`     | `string` | Required | Blockchain network identifier (e.g., "base-sepolia", "eip155:1")         |
| `payload`     | `object` | Required | Payment proof object                                                     |

In v1, the client includes the `paymentRequirements` directly in the payment proof payload. This is the same object the resource server supplies to the facilitator `/verify` API. The field is named `offer` in the payload; this refers directly to the `paymentRequirements` object and does not introduce a new semantic layer.

The `payload` field for v1 contains:

| Field Name            | Type     | Required | Description                                                             |
| --------------------- | -------- | -------- | ----------------------------------------------------------------------- |
| `type`                | `string` | Required | Payload type discriminator (`"txid"`)                                   |
| `alg`                 | `string` | Required | Cryptographic algorithm used for signing (e.g., "ES256K", "Ed25519")    |
| `format`              | `string` | Required | Signing convention/serialization (e.g., "eip712", "solana-signmessage") |
| `txRef`               | `string` | Required | Transaction reference linking to the on-chain payment                   |
| `from`                | `string` | Required | Payer's wallet address                                                  |
| `offer`               | `object` | Required | The PaymentRequirements object as defined in Verify Request Example (v1)|
| `signature`           | `string` | Required | Serialized signature over `txRef` and `paymentRequirements`             |

The 'signature' field is the result of the 'from' private key signing the following object (see Signature Binding for encoding details):

```json
{
  "txRef": "<txRef>",
  "from": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
  "offer": { /* the paymentRequirements object */ }
}
```

**3.2.1.2 Payment Payload Example (v1)**

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "eip155:1",
  "payload": {
    "type": "txid",
    "alg": "ES256K",
    "format": "eip712",
    "txRef": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    "from": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
    "offer": {
      "scheme": "exact",
      "network": "eip155:1",
      "maxAmountRequired": "10000",
      "resource": "https://api.example.com/premium-data",
      "description": "Access to premium market data",
      "mimeType": "application/json",
      "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "maxTimeoutSeconds": 60,
      "asset": "native"
    },
    "signature": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef01"
  }
}
```

**3.2.2 x402 v2**

In v2, the payment proof payload is minimal—it contains only `txRef`, `from`, and `signature`. The `resource` and `accepted` fields are already present at the top level of the payment payload (per base x402 v2), so they are not duplicated inside the proof.

**3.2.2.1 Payment Payload Fields (v2 Differences)**

v2 restructures the payment payload with the following differences:

| Field Name    | Type     | Required | Description                                                              |
| ------------- | -------- | -------- | ------------------------------------------------------------------------ |
| `x402Version` | `number` | Required | Protocol version identifier (2)                                          |
| `resource`    | `object` | Required | Top-level object with `url`, `description`, `mimeType`                   |
| `accepted`    | `object` | Required | Top-level field echoing the chosen entry from `accepts[]`                |
| `payload`     | `object` | Required | Payment proof object                                                     |
| `extensions`  | `object` | Optional | New field for protocol extensions data                                   |

The `payload` field for v2 contains:

| Field Name            | Type     | Required | Description                                                             |
| --------------------- | -------- | -------- | ----------------------------------------------------------------------- |
| `type`                | `string` | Required | Payload type discriminator (`"txid"`)                                   |
| `alg`                 | `string` | Required | Cryptographic algorithm used for signing (e.g., "ES256K", "Ed25519")    |
| `format`              | `string` | Required | Signing convention/serialization (e.g., "eip712", "solana-signmessage") |
| `txRef`               | `string` | Required | Transaction reference linking to the on-chain payment                   |
| `from`                | `string` | Required | Payer's wallet address                                                  |
| `signature`           | `string` | Required | Serialized signature over `txRef` and `paymentRequirements`             |

The 'signature' field is the result of the 'from' private key signing the following object (see Signature Binding for encoding details):

```json
{
  "txRef": "<txRef>",
  "from": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
  "resource": { /* top-level resource object */ },
  "accepted": { /* top-level accepted object */ }
}
```

**3.2.2.2 Payment Payload Example (v2)**

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://api.example.com/premium-data",
    "description": "Access to premium market data",
    "mimeType": "application/json"
  },
  "accepted": {
    "scheme": "exact",
    "network": "eip155:1",
    "amount": "10000",
    "asset": "native",
    "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "maxTimeoutSeconds": 60
  },
  "payload": {
    "type": "txid",
    "alg": "ES256K",
    "format": "eip712",
    "txRef": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    "from": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
    "signature": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef01"
  },
  "extensions": {}
}
```

**3.3 Signature Binding**

For TXID, the client MUST include a payer signature that cryptographically commits to the transaction reference and the payment terms. The signing object differs between v1 and v2.

Including `from` in the signing object prevents identity substitution and ensures the signature is bound to the payer account referenced by the on-chain transaction.

**3.3.1 Supported Signature Formats**

The `format` field specifies how the signing object is encoded and signed. The required format is determined by the network's virtual machine type:

| Network Type | Required Format       | Required Algorithm |
| ------------ | --------------------- | ------------------ |
| EVM          | `eip712`              | `ES256K`           |
| Solana       | `solana-signmessage`  | `Ed25519`          |

Clients MUST use the format corresponding to the `network` specified in the payment requirements. Facilitators MUST reject payment proofs that use an incorrect format for the network.

**3.3.2 Canonicalization**

Implementations MUST use deterministic canonicalization when signing. The canonicalization method depends on the signing format:

| Format              | Canonicalization Method                                                |
| ------------------- | ---------------------------------------------------------------------- |
| `eip712`            | EIP-712 typed data encoding (native EIP-712 canonicalization)          |
| `solana-signmessage`| RFC 8785 (JCS) canonical JSON, then UTF-8 encode                       |

**Important**: EIP-712 provides its own deterministic canonicalization and domain separation. JSON canonicalization (RFC 8785 / JCS) MUST NOT be applied when using EIP-712. The two signing paths are distinct and MUST NOT be combined.

**3.3.2.1 EIP-712 (Ethereum Structured Data Signing)**

**Format identifier**: `"eip712"`

**Domain:**

```javascript
{
  name: "x402 Payment Proof",
  version: "1",
  chainId: <network chainId>
}
```

**Primary Type and Message Structure (v1):**

```javascript
{
  types: {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" }
    ],
    PaymentProof: [
      { name: "txRef", type: "string" },
      { name: "from", type: "address" },
      { name: "offer", type: "Offer" }
    ],
    Offer: [
      { name: "scheme", type: "string" },
      { name: "network", type: "string" },
      { name: "maxAmountRequired", type: "string" },
      { name: "asset", type: "string" },
      { name: "payTo", type: "address" },
      { name: "resource", type: "string" },
      { name: "description", type: "string" },
      { name: "mimeType", type: "string" },
      { name: "maxTimeoutSeconds", type: "uint256" }
    ]
  },
  primaryType: "PaymentProof",
  message: {
    txRef: "<txRef>",
    from: "<from address>",
    offer: { /* the offer object */ }
  }
}
```

**Primary Type and Message Structure (v2):**

```javascript
{
  types: {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" }
    ],
    PaymentProof: [
      { name: "txRef", type: "string" },
      { name: "from", type: "address" },
      { name: "resource", type: "Resource" },
      { name: "accepted", type: "Accepted" }
    ],
    Resource: [
      { name: "url", type: "string" },
      { name: "description", type: "string" },
      { name: "mimeType", type: "string" }
    ],
    Accepted: [
      { name: "scheme", type: "string" },
      { name: "network", type: "string" },
      { name: "amount", type: "string" },
      { name: "asset", type: "string" },
      { name: "payTo", type: "address" },
      { name: "maxTimeoutSeconds", type: "uint256" }
    ]
  },
  primaryType: "PaymentProof",
  message: {
    txRef: "<txRef>",
    from: "<from address>",
    resource: { /* top-level resource object */ },
    accepted: { /* top-level accepted object */ }
  }
}
```

**Signature encoding**: Hex-encoded ECDSA signature (0x-prefixed, 65 bytes: r + s + v)

**Verification**: Use EIP-712 typed data hashing and ECDSA signature verification. Support EIP-1271 for smart contract wallets.

**3.3.2.2 Solana signMessage (JCS-based)**

**Format identifier**: `"solana-signmessage"`

For non-EVM networks like Solana, the signing object is serialized as JSON, canonicalized using JCS (RFC 8785), and then signed.

**Encoding**: The signing object is serialized using JCS (RFC 8785) and UTF-8 encoded with a prefix:

```
x402 Payment Proof\n<JCS(signing object)>
```

**Signing object (v1):**
```json
{
  "txRef": "<txRef>",
  "from": "<from address>",
  "offer": { /* the offer/paymentRequirements object */ }
}
```

**Signing object (v2):**
```json
{
  "txRef": "<txRef>",
  "from": "<from address>",
  "resource": { /* top-level resource object */ },
  "accepted": { /* top-level accepted object */ }
}
```

**Signature encoding**: Base58-encoded Ed25519 signature (64 bytes)

**Verification**: Use Ed25519 signature verification with the public key derived from `from`.

Although the signing object is not transmitted verbatim, it is fully and deterministically derived from fields already present in the message, consistent with established protocol patterns such as EIP-712 and TLS transcript signing.

**3.3.3 Network Profiles and Future Direction**

TXID is designed to be network-agnostic. The core specification defines invariants that apply across all networks:

- `payload.type = "txid"` as the discriminator
- Signature binding of `txRef` to payment terms
- `txRef` reservation and consumption for replay protection
- Transfer validation against payment terms

The EVM and Solana specifics in sections 3.3.2.1 and 3.3.2.2 will be moved to separate network profile documents (e.g., `txid-evm.md`, `txid-solana.md`) as the specification matures. Future networks will require additional profile documents that define:

- The (network, format, alg) tuple for that network
- Field encoding rules (address formats, `txRef` canonicalization)
- Signature verification procedures
- Network-specific transaction resolution

This separation allows new networks to be supported without modifying core TXID semantics. Implementations MUST reject unsupported (network, format, alg) combinations.

**Note on `txRef`**: The `txRef` field is opaque to the core TXID specification. It must be uniquely resolvable given the `network` value, allowing the verifier to locate the on-chain transaction and extract the payer and transfer details. The exact format and canonicalization rules for `txRef` are defined by network profiles.

**Note on Resource Server Responsibility**: Resource servers SHOULD only advertise payment requirements for networks and payload types they can verify. The server determines which payment mechanisms it accepts, and MUST be confident in its ability to verify proofs for any (network, format, alg) combination it advertises in the `accepts` array.

**3.4 Payload Verification**

When a resource server receives a TXID payment proof from a client, it MUST perform the verification procedure (described below) before delivering the requested service. The resource server MAY implement this verification by interfacing with a **facilitator service** or MAY self-host the verification logic. x402 defines two REST APIs for facilitators and this section describes how these APIs can be used with TXID:

| Endpoint       | Purpose                                                                 | Required for TXID |
| -------------- | ----------------------------------------------------------------------- | ----------------- |
| `POST /verify` | Validates the payment proof                                             | **Required**      |
| `POST /settle` | Ensures payment transactions are finalized                              | No                |

**TXID vs EIP-3009**: Unlike EIP-3009 settlement—where the resource server calls both `/verify` (to validate the signature) and `/settle` (to execute the on-chain transfer)—TXID only requires `/verify`. The on-chain transfer has already been executed by the client, so there is no settlement transaction for the facilitator to submit. The `/settle` endpoint is available for resource servers that want explicit settlement tracking, but `/verify` alone is sufficient for TXID.

**3.4.1 POST /verify**

Verifies a TXID payment proof. The resource server calls this endpoint with both the payment payload (from the client) and the original payment requirements (that the server issued).

**3.4.1.1 Verify Request Example (v1)**

```json
{
  "paymentPayload": {
    "x402Version": 1,
    "scheme": "exact",
    "network": "eip155:1",
    "payload": {
      "type": "txid",
      "alg": "ES256K",
      "format": "eip712",
      "txRef": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "from": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
      "offer": {
        "scheme": "exact",
        "network": "eip155:1",
        "maxAmountRequired": "10000",
        "asset": "native",
        "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        "resource": "https://api.example.com/premium-data",
        "description": "Access to premium market data",
        "mimeType": "application/json",
        "maxTimeoutSeconds": 60
      },
      "signature": "0x1234567890abcdef..."
    }
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "eip155:1",
    "maxAmountRequired": "10000",
    "resource": "https://api.example.com/premium-data",
    "description": "Access to premium market data",
    "mimeType": "application/json",
    "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "maxTimeoutSeconds": 60,
    "asset": "native"
  }
}
```

**3.4.1.2 Verify Request Example (v2)**

```json
{
  "paymentPayload": {
    "x402Version": 2,
    "resource": {
      "url": "https://api.example.com/premium-data",
      "description": "Access to premium market data",
      "mimeType": "application/json"
    },
    "accepted": {
      "scheme": "exact",
      "network": "eip155:1",
      "amount": "10000",
      "asset": "native",
      "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "maxTimeoutSeconds": 60
    },
    "payload": {
      "type": "txid",
      "alg": "ES256K",
      "format": "eip712",
      "txRef": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "from": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
      "signature": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef01"
    }
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "eip155:1",
    "amount": "10000",
    "asset": "native",
    "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "maxTimeoutSeconds": 60
  }
}
```

**3.4.1.3 Verification Steps**

The verification implementation performs the following steps. The `paymentRequirements` object is provided by the resource server and represents the original payment terms.

1. **Reserve the txRef (atomic)**
   - Atomically attempt to reserve `paymentPayload.payload.txRef`
   - If `txRef` is already reserved or consumed, reject immediately
   - This MUST happen first to prevent race conditions where concurrent requests with the same proof could both proceed past this check
   - If any subsequent step fails, release the reservation

2. **Validate payload type**
   - `paymentPayload.payload.type` MUST be `"txid"`

3. **Validate signature format matches network**
   - `paymentPayload.payload.format` MUST be `eip712` for EVM networks, `solana-signmessage` for Solana
   - `paymentPayload.payload.alg` MUST be `ES256K` for EVM, `Ed25519` for Solana

4. **Construct the signing object**
   - **For v1**: Construct `{ "txRef": <txRef>, "from": <from>, "offer": <payload.offer> }`
   - **For v2**: Construct `{ "txRef": <txRef>, "from": <from>, "resource": <top-level resource>, "accepted": <top-level accepted> }`

5. **Verify the payment proof signature**
   - **For EVM (EIP-712)**: Encode the signing object as EIP-712 typed data (do NOT use JCS). Compute the EIP-712 hash. Use `ecrecover` with the hash and `paymentPayload.payload.signature` to recover the signer address. The recovered address MUST match `paymentPayload.payload.from`.
   - **For Solana (JCS-based)**: Canonicalize the signing object using JCS (RFC 8785), UTF-8 encode with prefix. Decode `paymentPayload.payload.from` to get the public key. Verify `paymentPayload.payload.signature` against the hash using `ed25519_verify`. Verification MUST succeed.

6. **Validate payment terms binding**
   - **For v1**: Compare `paymentPayload.payload.offer` against the `paymentRequirements` provided by the resource server
   - **For v2**: Compare the top-level `accepted` object against the payment requirements
   - Comparison is field-by-field for payment-relevant fields: `scheme`, `network`, `asset`, `payTo`, `amount`/`maxAmountRequired`, `maxTimeoutSeconds`
   - For v1, also compare: `resource`, `description`, `mimeType`
   - Unknown or additional fields in either object are ignored for forward compatibility
   - All compared fields MUST match exactly (case-sensitive string comparison)

7. **Fetch and validate the on-chain transaction**
   - Locate the transaction identified by `paymentPayload.payload.txRef`
   - Transaction MUST be confirmed to the required confirmation depth
   - Transaction payer/authority (e.g., `tx.from` on EVM, or the equivalent payer/authority account on other networks) MUST match `paymentPayload.payload.from`

8. **Validate the payment transfer against payment terms**
   - Transaction MUST have transferred at least the amount specified in `paymentRequirements.maxAmountRequired` (v1) or `accepted.amount` (v2)
   - Asset MUST match `paymentRequirements.asset` (v1) or `accepted.asset` (v2)
   - Transfer recipient MUST match `paymentRequirements.payTo` (v1) or `accepted.payTo` (v2)
   - Transaction timestamp MUST be within the retention window (see Replay and Idempotency Requirements)

9. **Mark txRef as consumed**
   - If all checks pass, mark the reserved `txRef` as permanently consumed
   - The `txRef` record is subject to the retention policy

TXID deliberately leaves finality determination to the resource server; implementations MUST define and apply a network-specific confirmation or finality policy before delivering service.

**3.4.1.4 /verify Response**

The facilitator /verify API MUST respond with either 'success' or 'error' depending on the verification result.

**Successful Response:**

```json
{
  "isValid": true,
  "payer": "0x857b06519E91e3A54538791bDbb0E22373e36b66"
}
```

**Error Response:**

```json
{
  "isValid": false,
  "invalidReason": "payment_not_found",
  "payer": "0x857b06519E91e3A54538791bDbb0E22373e36b66"
}
```

**3.4.2 POST /settle**

For TXID, the `/settle` endpoint is optional. The on-chain transaction has already been executed by the client, so there is no settlement transaction for the facilitator to submit.

Resource servers MAY implement `/settle` for TXID as an internal operation (e.g., logging, tracking prepaid balances, or finalizing service delivery), but it is not required since `/verify` is sufficient. For TXID, `/settle` MUST NOT broadcast or construct an on-chain transaction; it may only record or acknowledge a previously verified payment.

**3.5 Payment Payload Response**

After successful verification, the resource server delivers the requested resource to the client—the service or data the client paid for. The response format is defined by the resource server, not by this specification.

**Success example:**

```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "data": { ... }  // The actual resource content the client paid for
}
```

**Verification failure example:**

```
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "error": "payment_not_found",
  "accepts": [ ... ]  // Payment requirements for retry
}
```

TXID defines how payment verification works. Once payment is verified, the resource server delivers whatever service the client paid for according to the resource's own response format.

**4. TXID Properties**

TXID has the following defining properties:

- **Payer-executed on-chain transfer**
  The payer submits the on-chain transaction that moves funds.

- **Transaction-reference proof**
  The client proves payment by providing `txRef` and a payer signature proving that the resource requester controls the account that funded the transaction.

- **Facilitator verification (no facilitator-submitted transaction)**
  The facilitator verifies the payment proof and confirms the on-chain transaction, but does not submit a transaction. The resource server MAY self-host the facilitator.

- **Freshness via retention policy**
  Facilitators enforce transaction freshness through retention window policies and transaction timestamp checks, rather than cryptographically-bound quote windows.

- **Client Identity**
  The **payer** that actually funded the on-chain transfer referenced by `txRef` (i.e., the transaction sender or equivalent chain-specific payer/authority) also provides the payment proof signature. This essentially ties the identity of the client to the payer.

**5. Replay and Idempotency Requirements**

Because TXID relies on a transaction reference rather than a one-time on-chain authorization primitive, replay protection for **service delivery** is essential.

**5.1 Responsibility**

The **resource server** is ultimately responsible for ensuring correct payment verification before delivering service—it is the party providing the service and booking the revenue. The x402 specification integrates a facilitator service, but this delegation does not transfer responsibility. If the resource server uses a facilitator, it is responsible for choosing a trustworthy facilitator and ensuring the facilitator implements the required behavior correctly.

**5.2 Replay Scope and Consequences**

Replay of TXID payment proofs can only result in duplicate service delivery. Replay cannot cause additional fund transfers without payer consent—the on-chain transaction has already been executed and cannot be replayed on-chain.

**5.3 Required Behavior**

For the **exact** payment scheme (one payment = one service delivery), the verification implementation (whether self-hosted or via facilitator) MUST:

1. **De-duplicate by transaction reference**
   A given `txRef` MUST be accepted at most once for successful service authorization. Facilitators MUST track consumed `txRef` values and MUST reject reuse of `txRef` values. Facilitators MUST mark `txRef` as consumed before returning success.

2. **Enforce retention window**
   Define a retention window `T` (e.g., 1–24 hours) for storing consumed `txRef` values. The facilitator MUST reject any `txRef` whose on-chain timestamp is older than `T` relative to verification time.

**Note**: Other payment schemes (e.g., `deferred`, `prepaid`) may define different replay semantics where a single `txRef` can authorize multiple service deliveries by tracking and decrementing a balance. Such schemes are outside the scope of this specification.

**6. Transport Security**

TXID payment proofs MUST be transmitted over a secure, authenticated transport (e.g., HTTPS). Payment proofs MUST NOT be transmitted over cleartext or unauthenticated channels.

TXID's resistance to service theft relies on the payment proof remaining off-chain and private. Because TXID payment proofs are bearer-like at the application layer (a valid proof can be replayed unless the facilitator enforces idempotency), transport-layer security is essential.

**7. TXID Security Posture**

**7.1 Strengths**

- **Broad asset and chain support**: does not require specialized token contract interfaces.
- **No facilitator gas requirement**: payer submits the transaction and pays network fees.
- **Private proof delivery** (transport-protected): the payment proof is not inherently published on-chain as structured authorization data.
- **No additional fund transfer risk**: replay of payment proofs cannot cause additional fund transfers—only duplicate service delivery.

**7.2 Tradeoffs**

- **Facilitator-side replay risk for service delivery**: facilitators must implement `txRef` de-duplication and time-window enforcement.
- **Indexing/lookup dependency**: verification requires reliable access to chain transaction data and transfer parsing.
- **Proof format complexity**: multi-format signature verification introduces algorithm and canonicalization risks that must be constrained by whitelists and strict encoding rules.

**7.3 Responsibility and Risk**

TXID security depends on correct facilitator implementation. Facilitators choose their own risk tolerance for reorgs, replay windows, and storage duration. Incorrect implementation can cause duplicate service delivery but cannot cause unauthorized fund transfers.

**8. Use Cases (Informative)**

TXID addresses several important use cases that are difficult or impossible with authorization-based settlement mechanisms like EIP-3009.

**8.1 Economically Truthful Payment Model**

With EIP-3009 settlement, the facilitator submits the on-chain transaction and pays gas fees—even though the facilitator typically does not receive the payment revenue. This creates an economic mismatch where facilitators must subsidize gas costs or pass them on indirectly.

TXID eliminates this mismatch: the payer submits the transaction and pays gas directly. The facilitator only performs verification, which requires no on-chain transaction and no gas expenditure. This aligns costs with the party who benefits from the service.

**8.2 Native Token Payments**

TXID allows payers to use native tokens (ETH, SOL, etc.) to pay for both:
- the x402 service itself, and
- the gas/transaction fees required to execute the payment.

With EIP-3009, payments are limited to tokens that implement the `transferWithAuthorization` interface. Native tokens cannot be used. TXID removes this limitation, enabling payments in any transferable asset.

**8.3 Token Utility and Ecosystem Support**

TXID enables any token to be used for x402 payments, bringing additional utility and demand to tokens that may not have EIP-3009 support. This is particularly valuable for:
- tokens that fund decentralized projects or DAOs,
- community tokens that want to enable real-world utility,
- newer tokens that haven't implemented authorization-based transfer interfaces.

For example, a project like OMA3 (the author of this specification) would be able to accept x402 payments in the native token of its OMAChain Ethereum rollup.

**8.4 Simplified Multi-Chain Support**

With authorization-based settlement, each blockchain/VM requires a specific signed-transfer standard (EIP-3009 for EVM, SPL Token extensions for Solana, etc.). Resource servers must implement and maintain verification logic for each standard.

TXID simplifies multi-chain support: the core verification logic (signature verification + on-chain transaction lookup) follows the same pattern across chains. Resource servers can more easily support a wide range of VMs without requiring each chain to implement a specific authorization-based transfer mechanism.

**9. Version History**

| Version | Date       | Changes                                                                 | Author     |
| ------- | ---------- | ----------------------------------------------------------------------- | ---------- |
| v0.1    | 2025-12-18 | Initial draft                                                           | Alfred Tom |

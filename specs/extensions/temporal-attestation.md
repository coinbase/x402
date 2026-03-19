# Extension: `temporal-attestation` (Draft)

## 1. Summary
The `temporal-attestation` extension provides a standardized mechanism for providing cryptographically verifiable timestamps within x402 payment flows. It enables deterministic settlement ordering, prevents multi-resource replay attacks, and ensures protocol integrity in high-latency environments.

## 2. Motivation
The current x402 protocol lacks a canonical temporal anchor, leading to:
- **Settlement Ambiguity (#1645)**: No deterministic way to order concurrent payments.
- **Clock Skew Failures (#1062)**: 40% failure rates when local clocks drift.
- **Replay Vulnerabilities (#1632)**: Payloads can be replayed within the `maxTimeoutSeconds` window.

## 3. Specification

### 3.1. PaymentRequired Signaling
A Resource Server supporting this extension **MUST** include the `temporal-attestation` object in the `extensions` field of a 402 response.

```json
{
  "info": {
    "required": true,
    "minSources": 2,
    "maxDriftMs": 5000
  },
  "schema": { ... }
}
```

### 3.2. PaymentPayload Requirements
The Client **MUST** append the following fields to the `temporal-attestation` extension:
- `timestampMs`: Integer. Unix epoch in milliseconds.
- `nonce`: String. Cryptographically random hex (32+ chars).
- `hmac`: String. HMAC-SHA256(Key, Binding_Data).
- `sources`: Array of Strings. Identifiers of queried time sources.

### 3.3. Key Derivation and Binding
The HMAC key **MUST** be derived from the client's payment signing key using HKDF-SHA256:
`HMAC_KEY = HKDF-Expand(HKDF-Extract(salt="x402-v1", IKM=signing_key), info="temporal-binding", L=32)`

The binding data **MUST** follow this format:
`timestampMs || nonce || resource.url || network || amount`

## 4. Verification Logic
The Facilitator **MUST** perform the following checks:
1. **Drift Check**: `|Server_Time - timestampMs| <= maxDriftMs`. Fail with 400 Bad Request if exceeded.
2. **Replay Check**: `(nonce, timestampMs)` tuple **MUST NOT** have been seen before. Fail with 409 Conflict if seen.
3. **HMAC Validation**: Reconstruct binding data and verify HMAC. Fail with 401 Unauthorized if mismatch.

## 5. Reference Implementation
- **NPM**: `openttt`
- **Live Demo**: https://helm-protocol.github.io/x402-openttt/demo/

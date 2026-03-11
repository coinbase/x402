# Extension: `kya` (Know Your Agent)

## Summary

The `kya` extension enables x402-protected resources to verify the identity and attestations of AI agents accessing their services. This extension supports agent identity verification through cryptographically signed JWT tokens containing selective disclosure proofs and attestation pointers, enabling strong agent authentication and compliance with regulatory requirements.

This is a **Server ↔ Client** extension. The Facilitator is not involved in the agent identity verification flow, but may optionally reference KYA data for enhanced payment security.

## Background

As AI agents become autonomous participants in the digital economy, services need reliable ways to:

- Verify that they're dealing with legitimate agents rather than malicious bots
- Confirm agent identity and delegation chains for regulatory compliance
- Validate specific claims about agent capabilities or permissions
- Maintain audit trails for agent interactions and payments

The KYA extension provides a standardized way to attach agent identity proofs to x402 payment requests, enabling services to implement "know your customer" style verification for autonomous agents.

## PaymentRequired

A Server advertises KYA support by including the `kya` key in the `extensions` object of the `402 Payment Required` response.

```json
{
  "x402Version": "2",
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "amount": "10000",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "maxTimeoutSeconds": 60,
      "extra": {
        "name": "USDC",
        "version": "2"
      }
    }
  ],
  "extensions": {
    "kya": {
      "info": {
        "domain": "api.example.com",
        "resource": "/premium-data",
        "nonce": "b7e9a3c8f1d42567890abcdef1234567",
        "issuedAt": "2024-01-15T10:30:00.000Z",
        "expirationTime": "2024-01-15T10:35:00.000Z",
        "purpose": "agent identity verification for premium data access"
      },
      "requirements": {
        "proofTypes": ["personhood", "delegation"],
        "attestationSchemas": [
          {
            "schema": "https://schema.org/Person",
            "issuer": "coinbase.com",
            "required": true
          },
          {
            "schema": "https://example.com/schemas/agent-delegation",
            "issuer": "*",
            "required": false
          }
        ],
        "maxDelegationDepth": 3,
        "allowedJurisdictions": ["US", "CA", "EU"],
        "minTrustScore": 75
      },
      "schema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "domain": {"type": "string"},
          "resource": {"type": "string"},
          "nonce": {"type": "string"},
          "issuedAt": {"type": "string", "format": "date-time"},
          "expirationTime": {"type": "string", "format": "date-time"},
          "purpose": {"type": "string"},
          "agentIdentity": {
            "type": "object",
            "properties": {
              "agentId": {"type": "string"},
              "walletAddress": {"type": "string"},
              "proofBundle": {"type": "string"},
              "claims": {"type": "array"},
              "attestations": {"type": "array"},
              "delegationChain": {"type": "array"}
            },
            "required": ["agentId", "proofBundle"]
          }
        },
        "required": [
          "domain",
          "resource", 
          "nonce",
          "issuedAt",
          "agentIdentity"
        ]
      }
    }
  }
}
```

### Requirements Object

Servers specify their identity verification requirements:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `proofTypes` | `string[]` | Required | Types of proofs required: `"personhood"`, `"delegation"`, `"capability"`, `"jurisdiction"` |
| `attestationSchemas` | `object[]` | Optional | Specific attestation schemas required |
| `maxDelegationDepth` | `number` | Optional | Maximum allowed delegation chain depth (default: 5) |
| `allowedJurisdictions` | `string[]` | Optional | ISO 3166-1 alpha-2 country codes where agent operation is allowed |
| `minTrustScore` | `number` | Optional | Minimum required trust score (0-100, default: 0) |

Each `attestationSchemas` entry contains:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schema` | `string` | Required | URI of the required attestation schema |
| `issuer` | `string` | Required | Required issuer domain or `"*"` for any trusted issuer |
| `required` | `boolean` | Required | Whether this attestation is mandatory |

---

## Client Request

To provide agent identity verification, the Client includes a JWT proof bundle in the `KYA` HTTP header.

```http
GET /premium-data HTTP/1.1
Host: api.example.com
KYA: eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImFnZW50LWtleSJ9.eyJkb21haW4iOiJhcGkuZXhhbXBsZS5jb20iLCJyZXNvdXJjZSI6Ii9wcmVtaXVtLWRhdGEiLCJub25jZSI6ImI3ZTlhM2M4ZjFkNDI1Njc4OTBhYmNkZWYxMjM0NTY3IiwiaXNzdWVkQXQiOiIyMDI0LTAxLTE1VDEwOjMwOjAwLjAwMFoiLCJwdXJwb3NlIjoiYWdlbnQgaWRlbnRpdHkgdmVyaWZpY2F0aW9uIGZvciBwcmVtaXVtIGRhdGEgYWNjZXNzIiwiYWdlbnRJZGVudGl0eSI6eyJhZ2VudElkIjoiYWdlbnQtNzg5YWJjZGVmIiwid2FsbGV0QWRkcmVzcyI6IjB4ODU3YjA2NTE5RTkxZTNBNTQ1Mzg3OTFiRGJiMEUyMjM3M2UzNmI2NiIsInByb29mQnVuZGxlIjoiZXlKaGJHY2lPaUpTVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5Li4uIiwiY2xhaW1zIjpbeyJ0eXBlIjoibmF0aW9uYWxpdHkiLCJ2YWx1ZSI6IlVTIiwicHJvb2YiOiIuLi4ifV0sImF0dGVzdGF0aW9ucyI6W3siaXNzdWVyIjoiY29pbmJhc2UuY29tIiwic2NoZW1hIjoiaHR0cHM6Ly9zY2hlbWEub3JnL1BlcnNvbiIsImhhc2giOiIweDEyMzQ1Njc4OTBhYmNkZWYifV0sImRlbGVnYXRpb25DaGFpbiI6W3siZnJvbSI6IjB4aHVtYW4xMjM0NSIsInRvIjoiYWdlbnQtNzg5YWJjZGVmIiwicHVycG9zZSI6InRyYWRpbmciLCJzaWduYXR1cmUiOiIweDU2Nzg5MGFiY2RlZiJ9XX19
```

The JWT payload contains:

```json
{
  "domain": "api.example.com",
  "resource": "/premium-data",
  "nonce": "b7e9a3c8f1d42567890abcdef1234567",
  "issuedAt": "2024-01-15T10:30:00.000Z",
  "purpose": "agent identity verification for premium data access",
  "agentIdentity": {
    "agentId": "agent-789abcdef",
    "walletAddress": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
    "proofBundle": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "claims": [
      {
        "type": "nationality",
        "value": "US",
        "proof": "..."
      }
    ],
    "attestations": [
      {
        "issuer": "coinbase.com",
        "schema": "https://schema.org/Person",
        "hash": "0x1234567890abcdef"
      }
    ],
    "delegationChain": [
      {
        "from": "0xhuman12345",
        "to": "agent-789abcdef",
        "purpose": "trading",
        "signature": "0x567890abcdef"
      }
    ]
  }
}
```

---

## Agent Identity Object

The `agentIdentity` object contains comprehensive identity information for the agent:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `agentId` | `string` | Required | Unique identifier for the agent |
| `walletAddress` | `string` | Optional | Agent's wallet address for payment correlation |
| `proofBundle` | `string` | Required | JWT containing cryptographic proofs and Merkle tree attestations |
| `claims` | `object[]` | Optional | Array of selective disclosure claims |
| `attestations` | `object[]` | Optional | Array of attestation references |
| `delegationChain` | `object[]` | Optional | Chain of delegation from human to agent |

### Claims Array

Each claim in the `claims` array contains:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | `string` | Required | Type of claim: `"nationality"`, `"personhood"`, `"capability"`, etc. |
| `value` | `string` | Required | The claimed value |
| `proof` | `string` | Required | Cryptographic proof of the claim (Merkle proof path) |

### Attestations Array

Each attestation in the `attestations` array contains:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `issuer` | `string` | Required | Domain of the attestation issuer |
| `schema` | `string` | Required | URI of the attestation schema |
| `hash` | `string` | Required | Hash of the attestation on-chain |

### Delegation Chain Array

Each delegation in the `delegationChain` array contains:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `from` | `string` | Required | Address/identifier of the delegating entity |
| `to` | `string` | Required | Address/identifier of the delegate (agent) |
| `purpose` | `string` | Required | Purpose of the delegation |
| `signature` | `string` | Required | Cryptographic signature authorizing delegation |
| `expiresAt` | `string` | Optional | ISO 8601 expiration timestamp |

---

## Proof Bundle Format

The `proofBundle` is a JWT containing:

### Header
```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "agent-key-123"
}
```

### Payload
```json
{
  "iss": "agent-789abcdef",
  "aud": "api.example.com",
  "iat": 1640995800,
  "exp": 1640999400,
  "merkleRoot": "0xabcdef1234567890",
  "proofs": [
    {
      "claim": "nationality=US",
      "path": ["0x123", "0x456", "0x789"],
      "leaf": "0xabc"
    }
  ],
  "attestationPointers": [
    {
      "schema": "https://schema.org/Person",
      "issuer": "coinbase.com",
      "blockchainRef": {
        "network": "eip155:1",
        "contract": "0xAttestationContract",
        "tokenId": "12345"
      }
    }
  ]
}
```

---

## Verification Logic

When the Server receives a request with the `KYA` header:

### 1. Parse and Validate JWT

- Decode the JWT and verify its signature using the agent's public key
- Verify `aud` matches the server's domain
- Verify `exp` is in the future and `iat` is recent

### 2. Validate Claims

For each claim in the proof bundle:
- Verify the Merkle proof path against the root hash
- Check that required claim types are present
- Validate claim values against server requirements

### 3. Verify Attestations

For each attestation pointer:
- Query the referenced blockchain contract
- Verify the attestation exists and is valid
- Check that the issuer is trusted for the schema
- Validate attestation has not been revoked

### 4. Validate Delegation Chain

For each delegation in the chain:
- Verify the signature of the delegation authorization
- Check that the delegation has not expired
- Ensure the delegation chain depth is within limits
- Verify the final delegate matches the agent making the request

### 5. Calculate Trust Score

Based on:
- Number and quality of attestations
- Delegation chain integrity
- Claim verification results
- Issuer reputation scores

### 6. Apply Business Logic

- Check if the agent meets minimum requirements
- Verify jurisdiction compliance
- Apply any custom verification rules

---

## Example Integration: ProofPack

This extension is designed to work seamlessly with libraries like [ProofPack](https://github.com/zipwireapp/ProofPack):

```typescript
import { ProofPack } from 'proofpack';

// Server generates challenge
const challenge = {
  domain: 'api.example.com',
  resource: '/premium-data',
  nonce: generateNonce(),
  requirements: {
    proofTypes: ['personhood'],
    attestationSchemas: [{
      schema: 'https://schema.org/Person',
      issuer: 'coinbase.com',
      required: true
    }]
  }
};

// Agent creates proof bundle
const proofPack = new ProofPack();
const bundle = await proofPack.createBundle({
  claims: ['nationality=US'],
  attestations: agentAttestations,
  privateKey: agentPrivateKey
});

// Agent sends request with KYA header
const kyaJWT = jwt.sign({
  ...challenge,
  agentIdentity: {
    agentId: 'agent-123',
    walletAddress: agentWallet,
    proofBundle: bundle,
    // ...
  }
}, agentPrivateKey);

// Server verifies the proof bundle
const verified = await proofPack.verify(kyaJWT);
```

---

## Security Considerations

### Replay Protection
- **Nonce Uniqueness**: Each challenge MUST have a unique nonce
- **Temporal Bounds**: JWT expiration prevents replay attacks
- **Domain Binding**: Proofs are bound to specific domains

### Delegation Security
- **Signature Verification**: All delegations must be cryptographically signed
- **Expiration Enforcement**: Expired delegations are automatically invalid
- **Chain Validation**: Each step in the delegation chain is verified

### Attestation Integrity
- **On-Chain Verification**: Attestations are verified against blockchain state
- **Issuer Validation**: Only trusted issuers are accepted
- **Revocation Checking**: Revoked attestations are rejected

### Privacy Protection
- **Selective Disclosure**: Agents only reveal necessary claims
- **Zero-Knowledge Proofs**: Minimize information exposure
- **Off-Chain Storage**: Sensitive data stays off public ledgers

---

## Use Cases

### Regulatory Compliance
- KYC/AML verification for financial services
- Age verification for restricted content
- Jurisdiction compliance for geo-blocked services

### Agent Authentication
- Proof of human delegation for autonomous trading
- Capability verification for specialized APIs
- Identity correlation across multiple services

### Trust and Safety
- Bot detection and prevention
- Reputation system integration
- Fraud prevention for high-value transactions

---

## References

- [ProofPack Library](https://github.com/zipwireapp/ProofPack)
- [CAIP-122: Sign-In With X](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-122.md)
- [RFC 7519: JSON Web Token (JWT)](https://tools.ietf.org/html/rfc7519)
- [Selective Disclosure for JWTs](https://datatracker.ietf.org/doc/draft-ietf-oauth-selective-disclosure-jwt/)
- [Core x402 Specification](../x402-specification-v2.md)
- [x402 Extensions Overview](../README.md#extensions)
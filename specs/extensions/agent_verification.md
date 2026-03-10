# Extension: `agent-verification`

## Summary

The `agent-verification` extension enables cryptographically verifiable agent identity and authorization claims for x402-protected resources through the `X-AGENT-VERIFICATION` HTTP header. This extension supports Know Your Agent (KYA) scenarios where services need to verify agent identity, delegation chains, compliance status, or reputation while maintaining privacy through selective disclosure.

This is a **Server ↔ Client** extension designed to work independently of traditional `Authorization` headers, enabling both agent verification and application-level authentication in the same request.

## Motivation

AI agents increasingly need to prove their authorization, identity, and compliance status when accessing protected resources. Traditional approaches either rely on custodial identity providers or require sharing complete identity documents. This extension enables:

- **Agent Delegation Verification**: Cryptographically proving an AI agent is authorized to act on behalf of a human
- **Selective Identity Disclosure**: Revealing only required claims (e.g., nationality, jurisdiction) while keeping other data private  
- **Compliance Verification**: Demonstrating agents meet regulatory requirements without exposing sensitive details
- **Reputation Systems**: Presenting trust scores and historical attestations from multiple sources
- **Non-Custodial Verification**: Enabling verification without relying on centralized identity providers

## PaymentRequired

A Server advertises agent verification support by including the `agent-verification` key in the `extensions` object of the `402 Payment Required` response.

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
    "agent-verification": {
      "requiredClaims": ["delegation", "nationality"],
      "acceptedFormats": ["proofpack-jws", "eas-attestation"],
      "supportedNetworks": ["base-sepolia", "base-mainnet"],
      "maxAge": 3600,
      "replayWindow": 300,
      "trustedAttesters": [
        "0x1234567890123456789012345678901234567890",
        "0x0987654321098765432109876543210987654321"
      ],
      "requiredSchemas": [
        "0x0000000000000000000000000000000000000000000000000000000000000001"
      ]
    }
  }
}
```

### Extension Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `requiredClaims` | `string[]` | Yes | Array of required identity claims (e.g., "delegation", "nationality", "compliance") |
| `acceptedFormats` | `string[]` | Yes | Supported verification formats ("proofpack-jws", "eas-attestation", "custom") |
| `supportedNetworks` | `string[]` | Yes | Blockchain networks where attestations will be verified |
| `maxAge` | `number` | No | Maximum age of verification tokens in seconds (default: 3600) |
| `replayWindow` | `number` | No | Nonce replay protection window in seconds (default: 300) |
| `trustedAttesters` | `string[]` | No | Wallet addresses of trusted attestation sources |
| `requiredSchemas` | `string[]` | No | Required EAS schema UIDs for attestation verification |

## Client Request

Clients include agent verification credentials in the `X-AGENT-VERIFICATION` HTTP header alongside their payment signature.

### ProofPack JWS Format

```http
POST /premium-data HTTP/1.1
Host: api.example.com
X-AGENT-VERIFICATION: eyJhbGciOiJFUzI1NksiLCJ0eXAiOiJKV1QiLCJjdHkiOiJhcHBsaWNhdGlvbi9hdHRlc3RlZC1tZXJrbGUtZXhjaGFuZ2UranNvbiJ9.eyJtZXJrbGVUcmVlIjp7ImhlYWRlciI6eyJ0eXAiOiJhcHBsaWNhdGlvbi9tZXJrbGUtZXhjaGFuZ2UtMy4wK2pzb24ifSwibGVhdmVzIjpbeyJkYXRhIjoiMHg3YjIyNGU2MTc0Njk2Zjc0NjE2Yzc5NzQ3OTIyM2EyMjQ3NDIyMjdkIiwic2FsdCI6IjB4NTY4YmRlYzhmYjRhOGM2ODljNmM4ZjkzZmIxNjg1NGMiLCJoYXNoIjoiMHhhMWU5Yzk0ZWI2ZTI1MjhjMjY3MmM3MmYzNWNjODExZGQ3OWExMDU1ZDFjMTUyZmM5OGNiOTM4OGY4ZjAwMjQ5IiwiY29udGVudFR5cGUiOiJhcHBsaWNhdGlvbi9qc29uO2NoYXJzZXQ9dXRmLTg7ZW5jb2Rpbmc9aGV4In0seyJkYXRhIjoiMHg3YjIyNjQ2NTZjNjU2NzY0NzQ2NTIyM2EyMjc0NzI3NTY1MjIzMDFkIiwic2FsdCI6IjB4MjRjMjk0ODg2MDViMDBlNjQxMzI2ZjYxMDAyODQyNDEiLCJoYXNoIjoiMHgxYjNiY2NjNTc3NjMzYzU0YzBhZWFkMDBiYWUyZDdkZGI4YTI1ZmQ5M2U0YWMyZTJlMGIzNmI5ZDE1NGYzMGI5IiwiY29udGVudFR5cGUiOiJhcHBsaWNhdGlvbi9qc29uO2NoYXJzZXQ9dXRmLTg7ZW5jb2Rpbmc9aGV4In1dLCJyb290IjoiMHgxMzE2ZmMwZjNkNzY5ODhjYjRmNjYwYmRmOTdmZmY3MGRmN2JmOTBhNWZmMzQyZmZjM2JhYTA5ZWQzYzI4MGU1In0sImF0dGVzdGF0aW9uIjp7ImVhcyI6eyJuZXR3b3JrIjoiYmFzZS1zZXBvbGlhIiwiYXR0ZXN0YXRpb25VaWQiOiIweDI3ZTA4MmZjYWQ1MTdkYjRiMjgwMzlhMWY4OWQ3NjM4MTkwNWY2Zjg2MDViZTc1MzcwMDhkZWIwMDJmNTg1ZWYiLCJmcm9tIjoiMHgxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwIiwidG8iOiIweDg1N2IwNjUxOUU5MWUzQTU0NTM4NzkxYkRiYjBFMjIzNzNlMzZiNjYiLCJzY2hlbWEiOnsic2NoZW1hVWlkIjoiMHgwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDEiLCJuYW1lIjoiQWdlbnRBdXRob3JpemF0aW9uIn19fSwidGltZXN0YW1wIjoiMjAyNS0wMS0xNVQxMjowMDowMFoiLCJub25jZSI6IjdmZGZjZDg1ZDQ3NmJjMjhiYjUzNTZkMTVhZmYyYmJjIiwiaXNzdWVkVG8iOnsid2FsbGV0IjoiMHg4NTdiMDY1MTlFOTFlM0E1NDUzODc5MWJEYmIwRTIyMzczZTM2YjY2In19.bd55fef2ed35fbac338f19a412c65f2fc59456d01f00da2e51f4488528634f6363dbac63cb52a80e4105847208130d81c0f00853c9019596de12e89bea1f77fd
PAYMENT-SIGNATURE: eyJ4NDAyVmVyc2lvbiI6MiwicmVzb3VyY2UiOi4uLn0=
Content-Type: application/json

{
  "query": "latest market data"
}
```

The JWT payload contains a selective disclosure proof with:
- **Merkle Tree**: Identity claims with only required fields disclosed
- **Attestation**: Blockchain proof of agent authorization
- **Timestamp/Nonce**: Replay attack prevention
- **Issued To**: Wallet address of the verified agent

### Direct EAS Attestation Format

```http
POST /premium-data HTTP/1.1
Host: api.example.com
X-AGENT-VERIFICATION: eas:base-sepolia:0x27e082fcad517db4b28039a1f89d76381905f6f8605be7537008deb002f585ef
PAYMENT-SIGNATURE: eyJ4NDAyVmVyc2lvbiI6MiwicmVzb3VyY2UiOi4uLn0=
Content-Type: application/json

{
  "query": "latest market data"
}
```

Format: `eas:<network>:<attestation-uid>`

## Server Verification Process

1. **Header Validation**: Verify `X-AGENT-VERIFICATION` header is present and well-formed
2. **Format Detection**: Determine verification format (ProofPack JWS, EAS reference, etc.)
3. **Cryptographic Verification**: 
   - For ProofPack JWS: Validate JWT signature and Merkle tree integrity
   - For EAS reference: Query blockchain to verify attestation exists and is valid
4. **Claim Validation**: Ensure all required claims are present and within acceptable values
5. **Freshness Check**: Verify timestamp is within `maxAge` window
6. **Replay Protection**: Check nonce hasn't been used within `replayWindow`
7. **Trust Verification**: Confirm attester is in `trustedAttesters` list (if specified)
8. **Schema Validation**: Verify attestation uses approved schema (if required)

## Security Considerations

### Replay Attack Prevention

Servers MUST implement nonce tracking to prevent replay attacks. The combination of `nonce` + `timestamp` + `issuer` should be unique within the replay protection window.

### Trust Chain Verification

When using ProofPack credentials, servers SHOULD verify the complete attestation chain:
- Validate blockchain attestation exists and is unrevoked
- Check attester's reputation and authority to make claims
- Verify delegation chains for agent authorization

### Selective Disclosure Privacy

Servers MUST NOT require unnecessary identity claims. The principle of data minimization applies - only request claims that are essential for the specific use case.

### Cross-Network Considerations

Attestations from different blockchain networks may have varying security properties. Servers should consider:
- Network finality and reorganization risks
- Attester reputation across different networks  
- Gas costs and confirmation requirements

## Use Cases

### Agent Delegation Verification

Proving an AI agent is authorized to act on behalf of a human operator:

```json
{
  "requiredClaims": ["delegation", "human_attestation"],
  "acceptedFormats": ["proofpack-jws"],
  "supportedNetworks": ["base-mainnet"],
  "requiredSchemas": ["0x...delegation_schema_uid"]
}
```

### Compliance Verification

Demonstrating agent meets regulatory requirements:

```json
{
  "requiredClaims": ["jurisdiction", "compliance_status"],
  "acceptedFormats": ["proofpack-jws", "eas-attestation"],
  "supportedNetworks": ["base-mainnet"],
  "trustedAttesters": ["0x...compliance_authority_wallet"]
}
```

### Reputation-Based Access

Granting access based on agent reputation scores:

```json
{
  "requiredClaims": ["reputation_score", "transaction_history"],
  "acceptedFormats": ["proofpack-jws"],
  "supportedNetworks": ["base-mainnet"],
  "trustedAttesters": ["0x...reputation_oracle_1", "0x...reputation_oracle_2"]
}
```

## Error Handling

Agent verification errors are communicated through standard x402 error responses:

| Error Condition | HTTP Status | Error Message |
|-----------------|-------------|---------------|
| Missing verification header | 401 | "Agent verification required" |
| Invalid verification format | 400 | "Invalid agent verification format" |
| Failed cryptographic verification | 401 | "Agent verification failed" |
| Missing required claims | 401 | "Required agent claims not provided" |
| Expired verification | 401 | "Agent verification expired" |
| Replay attack detected | 401 | "Agent verification nonce reused" |
| Untrusted attester | 401 | "Agent verification from untrusted source" |

## Implementation Notes

### Framework Integration

The `X-AGENT-VERIFICATION` header is designed to work alongside existing authentication systems:

```javascript
// Express.js middleware example
app.use('/api/premium', (req, res, next) => {
  const agentVerification = req.headers['x-agent-verification'];
  const authorization = req.headers['authorization'];
  
  if (agentVerification) {
    // Verify agent claims
    const claims = verifyAgentCredentials(agentVerification);
    req.agentClaims = claims;
  }
  
  if (authorization) {
    // Standard app authentication
    const user = verifyBearerToken(authorization);
    req.user = user;
  }
  
  next();
});
```

### Caching Considerations

Verified agent credentials can be cached to improve performance:
- Cache based on `nonce` + `attester` + `timestamp`
- Respect `maxAge` and `replayWindow` parameters
- Invalidate cache if underlying attestation is revoked

### Multi-Chain Support

Services supporting multiple blockchain networks should:
- Specify supported networks in `supportedNetworks` array
- Handle network-specific attestation verification
- Consider cross-chain reputation aggregation

## References

- [ProofPack Specification](https://github.com/zipwireapp/ProofPack)
- [Ethereum Attestation Service (EAS)](https://attest.org/)
- [CAIP-122: Chain Agnostic Sign-in with X](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-122.md)
- [RFC 7519: JSON Web Token (JWT)](https://tools.ietf.org/html/rfc7519)
- [Core x402 Specification](../x402-specification-v2.md)
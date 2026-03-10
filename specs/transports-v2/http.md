# Transport: HTTP

## Summary

The HTTP transport implements x402 payment flows over standard HTTP/HTTPS protocols. This is the original transport for x402 and leverages existing HTTP status codes and headers for payment required signaling and payment payload transmission.

## Payment Required Signaling

The server indicates payment is required using the HTTP 402 "Payment Required" status code.

**Mechanism**: HTTP 402 status code with `PAYMENT-REQUIRED` header
**Data Format**: Base64-encoded `PaymentRequired` schema in header

**Example:**

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
PAYMENT-REQUIRED: eyJ4NDAyVmVyc2lvbiI6MiwiZXJyb3IiOiJQQVlNRU5ULVNJR05BVFVSRSBoZWFkZXIgaXMgcmVxdWlyZWQiLCJyZXNvdXJjZSI6eyJ1cmwiOiJodHRwczovL2FwaS5leGFtcGxlLmNvbS9wcmVtaXVtLWRhdGEiLCJkZXNjcmlwdGlvbiI6IkFjY2VzcyB0byBwcmVtaXVtIG1hcmtldCBkYXRhIiwibWltZVR5cGUiOiJhcHBsaWNhdGlvbi9qc29uIn0sImFjY2VwdHMiOlt7InNjaGVtZSI6ImV4YWN0IiwibmV0d29yayI6ImVpcDE1NTo4NDUzMiIsImFtb3VudCI6IjEwMDAwIiwiYXNzZXQiOiIweDAzNkNiRDUzODQyYzU0MjY2MzRlNzkyOTU0MWVDMjMxOGYzZENGN2UiLCJwYXlUbyI6IjB4MjA5NjkzQmM2YWZjMEM1MzI4YkEzNkZhRjAzQzUxNEVGMzEyMjg3QyIsIm1heFRpbWVvdXRTZWNvbmRzIjo2MCwiZXh0cmEiOnsibmFtZSI6IlVTREMiLCJ2ZXJzaW9uIjoiMiJ9fV19

{}
```

The base64 header decodes to:

```json
{
  "x402Version": 2,
  "error": "PAYMENT-SIGNATURE header is required",
  "resource": {
    "url": "https://api.example.com/premium-data",
    "description": "Access to premium market data",
    "mimeType": "application/json"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:84532",
      "amount": "10000",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "maxTimeoutSeconds": 60,
      "extra": {
        "name": "USDC",
        "version": "2"
      }
    }
  ]
}
```

## Payment Payload Transmission

Clients send payment data using the `PAYMENT-SIGNATURE` HTTP header.

**Mechanism**: `PAYMENT-SIGNATURE` header containing base64-encoded JSON
**Data Format**: Base64-encoded `PaymentPayload` schema

**Example:**

```http
POST /premium-data HTTP/1.1
Host: api.example.com
PAYMENT-SIGNATURE: eyJ4NDAyVmVyc2lvbiI6MiwicmVzb3VyY2UiOnsidXJsIjoiaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20vcHJlbWl1bS1kYXRhIiwiZGVzY3JpcHRpb24iOiJBY2Nlc3MgdG8gcHJlbWl1bSBtYXJrZXQgZGF0YSIsIm1pbWVUeXBlIjoiYXBwbGljYXRpb24vanNvbiJ9LCJhY2NlcHRlZCI6eyJzY2hlbWUiOiJleGFjdCIsIm5ldHdvcmsiOiJlaXAxNTU6ODQ1MzIiLCJhbW91bnQiOiIxMDAwMCIsImFzc2V0IjoiMHgwMzZDYkQ1Mzg0MmM1NDI2NjM0ZTc5Mjk1NDFlQzIzMThmM2RDRjdlIiwicGF5VG8iOiIweDIwOTY5M0JjNmFmYzBDNTMyOGJBMzZGYUYwM0M1MTRFRjMxMjI4N0MiLCJtYXhUaW1lb3V0U2Vjb25kcyI6NjAsImV4dHJhIjp7Im5hbWUiOiJVU0RDIiwidmVyc2lvbiI6IjIifX0sInBheWxvYWQiOnsic2lnbmF0dXJlIjoiMHgyZDZhNzU4OGQ2YWNjYTUwNWNiZjBkOWE0YTIyN2UwYzUyYzZjMzQwMDhjOGU4OTg2YTEyODMyNTk3NjQxNzM2MDhhMmNlNjQ5NjY0MmUzNzdkNmRhOGRiYmY1ODM2ZTliZDE1MDkyZjllY2FiMDVkZWQzZDYyOTNhZjE0OGI1NzFjIiwiYXV0aG9yaXphdGlvbiI6eyJmcm9tIjoiMHg4NTdiMDY1MTlFOTFlM0E1NDUzODc5MWJEYmIwRTIyMzczZTM2YjY2IiwidG8iOiIweDIwOTY5M0JjNmFmYzBDNTMyOGJBMzZGYUYwM0M1MTRFRjMxMjI4N0MiLCJ2YWx1ZSI6IjEwMDAwIiwidmFsaWRBZnRlciI6IjE3NDA2NzIwODkiLCJ2YWxpZEJlZm9yZSI6IjE3NDA2NzIxNTQiLCJub25jZSI6IjB4ZjM3NDY2MTNjMmQ5MjBiNWZkYWJjMDg1NmYyYWViMmQ0Zjg4ZWU2MDM3YjhjYzVkMDRhNzFhNDQ2MmYxMzQ4MCJ9fX0=
Content-Type: application/json

{
  "query": "latest market data"
}
```

The base64 payload decodes to:

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
    "network": "eip155:84532",
    "amount": "10000",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "maxTimeoutSeconds": 60,
    "extra": {
      "name": "USDC",
      "version": "2"
    }
  },
  "payload": {
    "signature": "0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a1283259764173608a2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c",
    "authorization": {
      "from": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
      "to": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "value": "10000",
      "validAfter": "1740672089",
      "validBefore": "1740672154",
      "nonce": "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480"
    }
  }
}
```

## Settlement Response Delivery

Servers communicate payment settlement results using the `PAYMENT-RESPONSE` header.

**Mechanism**: `PAYMENT-RESPONSE` header containing base64-encoded JSON
**Data Format**: Base64-encoded `SettlementResponse` schema

**Example (Success):**

```http
HTTP/1.1 200 OK
Content-Type: application/json
PAYMENT-RESPONSE: eyJzdWNjZXNzIjp0cnVlLCJ0cmFuc2FjdGlvbiI6IjB4MTIzNDU2Nzg5MGFiY2RlZjEyMzQ1Njc4OTBhYmNkZWYxMjM0NTY3ODkwYWJjZGVmMTIzNDU2Nzg5MGFiY2RlZiIsIm5ldHdvcmsiOiJlaXAxNTU6ODQ1MzIiLCJwYXllciI6IjB4ODU3YjA2NTE5RTkxZTNBNTQ1Mzg3OTFiRGJiMEUyMjM3M2UzNmI2NiJ9

{
  "data": "premium market data response",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

The base64 response header decodes to:

```json
{
  "success": true,
  "transaction": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  "network": "eip155:84532",
  "payer": "0x857b06519E91e3A54538791bDbb0E22373e36b66"
}
```

**Example (Failure):**

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
PAYMENT-RESPONSE: eyJzdWNjZXNzIjpmYWxzZSwiZXJyb3JSZWFzb24iOiJpbnN1ZmZpY2llbnRfZnVuZHMiLCJ0cmFuc2FjdGlvbiI6IiIsIm5ldHdvcmsiOiJlaXAxNTU6ODQ1MzIiLCJwYXllciI6IjB4ODU3YjA2NTE5RTkxZTNBNTQ1Mzg3OTFiRGJiMEUyMjM3M2UzNmI2NiJ9

{}
```

The base64 response header decodes to:

```json
{
  "success": false,
  "errorReason": "insufficient_funds",
  "transaction": "",
  "network": "eip155:84532",
  "payer": "0x857b06519E91e3A54538791bDbb0E22373e36b66"
}
```

## Agent Verification Header

The HTTP transport supports optional agent verification using the `X-AGENT-VERIFICATION` header for Know Your Agent (KYA) scenarios.

**Mechanism**: `X-AGENT-VERIFICATION` header containing verification credentials
**Data Format**: JWS (JSON Web Signature) or other verification tokens
**Direction**: Client → Server

This header enables clients to present cryptographically verifiable proof of:
- Agent authorization and delegation chains (human → agent → sub-agent)
- Identity claims and selective disclosure proofs
- Reputation and trust attestations
- Compliance and regulatory verification

**Example with ProofPack JWT:**

```http
POST /premium-data HTTP/1.1
Host: api.example.com
X-AGENT-VERIFICATION: eyJhbGciOiJFUzI1NksiLCJ0eXAiOiJKV1QiLCJjdHkiOiJhcHBsaWNhdGlvbi9hdHRlc3RlZC1tZXJrbGUtZXhjaGFuZ2UranNvbiJ9.eyJtZXJrbGVUcmVlIjp7ImhlYWRlciI6eyJ0eXAiOiJhcHBsaWNhdGlvbi9tZXJrbGUtZXhjaGFuZ2UtMy4wK2pzb24ifSwibGVhdmVzIjpbeyJkYXRhIjoiMHg3YjIyNjE2Yzc5MjMyMzNhMjI1MzQ4NDEzMjM1MzYyMjJjMjI2Yzc2N2E3OTQxNzM3OTMwMjAiLCJzYWx0IjoiMHgzZDI5ZTk0MmNjNzdhN2U3N2RhZDQzYmZiY2JkNWJlMyIsImhhc2giOiIweGU3NzAwN2Q3NjI3ZWIzZWIzMzRhNTU2MzQzYThlZjBiNWM5NTgyMDYxMTk1NDQxYjJkOWUxOGIzMjUwMTg5N2YiLCJjb250ZW50VHlwZSI6ImFwcGxpY2F0aW9uL2pzb247Y2hhcnNldD11dGYtODtlbmNvZGluZz1oZXgifV0sInJvb3QiOiIweDEzMTZmYzBmM2Q3Njk4OGNiNGY2NjBiZGY5N2ZmZjcwZGY3YmY5MGE1ZmYzNDJmZmMzYmFhMDllZDNjMjgwZTUifSwiYXR0ZXN0YXRpb24iOnsiZWFzIjp7Im5ldHdvcmsiOiJiYXNlLXNlcG9saWEiLCJhdHRlc3RhdGlvblVpZCI6IjB4MjdlMDgyZmNhZDUxN2RiNGIyODAzOWExZjg5ZDc2MzgxOTA1ZjZmODYwNWJlNzUzNzAwOGRlYjAwMmY1ODVlZiIsImZyb20iOiIweDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAiLCJ0byI6IjB4MDk4NzY1NDMyMTA5ODc2NTQzMjEwOTg3NjU0MzIxMDk4NzY1NDMyMSIsInNjaGVtYSI6eyJzY2hlbWFVaWQiOiIweDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAiLCJuYW1lIjoiQWdlbnRBdXRob3JpemF0aW9uIn19fSwidGltZXN0YW1wIjoiMjAyNS0wMS0xNVQxMjowMDowMFoiLCJub25jZSI6IjdmZGZjZDg1ZDQ3NmJjMjhiYjUzNTZkMTVhZmYyYmJjIiwiaXNzdWVkVG8iOnsid2FsbGV0IjoiMHg4NTdiMDY1MTlFOTFlM0E1NDUzODc5MWJEYmIwRTIyMzczZTM2YjY2In19.bd55fef2ed35fbac338f19a412c65f2fc59456d01f00da2e51f4488528634f6363dbac63cb52a80e4105847208130d81c0f00853c9019596de12e89bea1f77fd
PAYMENT-SIGNATURE: eyJ4NDAyVmVyc2lvbiI6MiwicmVzb3VyY2UiOnsidXJsIjoiaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20vcHJlbWl1bS1kYXRhIn0sImFjY2VwdGVkIjp7InNjaGVtZSI6ImV4YWN0IiwibmV0d29yayI6ImVpcDE1NTo4NDUzMiJ9LCJwYXlsb2FkIjp7InNpZ25hdHVyZSI6IjB4MmQ2YTc1ODhkNmFjY2E1MDVjYmYwZDlhNGEyMjdlMGM1MmM2YzM0MDA4YzhlODk4NmExMjgzMjU5NzY0MTczNjA4YTJjZTY0OTY2NDJlMzc3ZDZkYThkYmJmNTgzNmU5YmQxNTA5MmY5ZWNhYjA1ZGVkM2Q2MjkzYWYxNDhiNTcxYyJ9fQ==
Content-Type: application/json

{
  "query": "latest market data"
}
```

The JWT payload contains a ProofPack structure with:
- **Merkle Tree**: Selective disclosure of agent identity claims
- **Attestation**: Blockchain attestation proving agent authorization 
- **Timestamp/Nonce**: Replay attack protection
- **Issued To**: Wallet address of the authorized agent

**Use Cases:**
- **Agent Delegation**: Proving an AI agent is authorized to act on behalf of a human
- **Compliance Verification**: Demonstrating agent meets regulatory requirements
- **Identity Claims**: Selective disclosure of agent operator's nationality, jurisdiction, or other attributes
- **Reputation Systems**: Presenting trust scores and historical attestations

**Verification Process:**
1. Server validates JWT signature using attester's public key
2. Verifies attestation exists on specified blockchain network
3. Checks Merkle root matches disclosed data
4. Validates timestamp is within acceptable window
5. Ensures nonce has not been used before (replay protection)
6. Confirms agent wallet matches the attested address

This header is independent of the `Authorization` header, which remains available for traditional application-level authentication tokens.

## Header Summary

| Header | Direction | Description |
| ------ | --------- | ----------- |
| `PAYMENT-REQUIRED` | Server → Client | Base64-encoded `PaymentRequired` object |
| `PAYMENT-SIGNATURE` | Client → Server | Base64-encoded `PaymentPayload` object |
| `PAYMENT-RESPONSE` | Server → Client | Base64-encoded `SettlementResponse` object |
| `X-AGENT-VERIFICATION` | Client → Server | JWS/JWT containing agent verification credentials (optional) |

## Response Body

Response bodies are a server implementation concern. All x402 protocol information is communicated through headers (`PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE`). 

## Error Handling

HTTP transport maps x402 errors to standard HTTP status codes:

| x402 Error       | HTTP Status | Description                                     |
| ---------------- | ----------- | ----------------------------------------------- |
| Payment Required | 402         | Payment needed to access resource               |
| Invalid Payment  | 400         | Malformed payment payload or requirements       |
| Payment Failed   | 402         | Payment verification or settlement failed       |
| Server Error     | 500         | Internal server error during payment processing |
| Success          | 200         | Payment verified and settled successfully       |

## References

- [Core x402 Specification](../x402-specification-v2.md)
- [HTTP/1.1 Specification (RFC 7231)](https://tools.ietf.org/html/rfc7231)
- [HTTP 402 Status Code](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/402)

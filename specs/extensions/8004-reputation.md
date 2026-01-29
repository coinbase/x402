# Extension: `8004-reputation`

## Summary

The `8004-reputation` extension enables **on-chain reputation and proof-of-service** for x402 agents. Agents declare their identity on ERC-8004 compliant reputation registries and provide cryptographic signatures proving service completion. Clients can verify these signatures and submit verifiable feedback linked to payment transactions.

**Key features:**
- Agents sign every response before knowing client feedback (blind commitment)
- Multi-chain identity support (ERC-8004 compliant registries on EVM and Solana)
- Bidirectional rating (agent ↔ client when both are registered)
- Separate identity and reputation registries (ERC-8004 two-registry model)
- Payment address verification (prevent fraud from compromised servers)

---

## `PaymentRequired`

A resource server advertises reputation support by including the `8004-reputation` extension in the `extensions` object of the **402 Payment Required** response.

### Example: Single-Chain Agent (Base)

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://agent.example/weather",
    "description": "Weather data API"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "payTo": "0xAgentWallet123456...",
      "amount": "1000",
      "maxTimeoutSeconds": 60
    }
  ],
  "extensions": {
    "8004-reputation": {
      "info": {
        "version": "1.0.0",
        "registrations": [
          {
            "agentRegistry": "eip155:8453:0x8004A818BFB912233c491871b3d84c89A494BD9e",
            "agentId": "42",
            "reputationRegistry": "eip155:8453:0x8004B663C4a7e45d78F2D05C8e4A5a3D3D5e7890"
          }
        ],
        "endpoint": "https://agent.example/weather",
        "feedbackAggregator": "https://feedback.example/submit"
      },
      "schema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "version": {
            "type": "string",
            "pattern": "^\\d+\\.\\d+\\.\\d+$"
          },
          "registrations": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "properties": {
                "agentRegistry": { "type": "string" },
                "agentId": { "type": "string" },
                "reputationRegistry": { "type": "string" }
              },
              "required": ["agentRegistry", "agentId", "reputationRegistry"]
            }
          },
          "endpoint": {
            "type": "string",
            "format": "uri"
          },
          "feedbackAggregator": {
            "type": "string",
            "format": "uri"
          }
        },
        "required": ["version", "registrations"]
      }
    }
  }
}
```

### Example: Multi-Chain Agent (Base + Solana)

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://agent.example/weather",
    "description": "Weather data API"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "payTo": "0xBaseWallet...",
      "amount": "1000"
    },
    {
      "scheme": "exact",
      "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "payTo": "SolanaWallet...",
      "amount": "1000"
    }
  ],
  "extensions": {
    "8004-reputation": {
      "info": {
        "version": "1.0.0",
        "registrations": [
          {
            "agentRegistry": "eip155:8453:0x8004A818BFB912233c491871b3d84c89A494BD9e",
            "agentId": "42",
            "reputationRegistry": "eip155:8453:0x8004B663C4a7e45d78F2D05C8e4A5a3D3D5e7890"
          },
          {
            "agentRegistry": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:satiRkxEiwZ51cv8PRu8UMzuaqeaNU9jABo6oAFMsLe",
            "agentId": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
            "reputationRegistry": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:satiRkxEiwZ51cv8PRu8UMzuaqeaNU9jABo6oAFMsLe"
          }
        ]
      },
      "schema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "version": {
            "type": "string",
            "pattern": "^\\d+\\.\\d+\\.\\d+$"
          },
          "registrations": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "properties": {
                "agentRegistry": { "type": "string" },
                "agentId": { "type": "string" },
                "reputationRegistry": { "type": "string" }
              },
              "required": ["agentRegistry", "agentId", "reputationRegistry"]
            }
          },
          "endpoint": {
            "type": "string",
            "format": "uri"
          },
          "feedbackAggregator": {
            "type": "string",
            "format": "uri"
          }
        },
        "required": ["version", "registrations"]
      }
    }
  }
}
```

---

## ReputationInfo Structure

### Required Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | Yes | Extension version (e.g., `"1.0.0"`) |
| `registrations` | array | Yes | Agent identity registrations (at least one) |
| `endpoint` | string | No | Agent's service endpoint URL |
| `feedbackAggregator` | string | No | Third-party endpoint for gas-free feedback submission |

### AgentRegistration Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agentRegistry` | string | Yes | CAIP-10 Identity Registry address |
| `agentId` | string | Yes | Agent identifier (tokenId for EVM, mint address for Solana) |
| `reputationRegistry` | string | Yes | CAIP-10 Reputation Registry address (may equal agentRegistry on Solana) |

**Note:** ERC-8004 separates identity (ERC-721 NFT registry) from reputation (feedback storage). On Solana, both may be the same program address.

---

## Pre-Payment Verification (Recommended)

**Best Practice:** Clients SHOULD verify the payment address before sending payment to prevent fraud from compromised servers.

### Step 1: Choose Payment Option and Find Matching Registration

```
// Client chooses payment option (based on wallet balance, fees, preference)
chosenAccept = paymentRequired.accepts[selectedIndex]
paymentNetwork = chosenAccept.network   // e.g., "eip155:8453" or "solana:5eykt4..."
payToAddress = chosenAccept.payTo

// Find registration matching the chosen payment network
// Extract network prefix from CAIP-10 agentRegistry:
//   "eip155:8453:0x8004A818..." → "eip155:8453"
//   "solana:5eykt4...:satiRkx..." → "solana:5eykt4..."

registration = registrations.find where:
  agentRegistry.networkPrefix() == paymentNetwork

if not found:
  error "Agent not registered on chosen payment network"
```

### Step 2: Fetch On-Chain Agent Wallet

```
// registry.getAgentWallet() - ERC-8004 compliant interface (EVM and SATI)
agentWallet = registry.getAgentWallet(registration.agentId)
```

### Step 3: Verify Payment Address

```
// Normalize addresses for comparison:
// - EVM: case-insensitive (lowercase both)
// - Solana: case-sensitive (exact match)

if paymentNetwork.startsWith("eip155:"):
  if lowercase(payToAddress) != lowercase(agentWallet):
    error "Payment address mismatch - potential fraud. ABORTING."

if paymentNetwork.startsWith("solana:"):
  if payToAddress != agentWallet:
    error "Payment address mismatch - potential fraud. ABORTING."

// Verification passed - safe to proceed with payment
```

### Why This Check Matters

A compromised agent server (or MITM attacker) can change the `payTo` field in the 402 response to steal payments:

1. Client sends payment to attacker's wallet
2. Blockchain transaction is irreversible
3. Money is gone (even if signature verification later fails)

This check prevents payment theft and should happen before any blockchain transaction.

---

## Usage: `PAYMENT-RESPONSE`

After successful payment settlement, agents MUST sign the interaction and include `InteractionData` in the `PAYMENT-RESPONSE` header.

### Signature Protocol

**Agents MUST:**
1. Complete the service and construct the response
2. Compute: `interactionHash = keccak256(UTF8(taskRef) || UTF8(requestBody) || UTF8(responseBody))`
3. Sign the `interactionHash` with an authorized key from their registration file
4. Include signature WITH every response (blind commitment - before knowing client feedback)

**Components:**
- `taskRef`: CAIP-220 payment transaction reference
- `requestBody`: UTF-8 encoded HTTP request body (empty string if no body)
- `responseBody`: UTF-8 encoded HTTP response body

### Example PAYMENT-RESPONSE

**Decoded header:**

```json
{
  "settlementResponse": {
    "success": true,
    "txHash": "5A2CSREGntKZu8f2...",
    "networkId": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    "payer": "ClientWallet..."
  },
  "extensions": {
    "8004-reputation": {
      "networkId": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      "agentId": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      "taskRef": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:5A2CSREGntKZu8f2...",
      "interactionHash": "0x123abc456def...",
      "agentSignature": "a1b2c3d4e5f6...",
      "timestamp": 1737763200
    }
  }
}
```

### InteractionData Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `networkId` | string | Yes | CAIP-2 payment network (convenience field, embedded in taskRef) |
| `agentId` | string | Yes | Agent identifier on this network (convenience field) |
| `taskRef` | string | Yes | CAIP-220 payment transaction reference |
| `interactionHash` | string | Yes | Hex-encoded keccak256(taskRef \|\| requestBody \|\| responseBody) |
| `agentSignature` | string | Yes | Hex-encoded signature bytes (algorithm from registration file) |
| `timestamp` | number | Yes | Unix timestamp (metadata, NOT part of signed message) |

---

## Post-Service Signature Verification

After receiving the service response with `PAYMENT-RESPONSE` header, clients MUST verify the agent signature to prove service delivery:

### 1. Fetch Registration File

```
// registry.tokenURI() - ERC-8004 compliant interface (EVM and SATI)
uri = registry.tokenURI(agentId)
registrationFile = fetch(uri).json()
```

### 2. Find Matching Registration

```
registration = registrationFile.registrations.find where:
  agentRegistry == expectedRegistry AND agentId == expectedAgentId

if not found:
  error "Agent not registered on this network"
```

### 3. Get Valid Signers

```
// signers array is TOP-LEVEL (not per-registration) per ERC-8004 compliance
now = currentUnixTimestamp()
validSigners = registrationFile.signers.filter where:
  validFrom <= now AND (validUntil == null OR validUntil > now)

if validSigners is empty:
  error "No valid signers found"
```

### 4. Verify Signature

```
isValid = validSigners.any where:
  verifySignature(
    message: interactionData.interactionHash,
    signature: interactionData.agentSignature,
    publicKey: signer.publicKey,
    algorithm: signer.algorithm
  )

if not isValid:
  error "Signature verification failed"
```

### 5. Additional Checks

- **taskRef format**: Valid CAIP-220 matching `networkId`
- **Network matching**: `networkId` matches agent's declared identity
- **Transaction matching**: `taskRef` references actual payment transaction
- **Interaction hash**: Recompute and verify it matches `interactionHash`
- **Payment address** (recommended): Verify `payTo` matches on-chain `agentWallet`

---

## Registration File Schema

The registration file is off-chain JSON referenced by on-chain `tokenURI` (ERC-8004) or `TokenMetadata.uri` (SATI).

### Structure

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "Agent Name",
  "description": "Agent description",
  "image": "https://...",
  "x402Support": true,
  "supportedTrust": ["reputation"],

  "registrations": [
    {
      "agentId": "7xKXtg2CW87...",
      "agentRegistry": "solana:5eykt4...:satiRkx..."
    },
    {
      "agentId": "42",
      "agentRegistry": "eip155:8453:0x8004A818..."
    }
  ],

  "signers": [
    {
      "publicKey": "a1b2c3d4...",
      "algorithm": "ed25519",
      "role": "owner",
      "validFrom": 1737763200,
      "validUntil": null,
      "comment": "Hot wallet for Solana signing"
    },
    {
      "publicKey": "04abc123def456...",
      "algorithm": "secp256k1",
      "role": "owner",
      "validFrom": 1737763200,
      "validUntil": null,
      "comment": "Signing key for EVM chains"
    }
  ]
}
```

**Important:** Per ERC-8004 line 123, the `registrations` array MUST contain ONLY `agentId` and `agentRegistry` (2 fields). The `signers` array is a **top-level field** added by x402 8004-reputation extension.

### Signer Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `publicKey` | string | Yes | Hex-encoded public key (no 0x prefix) |
| `algorithm` | string | Yes | `"ed25519"` or `"secp256k1"` |
| `role` | string | Yes | `"owner"` or `"delegate"` |
| `validFrom` | number | Yes | Unix timestamp when key becomes valid |
| `validUntil` | number\|null | Yes | Unix timestamp when key expires (null = no expiry) |
| `comment` | string | No | Human-readable description |

**Note:** Multi-chain agents use the same signing keys across all registrations. Single `signers` array serves all networks. Recommended: use secp256k1 for all chains (works natively on EVM, stored for future verification on SATI).

---

## Feedback Submission

Clients MAY submit feedback to the reputation registry using data from `PAYMENT-RESPONSE`.

### feedbackURI JSON Structure

```json
{
  "agentRegistry": "solana:5eykt4...:satiRkx...",
  "agentId": "7xKXtg2CW87...",
  "clientAddress": "solana:5eykt4...:ClientWallet...",
  "createdAt": "2026-01-26T12:00:00Z",
  "value": 95,
  "valueDecimals": 0,

  "taskRef": "solana:5eykt4...:5A2CSREG...",
  "interactionHash": "0x123abc456def...",
  "agentSignature": "a1b2c3d4e5f6...",
  "clientSignature": "fedcba987654...",

  "tags": ["x402-resource-delivered", "proof-of-participation"],
  "comment": "Excellent service"
}
```

### feedbackURI Fields

| Field | Type | Source | Required | Description |
|-------|------|--------|----------|-------------|
| `agentRegistry` | string | ERC-8004 | Yes | CAIP-10 registry address |
| `agentId` | string | ERC-8004 | Yes | Agent identifier |
| `clientAddress` | string | ERC-8004 | Yes | CAIP-10 client wallet address |
| `createdAt` | string | ERC-8004 | Yes | ISO 8601 timestamp |
| `value` | number | ERC-8004 | Yes | Feedback score (0-100) |
| `valueDecimals` | number | ERC-8004 | Yes | Decimal places (0 = integer) |
| `taskRef` | string | x402 | Yes | CAIP-220 payment transaction |
| `interactionHash` | string | x402 | Yes | From PAYMENT-RESPONSE |
| `agentSignature` | string | x402 | Yes | From PAYMENT-RESPONSE |
| `clientSignature` | string | x402 | Yes | Client signs feedback content |
| `tags` | array | Both | No | Structured tags (two-tag model) |
| `comment` | string | Both | No | Free-form text |

### Client Signature

```
clientMessage = keccak256(UTF8(agentRegistry) || UTF8(agentId) || UTF8(taskRef) || uint8(value))
clientSignature = sign(clientMessage, clientPrivateKey)
```

### feedbackHash Computation

```
feedbackHash = keccak256(JSON.stringify(feedbackURIContent))
```

### Backend Submission Examples

**ERC-8004:**

```solidity
// 1. Upload feedbackURI JSON to IPFS/HTTPS
const feedbackURI = "ipfs://QmX...";
const feedbackHash = keccak256(JSON.stringify(feedbackURIContent));

// 2. Call reputation registry
registry.giveFeedback(
  agentId: "42",
  value: 95,
  valueDecimals: 0,
  tag1: "x402-resource-delivered",
  tag2: "proof-of-participation",
  endpoint: "https://agent.example/weather",
  feedbackURI: feedbackURI,
  feedbackHash: feedbackHash
);
```

**SATI:**

```typescript
await satiClient.createFeedback({
  agentId: "7xKXtg2CW87...",
  clientAddress: "ClientWallet...",
  taskRef: "solana:5eykt4...:5A2CSREG...",
  value: 95,
  valueDecimals: 0,
  tags: ["x402-resource-delivered", "proof-of-participation"],
  feedbackURI: "ipfs://QmX...",
  agentSignature: "a1b2c3d4e5f6...",
  clientSignature: "fedcba987654...",
  interactionHash: "0x123abc456def..."
});
```

---

## Tag Conventions

ERC-8004 uses a **two-tag model**:
- **tag1**: Dimension being measured
- **tag2**: Qualifier or proof level

### x402-specific Tags

| tag1 | tag2 | Meaning |
|------|------|---------|
| `x402-resource-delivered` | `proof-of-participation` | Resource delivered with agent signature |
| `x402-resource-missing` | `proof-of-participation` | Agent signed but failed to deliver |
| `x402-response-delayed` | `proof-of-participation` | Exceeded timeout but eventually delivered |
| `x402-payment-amount` | `mismatch` | Agent requested different amount than declared |

### ERC-8004 Standard Tags

- `starred` / `5` (5-star rating)
- `uptime` / `high`
- `successRate` / `95`
- `response-time` / `fast`

---

## Bidirectional Rating (Optional)

Clients who are also registered agents MAY declare their identity in the payment request to enable agent-to-agent mutual rating.

### Client Identity in PaymentPayload

```json
{
  "x402PaymentPayload": { /* standard fields */ },
  "extensions": {
    "8004-reputation": {
      "clientAgentRegistry": "eip155:8453:0x8004A818...",
      "clientAgentId": "99"
    }
  }
}
```

Per ERC-8004 spec (line 229), when submitting feedback where the client is an agent, use their on-chain `agentWallet` as the `clientAddress` to facilitate reputation aggregation.

---

## Security Considerations

### Critical Requirements (MUST)

- ✅ Always verify signatures cryptographically before trusting interaction data
- ✅ Fetch registration file from on-chain URI (never trust x402 headers alone)
- ✅ Check signer validity period (`validFrom` to `validUntil`)
- ✅ Verify `taskRef` matches actual payment transaction
- ✅ Use IPFS CID verification or HTTPS for registration file integrity

### Recommended Practices (SHOULD)

- ✅ Verify `payTo` address matches on-chain `agentWallet` BEFORE payment (prevents theft from compromised servers)
- ✅ See "Pre-Payment Verification" section for implementation details
- ✅ Blockchain transactions are irreversible - verify before money moves

### Key Rotation

1. Update registration file with new signer (or set `validUntil` on old key)
2. Re-upload to IPFS or update HTTPS file
3. Call on-chain: `setAgentURI(agentId, newUri)`
4. **Grace period**: Overlap old/new keys by 24 hours

### agentWallet vs signers Separation

- **agentWallet** (ERC-8004 metadata): Payment address (cold wallet, set on-chain with EIP-712 signature)
- **signers** (registration file): Response signing keys (hot wallet for automation)

This separation enables secure payment reception while allowing operational signing with hot wallets.

---

## References

- [ERC-8004: Trustless Agents](https://eips.ethereum.org/EIPS/eip-8004)
- [SATI Specification](https://github.com/cascade-fyi/sati/blob/main/docs/specification.md)
- [CAIP-2: Chain ID](https://github.com/ChainAgnostic/CAIPs/blob/master/CAIPs/caip-2.md)
- [CAIP-10: Account ID](https://github.com/ChainAgnostic/CAIPs/blob/master/CAIPs/caip-10.md)
- [CAIP-220: Transaction Hash](https://github.com/ChainAgnostic/CAIPs/blob/master/CAIPs/caip-220.md)

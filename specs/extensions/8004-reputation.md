# Extension: `8004-reputation`

## Summary

The `8004-reputation` extension enables **on-chain reputation and proof-of-settlement** for x402 agents. It integrates with ERC-8004 compliant reputation registries and provides:

- **Agent identity declaration**: Agents advertise their ERC-8004 registrations
- **Facilitator settlement attestation**: Facilitators cryptographically attest to successful settlements
- **Feedback aggregation protocol**: Gas-free feedback submission through trusted aggregators

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
        "feedbackAggregator": {
          "endpoint": "https://x402.dexter.cash/feedback",
          "networks": ["eip155:8453", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
          "gasSponsored": true
        }
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
            "type": "object",
            "properties": {
              "endpoint": { "type": "string", "format": "uri" },
              "networks": { "type": "array", "items": { "type": "string" } },
              "gasSponsored": { "type": "boolean" }
            },
            "required": ["endpoint"]
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
      "schema": { /* same as above */ }
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
| `feedbackAggregator` | object | No | Aggregator for gas-free feedback submission |

### AgentRegistration Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agentRegistry` | string | Yes | CAIP-10 Identity Registry address |
| `agentId` | string | Yes | Agent identifier (tokenId for EVM, mint address for Solana) |
| `reputationRegistry` | string | Yes | CAIP-10 Reputation Registry address |

**Note:** ERC-8004 separates identity (ERC-721 NFT registry) from reputation (feedback storage). On Solana (SATI), both may be the same program address.

### FeedbackAggregator Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `endpoint` | string | Yes | HTTPS endpoint accepting feedback submissions |
| `networks` | string[] | No | CAIP-2 networks the aggregator supports |
| `gasSponsored` | boolean | No | Whether aggregator pays on-chain gas (default: false) |

---

## Facilitator Settlement Attestation

Facilitators MAY include a signed attestation in the `PAYMENT-RESPONSE` proving they executed the payment settlement. This provides an independent trust signal that complements agent signatures.

### Motivation

The `proofOfPayment.txHash` in feedback files can reference any transaction. Facilitator attestation provides cryptographic proof from the entity that actually settled the payment, preventing:

- Fake feedback using arbitrary transaction references
- Reputation attacks without service consumption

### Attestation in PAYMENT-RESPONSE

After successful settlement, facilitators add attestation data to the response extensions:

```json
{
  "success": true,
  "transaction": "5A2CSREGntKZu8f2...",
  "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  "payer": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  "extensions": {
    "8004-reputation": {
      "facilitatorAttestation": {
        "facilitatorId": "eip155:8453:0x8004F123...",
        "settledAt": 1737763200,
        "settledAmount": "1000",
        "settledAsset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "payTo": "CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5",
        "payer": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
        "attestationSignature": "0x789ghi..."
      }
    }
  }
}
```

### FacilitatorAttestation Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `facilitatorId` | string | Yes | CAIP-10 facilitator identifier |
| `settledAt` | number | Yes | Unix timestamp of settlement |
| `settledAmount` | string | Yes | Amount in atomic units |
| `settledAsset` | string | Yes | Token address/mint |
| `payTo` | string | Yes | Recipient address |
| `payer` | string | Yes | Payer address |
| `attestationSignature` | string | Yes | Facilitator signature |

### Attestation Signature

The facilitator signs a message binding the attestation to the specific settlement:

```
message = keccak256(
  UTF8(taskRef) || UTF8(settledAmount) || UTF8(settledAsset) || 
  UTF8(payTo) || UTF8(payer) || uint64BE(settledAt)
)
attestationSignature = sign(message, facilitatorPrivateKey)
```

Where `taskRef` is derived from the settlement: `{network}:{transaction}` in CAIP-220 format.

### When to Include

Facilitators SHOULD include attestation when:
- Agent advertises `8004-reputation` extension
- Settlement succeeds
- Facilitator has signing capability

---

## feedbackAggregator Protocol

The `feedbackAggregator` field enables gas-free, batched feedback submission through trusted intermediaries.

### Aggregator Submission Protocol

#### Request

Clients POST feedback to the aggregator endpoint:

```http
POST /feedback HTTP/1.1
Content-Type: application/json

{
  "taskRef": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:5A2CSREGntKZu8f2...",
  "interactionHash": "0x123abc456def...",
  "agentSignature": "a1b2c3d4e5f6...",
  
  "agentId": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "reputationRegistry": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:satiRkxEiwZ51cv8PRu8UMzuaqeaNU9jABo6oAFMsLe",
  
  "value": 95,
  "valueDecimals": 0,
  "tag1": "x402-delivered",
  "tag2": "proof-of-settlement",
  
  "clientAddress": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  "clientSignature": "fedcba987654...",
  
  "facilitatorAttestation": { /* optional */ }
}
```

#### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `taskRef` | string | Yes | CAIP-220 payment transaction reference |
| `interactionHash` | string | No | From agent's signed response (if available) |
| `agentSignature` | string | No | From agent's signed response (if available) |
| `agentId` | string | Yes | Target agent identifier |
| `reputationRegistry` | string | Yes | CAIP-10 reputation registry |
| `value` | number | Yes | Feedback score (0-100 recommended) |
| `valueDecimals` | number | Yes | Decimal precision (0 = integer) |
| `tag1` | string | No | Primary category tag |
| `tag2` | string | No | Evidence level tag |
| `clientAddress` | string | Yes | CAIP-10 client wallet |
| `clientSignature` | string | Yes | Client signature over feedback |
| `facilitatorAttestation` | object | No | Facilitator attestation from settlement |

#### Client Signature

Clients MUST sign to prove feedback authenticity:

```
message = keccak256(UTF8(agentId) || UTF8(taskRef) || int128BE(value) || uint8(valueDecimals))
clientSignature = sign(message, clientPrivateKey)
```

#### Response

Success (202 Accepted):
```json
{
  "accepted": true,
  "feedbackId": "fb_abc123",
  "status": "queued"
}
```

Error (400 Bad Request):
```json
{
  "accepted": false,
  "error": "invalid_task_ref",
  "message": "taskRef not found in aggregator settlement records"
}
```

#### Error Codes

| Code | Description |
|------|-------------|
| `invalid_task_ref` | taskRef not in aggregator's settlement records |
| `invalid_client_signature` | Signature verification failed |
| `duplicate_feedback` | Feedback for this taskRef already submitted |
| `unsupported_network` | Registry network not supported |

### Aggregator Requirements

Aggregators MUST:
1. Validate `taskRef` against settlements they processed
2. Verify `clientSignature` against `clientAddress`
3. Preserve client attribution when submitting on-chain

Aggregators SHOULD:
1. Verify facilitator attestation if provided
2. Deduplicate by `taskRef`
3. Include original submission in `feedbackURI` for auditability

### Trust Model

Aggregators are trusted to:
- Honestly relay feedback to the chain
- Not fabricate feedback (client signatures provide non-repudiation)
- Not censor feedback (multiple aggregators provide redundancy)

---

## Tag Conventions

### Outcome Tags (tag1)

| tag1 | Description | Typical Value |
|------|-------------|---------------|
| `x402-delivered` | Resource delivered successfully | 80-100 |
| `x402-failed` | Resource delivery failed | 0-20 |
| `x402-timeout` | Response exceeded timeout | 20-40 |
| `x402-quality` | Subjective quality rating | 0-100 |
| `x402-payment-verified` | Facilitator verified payment | 100 |

### Evidence Tags (tag2)

| tag2 | Description |
|------|-------------|
| `proof-of-payment` | Feedback includes valid taskRef |
| `proof-of-service` | Feedback includes agent signature |
| `proof-of-settlement` | Facilitator attested to settlement |
| `client-claim` | Client claim without cryptographic proof |

---

## Security Considerations

### Sybil Attack Prevention

- Feedback requires a corresponding payment (`taskRef` validation)
- Cost of attack = cost of payments
- Facilitator attestation adds independent verification

### Replay Prevention

- Each `taskRef` can only have one feedback submission
- Aggregators MUST deduplicate by `taskRef`
- Attestations are bound to specific timestamps

### Aggregator Misbehavior

- Clients can verify submissions on-chain
- Multiple aggregators provide redundancy
- Audit trail in `feedbackURI` enables accountability

### Key Management

- Attestation signing keys SHOULD be separate from fee payer keys
- Use HSM or secure key management for high-volume facilitators
- Implement key rotation with overlap periods

---

## Implementation Notes

### For Resource Servers

```typescript
import { declareReputationExtension, REPUTATION } from '@x402/extensions/reputation';

const extension = declareReputationExtension({
  registrations: [{
    agentRegistry: "eip155:8453:0x8004A818...",
    agentId: "42",
    reputationRegistry: "eip155:8453:0x8004B663..."
  }],
  feedbackAggregator: {
    endpoint: "https://x402.dexter.cash/feedback",
    gasSponsored: true
  }
});

const routes = {
  "POST /api": {
    price: "$0.01",
    extensions: { [REPUTATION]: extension }
  }
};
```

### For Facilitators

```typescript
import { createReputationServerExtension } from '@x402/extensions/reputation';

const extension = createReputationServerExtension({
  attestation: {
    facilitatorId: "eip155:8453:0x8004F123...",
    sign: async (msg) => wallet.signMessage(msg)
  }
});

server.registerExtension(extension);
```

### For Clients

```typescript
import {
  createAndSubmitFeedback,
  extractReputationFromSettlement
} from '@x402/extensions/reputation';

const settlementData = extractReputationFromSettlement(response.extensions);

await createAndSubmitFeedback({
  aggregatorEndpoint: "https://x402.dexter.cash/feedback",
  taskRef: `${response.network}:${response.transaction}`,
  facilitatorAttestation: settlementData?.facilitatorAttestation,
  agentId: "42",
  reputationRegistry: "eip155:8453:0x8004B663...",
  value: 95,
  tag1: "x402-delivered",
  tag2: "proof-of-settlement",
  clientAddress: myWallet.address,
  sign: myWallet.signMessage
});
```

---

## References

- [ERC-8004: Trustless Agents](https://eips.ethereum.org/EIPS/eip-8004)
- [SATI Specification](https://github.com/cascade-fyi/sati)
- [CAIP-2: Chain ID](https://github.com/ChainAgnostic/CAIPs/blob/master/CAIPs/caip-2.md)
- [CAIP-10: Account ID](https://github.com/ChainAgnostic/CAIPs/blob/master/CAIPs/caip-10.md)
- [CAIP-220: Transaction Reference](https://github.com/ChainAgnostic/CAIPs/blob/master/CAIPs/caip-220.md)

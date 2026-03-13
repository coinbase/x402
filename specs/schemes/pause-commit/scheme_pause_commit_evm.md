# Scheme: `pause-commit` on `EVM`

## Summary

The `pause-commit` scheme on EVM provides high-security payments for high-value transactions where clients need cancellation ability and risk assessment. Unlike `exact` and `upto` schemes that execute payments before delivery, `pause-commit` uses off-chain cryptographic signatures (EIP-712) that can be settled on-chain after service delivery, with built-in risk scoring and revocation capabilities.

This scheme is implemented via the PAUSE Risk Extension and PAUSECommit smart contract system, providing:

| Feature | Description | Benefit |
| :------ | :---------- | :------ |
| **Risk Assessment** | 11 Bayesian signals score addresses before payment | Prevents payments to high-risk wallets |
| **Off-chain Signatures** | EIP-712 PaymentIntent signing with zero gas cost | No upfront gas cost for clients |
| **Atomic Settlement** | On-chain commit() function for guaranteed payment | Reliable settlement for servers |
| **Cancellable Payments** | Client revoke() function if service not delivered | Loss protection for clients |

---

## Use Cases

- **High-Value API Calls**: Premium data, compute, or AI inference worth >$1
- **Untrusted Server Interactions**: First-time interactions with unknown service providers  
- **Regulated Environments**: Compliance requirements for payment risk assessment
- **Agent-to-Agent Payments**: Autonomous systems requiring fallback mechanisms

---

## Payment Flow

### Phase 1: Risk Assessment & Authorization

1. **Server Response**: Server responds with 402 Payment Required including `scheme: "pause-commit"`
2. **Risk Scoring**: Client extracts `payTo` address and scores via PAUSE Risk Engine (11 signals)
3. **Risk Gating**: High-risk addresses (score < 40) are blocked before signature creation
4. **EIP-712 Signature**: Client signs PaymentIntent off-chain (zero gas cost)
5. **Retry Request**: Client retries with `PAYMENT-SIGNATURE` header

### Phase 2: Service Delivery

1. **Signature Verification**: Server verifies EIP-712 signature and risk score
2. **Service Execution**: Server delivers the requested service/resource
3. **Atomic Settlement**: Server calls `PAUSECommit.commit()` on-chain (~85k gas)

### Phase 3: Safety Mechanisms

1. **Successful Delivery**: Payment settled, transaction complete
2. **Failed Delivery**: Client can call `PAUSECommit.revoke()` to cancel payment
3. **Timeout Protection**: Automatic expiration prevents indefinite holds

---

## 1. AssetTransferMethod: `pause-commit`

This scheme uses EIP-712 structured data signing for off-chain payment authorization, combined with the PAUSECommit smart contract for atomic settlement and cancellation.

### Phase 1: Risk Assessment

Before creating any signature, the client MUST perform risk assessment on the `payTo` address.

**Risk Scoring API:**
```http
POST https://api.pausescan.com/score
Content-Type: application/json

{
  "address": "0x...",
  "network": "ethereum"
}
```

**Risk Signals (11 Bayesian Components):**

| Signal | Weight | Detection |
|--------|--------|-----------|
| Mixer Exposure | 0.45 | Tornado Cash interaction history |
| Draining Pattern | 0.30 | Wallet drainer behavior analysis |
| Exchange Cluster | 0.25 | Proximity to exchange wallets |
| Sweep Pattern | 0.25 | Funds consolidation patterns |
| TX Burst Anomaly | 0.20 | Bot-like transaction spikes |
| Scam Graph | 0.20 | Community-reported scam connections |
| Dusting Attack | 0.15 | Micro-transaction tracking attempts |
| ENS Authenticity | 0.15 | Domain ownership verification |
| Rival Consensus | 0.15 | External scoring service cross-reference |
| Wallet Age | 0.10 | Account age and activity patterns |
| Balance Volatility | 0.10 | Abnormal balance change patterns |

**Risk Threshold:** Addresses with score < 40 should be blocked.

### Phase 2: EIP-712 PaymentIntent Signature

If risk assessment passes, client creates EIP-712 signature:

**Domain:**
```json
{
  "name": "PAUSECommit",
  "version": "2",
  "chainId": 1,
  "verifyingContract": "0x604152D82Fd031cCD8D27F26C5792AC2CD328bF4"
}
```

**PaymentIntent Type:**
```json
{
  "PaymentIntent": [
    { "name": "from", "type": "address" },
    { "name": "to", "type": "address" },
    { "name": "token", "type": "address" },
    { "name": "amount", "type": "uint256" },
    { "name": "nonce", "type": "uint256" },
    { "name": "deadline", "type": "uint256" },
    { "name": "resource", "type": "string" }
  ]
}
```

**Example PaymentPayload:**
```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://api.example.com/premium-ai-analysis",
    "description": "Advanced AI market analysis",
    "mimeType": "application/json"
  },
  "accepted": {
    "scheme": "pause-commit",
    "network": "eip155:1",
    "amount": "5000000",
    "asset": "0xA0b86a33E6441cc8f84c9c7923525De32f74E7DE",
    "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "maxTimeoutSeconds": 3600,
    "extra": {
      "facilitatorUrl": "https://facilitator.pausesecure.com",
      "riskScore": 85
    }
  },
  "payload": {
    "signature": "0x...",
    "intent": {
      "from": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
      "to": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "token": "0xA0b86a33E6441cc8f84c9c7923525De32f74E7DE",
      "amount": "5000000",
      "nonce": "1234567890",
      "deadline": "1740672154",
      "resource": "https://api.example.com/premium-ai-analysis"
    },
    "riskAssessment": {
      "score": 85,
      "timestamp": "1740672089",
      "engine": "PAUSE v2.1"
    }
  }
}
```

### Phase 3: Verification Logic

1. **Signature Verification**: Verify EIP-712 signature recovers to `intent.from`
2. **Risk Verification**: Verify `riskAssessment.score >= 40` and timestamp is recent
3. **Balance Verification**: Verify client has sufficient `token` balance
4. **Deadline Verification**: Verify `intent.deadline > block.timestamp`
5. **Nonce Verification**: Verify nonce hasn't been used (prevents replay)
6. **Token Allowance**: Verify PAUSECommit contract has allowance for `intent.amount`

### Phase 4: Settlement Logic

After service delivery, settlement occurs via PAUSECommit contract:

```solidity
function commit(
    address from,
    address to,
    address token,
    uint256 amount,
    uint256 nonce,
    uint256 deadline,
    string memory resource,
    bytes memory signature
) external
```

**Gas Cost**: ~85,000 gas (paid by server/facilitator)

### Phase 5: Cancellation Logic

If service is not delivered, client can revoke:

```solidity
function revoke(
    uint256 nonce
) external
```

**Requirements**: 
- Only original signer can revoke
- Must be called before settlement
- Zero gas cost protection mechanism

---

## Integration Examples

### Client-Side Integration

```typescript
import { createRiskGuard, wrapFetchWithRiskGuard } from "@pausesecure/x402-risk/client";
import { createPauseCommitSigner } from "@pausesecure/x402-commit";

// Risk guard setup
const guard = createRiskGuard({ minScore: 40 });
const signer = createPauseCommitSigner(wallet);

// Wrap fetch with risk assessment
const safeFetch = wrapFetchWithRiskGuard(fetch, guard, signer);

// All x402 payments are now risk-scored and use pause-commit
const response = await safeFetch('https://api.example.com/premium-data');
```

### Server-Side Integration

```typescript
import { verifyPauseCommitPayment } from "@pausesecure/x402-commit/server";
import express from "express";

const app = express();

app.use('/premium', async (req, res, next) => {
  try {
    const payment = await verifyPauseCommitPayment(req.headers);
    req.payment = payment;
    next();
  } catch (error) {
    res.status(402).json({
      scheme: "pause-commit",
      amount: "5000000",
      asset: "0xA0b86a33E6441cc8f84c9c7923525De32f74E7DE",
      payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      facilitatorUrl: "https://facilitator.pausesecure.com"
    });
  }
});
```

---

## Canonical Contracts

### PAUSECommit V2 (Ethereum Mainnet)

**Address**: `0x604152D82Fd031cCD8D27F26C5792AC2CD328bF4`
**Verified Contract**: [Etherscan](https://etherscan.io/address/0x604152D82Fd031cCD8D27F26C5792AC2CD328bF4)

### PAUSE Risk Engine API

**Base URL**: `https://api.pausescan.com`
**Health Check**: `https://api.pausescan.com/health`
**Documentation**: `https://pausescan.com/docs`

### PAUSE Facilitator

**Base URL**: `https://facilitator.pausesecure.com`
**Health Check**: `https://facilitator.pausesecure.com/health`
**Endpoints**: `/verify`, `/settle`

---

## Security Model

### Risk Assessment

The PAUSE Risk Engine provides 11 independent Bayesian signals combined via log-odds scoring with correlation discounting. This prevents:

- **Mixer Exposure**: Payments to addresses with Tornado Cash history
- **Draining Patterns**: Payments to known wallet drainer contracts
- **Scam Networks**: Payments to community-reported scam addresses

### Payment Security

- **Off-chain Authorization**: No gas cost for payment authorization
- **Atomic Settlement**: Guaranteed payment execution or failure
- **Cancellation Mechanism**: Client protection against non-delivery
- **Nonce Protection**: Prevents replay attacks

### Network Security

**Supported Networks**: Ethereum Mainnet (Chain ID: 1)
**Planned Networks**: Base, Arbitrum (Q2 2026)

---

## Comparison with Other Schemes

| Property | exact | upto | pause-commit |
|----------|-------|------|-------------|
| Payment timing | Before delivery | Before delivery | After delivery |
| Cancellable | No | No | Yes |
| Risk scoring | None | None | 11 Bayesian signals |
| Client gas cost | ~21k | ~21k | Zero (off-chain signing) |
| Server gas cost | N/A | N/A | ~85k (settlement) |
| Best for | Micropayments | Metered usage | High-value + safety |
| Trust model | Full server trust | Full server trust | Risk-assessed + recourse |

---

## Extensions

### Multi-Chain Support (Roadmap)

Future versions will support:
- **Base**: Q2 2026
- **Arbitrum**: Q2 2026
- **Polygon**: Q3 2026

### Enhanced Risk Signals (Roadmap)

- **ML Behavior Scoring**: Deep learning models for transaction pattern analysis
- **Social Graph Analysis**: Identity verification via social connections
- **Regulatory Compliance**: KYC/AML integration for regulated environments

---

## Reference Implementation

NPM packages are available for integration:

- **Risk Extension**: `@pausesecure/x402-risk` 
- **Commit Scheme**: `@pausesecure/x402-commit`
- **Server Middleware**: `@pausesecure/x402-commit/server`

See [PAUSE Documentation](https://pausesecure.com/docs) for complete implementation guides.
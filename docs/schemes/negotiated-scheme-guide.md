# Negotiated Payment Scheme Guide

## Introduction

The negotiated payment scheme is an extension to the x402 protocol that enables dynamic pricing through programmatic negotiation. Unlike the exact scheme which requires fixed prices, the negotiated scheme allows clients and servers to reach price agreement through multiple rounds of negotiation.

## Quick Start

### For Servers (Resource Providers)

```typescript
import { negotiatedPayment, RangeBasedStrategy } from 'x402-express';

// Define your pricing strategy
const strategy = new RangeBasedStrategy(
  '0.10',  // Base price
  '0.05',  // Minimum acceptable
  3        // Max negotiation rounds
);

// Apply middleware to your endpoint
app.get('/api/data', 
  negotiatedPayment({
    strategy,
    payTo: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    network: 'base-sepolia'
  }),
  (req, res) => {
    res.json({ 
      data: 'your-protected-data',
      negotiatedPrice: res.locals.negotiation.finalAmount 
    });
  }
);
```

### For Clients (Consumers)

```typescript
import { negotiated } from 'x402/schemes';

// Create proposal
const proposal = negotiated.evm.createNegotiationProposal({
  negotiationId: `neg_${Date.now()}`,
  proposedAmount: '0.07',
  proposer: walletAddress,
  nonce: Date.now().toString(),
  deadline: Math.floor(Date.now() / 1000) + 30,
  signature: await wallet.signTypedData(...)
});

// Encode for X-PAYMENT header
const paymentHeader = negotiated.evm.encodeNegotiationPayment(
  proposal,
  'base-sepolia'
);

// Make request
const response = await fetch('https://api.example.com/data', {
  headers: { 'X-PAYMENT': paymentHeader }
});
```

## Pricing Strategies

### Built-in Strategies

#### 1. RangeBasedStrategy

Simple min/max range evaluation:

```typescript
const strategy = new RangeBasedStrategy(
  '0.10',  // Base price
  '0.05',  // Minimum acceptable
  3        // Max iterations
);
```

Behavior:
- Accepts proposals >= minimum
- Rejects proposals < 50% of minimum
- Counter-offers between min and base

#### 2. VolumeBasedStrategy

Bulk purchase discounts:

```typescript
const strategy = new VolumeBasedStrategy(
  '0.10',  // Base price
  '0.05',  // Minimum
  new Map([
    [10, 0.95],   // 5% off for 10+ items
    [50, 0.90],   // 10% off for 50+ items
    [100, 0.85]   // 15% off for 100+ items
  ])
);
```

### Custom Strategy Implementation

```typescript
import { PricingStrategy, PricingContext, NegotiationResponse } from 'x402/schemes';

class TimeSensitiveStrategy implements PricingStrategy {
  async evaluateProposal(context: PricingContext): Promise<NegotiationResponse> {
    const hour = new Date().getHours();
    const isPeakHours = hour >= 9 && hour <= 17;
    
    const basePrice = isPeakHours ? 0.15 : 0.08;
    const proposed = parseFloat(context.proposal.proposedAmount);
    
    if (proposed >= basePrice) {
      return {
        negotiationId: context.proposal.negotiationId,
        status: 'accepted',
        finalAmount: context.proposal.proposedAmount
      };
    }
    
    return {
      negotiationId: context.proposal.negotiationId,
      status: 'counter',
      counterAmount: basePrice.toFixed(2),
      reason: isPeakHours ? 'Peak hours pricing' : 'Off-peak discount available'
    };
  }
  
  async getCurrentBasePrice(resource: string): Promise<string> {
    const hour = new Date().getHours();
    return (hour >= 9 && hour <= 17) ? '0.15' : '0.08';
  }
}
```

## Security Best Practices

### 1. Signature Verification

In production, always verify EIP-712 signatures:

```typescript
import { verifyTypedData } from 'viem';

const domain = {
  name: 'x402 Negotiated Payment',
  version: '1',
  chainId: 84532,
  verifyingContract: '0x0000000000000000000000000000000000000000'
};

const types = {
  NegotiationProposal: [
    { name: 'negotiationId', type: 'bytes32' },
    { name: 'proposer', type: 'address' },
    { name: 'payTo', type: 'address' },
    { name: 'asset', type: 'address' },
    { name: 'proposedAmount', type: 'uint256' },
    { name: 'maxAcceptable', type: 'uint256' },
    { name: 'volume', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
  ]
};

function verifyProposal(proposal: NegotiationProposal): boolean {
  const recovered = verifyTypedData({
    domain,
    types,
    primaryType: 'NegotiationProposal',
    message: proposal,
    signature: proposal.signature
  });
  
  return recovered.toLowerCase() === proposal.proposer.toLowerCase();
}
```

### 2. Rate Limiting

Prevent negotiation abuse:

```typescript
const rateLimiter = new Map<string, number[]>();

function checkRateLimit(address: string): boolean {
  const now = Date.now();
  const attempts = rateLimiter.get(address) || [];
  
  // Remove attempts older than 1 minute
  const recentAttempts = attempts.filter(t => now - t < 60000);
  
  if (recentAttempts.length >= 10) {
    return false; // Too many attempts
  }
  
  recentAttempts.push(now);
  rateLimiter.set(address, recentAttempts);
  return true;
}
```

### 3. State Management

Track negotiation sessions:

```typescript
interface NegotiationSession {
  negotiationId: string;
  clientAddress: string;
  iterations: number;
  createdAt: Date;
  finalAmount?: string;
}

const negotiations = new Map<string, NegotiationSession>();

function trackNegotiation(negotiationId: string, session: NegotiationSession) {
  negotiations.set(negotiationId, session);
  
  // Clean up after 5 minutes
  setTimeout(() => {
    negotiations.delete(negotiationId);
  }, 300000);
}
```

## Protocol Flow

### Round 1: Price Discovery

```
Client → Server: GET /api/data
Server → Client: 402 Payment Required
{
  "x402Version": 1,
  "accepts": [{
    "scheme": "negotiated",
    "baseAmount": "0.10",
    "minAcceptable": "0.05",
    "maxIterations": 3
  }]
}
```

### Round 2: Proposal

```
Client → Server: GET /api/data
  X-PAYMENT: base64(proposal)

Proposal:
{
  "negotiationId": "neg_123",
  "proposedAmount": "0.07",
  "proposer": "0x...",
  "signature": "0x..."
}
```

### Round 3: Response

**Accepted:**
```json
{
  "negotiationId": "neg_123",
  "status": "accepted",
  "finalAmount": "0.07",
  "settlementRequired": true
}
```

**Counter:**
```json
{
  "status": "counter",
  "counterAmount": "0.08",
  "remainingIterations": 2
}
```

**Rejected:**
```json
{
  "status": "rejected",
  "reason": "Offer below minimum"
}
```

## Advanced Use Cases

### ERC-8004 Reputation Integration

```typescript
import { ReputationClient } from '@erc8004/client';

class ReputationStrategy implements PricingStrategy {
  constructor(private reputationClient: ReputationClient) {}
  
  async evaluateProposal(context: PricingContext): Promise<NegotiationResponse> {
    const reputation = await this.reputationClient.getScore(
      context.clientAddress
    );
    
    const basePrice = 0.10;
    let discount = 0;
    
    if (reputation >= 90) discount = 0.5;      // 50% off
    else if (reputation >= 70) discount = 0.25; // 25% off
    else if (reputation >= 50) discount = 0;    // Standard
    else discount = -0.25;                      // 25% premium
    
    const adjustedPrice = basePrice * (1 - discount);
    const proposed = parseFloat(context.proposal.proposedAmount);
    
    if (proposed >= adjustedPrice) {
      return {
        negotiationId: context.proposal.negotiationId,
        status: 'accepted',
        finalAmount: context.proposal.proposedAmount
      };
    }
    
    return {
      negotiationId: context.proposal.negotiationId,
      status: 'counter',
      counterAmount: adjustedPrice.toFixed(2),
      reason: `Adjusted for reputation score: ${reputation}`
    };
  }
  
  async getCurrentBasePrice(): Promise<string> {
    return '0.10';
  }
}
```

### Demand-Based Pricing

```typescript
class DemandBasedStrategy implements PricingStrategy {
  private requestCount = 0;
  private lastReset = Date.now();
  
  async evaluateProposal(context: PricingContext): Promise<NegotiationResponse> {
    // Reset counter every hour
    if (Date.now() - this.lastReset > 3600000) {
      this.requestCount = 0;
      this.lastReset = Date.now();
    }
    
    this.requestCount++;
    
    // Increase price with demand
    const basePrice = 0.10;
    const demandMultiplier = 1 + (this.requestCount / 1000);
    const currentPrice = basePrice * demandMultiplier;
    
    const proposed = parseFloat(context.proposal.proposedAmount);
    
    if (proposed >= currentPrice) {
      return {
        negotiationId: context.proposal.negotiationId,
        status: 'accepted',
        finalAmount: context.proposal.proposedAmount
      };
    }
    
    return {
      negotiationId: context.proposal.negotiationId,
      status: 'counter',
      counterAmount: currentPrice.toFixed(2),
      reason: `Current demand: ${this.requestCount} requests/hour`
    };
  }
  
  async getCurrentBasePrice(): Promise<string> {
    const basePrice = 0.10;
    const demandMultiplier = 1 + (this.requestCount / 1000);
    return (basePrice * demandMultiplier).toFixed(2);
  }
}
```

## FAQ

**Q: How many negotiation rounds are typical?**  
A: 2-3 rounds usually reach agreement. Most transactions complete in 1-2 rounds.

**Q: Can I use negotiated and exact schemes together?**  
A: Yes, servers can offer both schemes and clients choose their preference.

**Q: What happens if negotiation fails?**  
A: The client receives a final rejection and must either accept the server's counter-offer or abandon the request.

**Q: How do I prevent gaming of the system?**  
A: Implement rate limiting, track client behavior, use reputation systems, and set reasonable minimum acceptable prices.

**Q: Does this work with AI agents?**  
A: Yes! The negotiated scheme is specifically designed for AI agents that need to optimize costs programmatically.

## Migration Guide

### From Exact to Negotiated

**Before (exact scheme):**
```typescript
app.use(paymentMiddleware(
  payTo,
  { price: '$0.01', network: 'base-sepolia' }
));
```

**After (negotiated scheme):**
```typescript
const strategy = new RangeBasedStrategy('0.01', '0.005', 3);

app.use(negotiatedPayment({
  strategy,
  payTo,
  asset: 'USDC_CONTRACT',
  network: 'base-sepolia'
}));
```

## Performance Considerations

- **Latency**: Adds 1-3 additional HTTP round trips
- **Verification**: Each signature check takes ~50ms
- **Storage**: ~200 bytes per active negotiation
- **Throughput**: Handle 1000s of negotiations per second

## Troubleshooting

| Issue | Solution |
|-------|----------|
| All negotiations rejected | Lower minAcceptable or adjust baseAmount |
| High rejection rate | Analyze proposal patterns, adjust strategy |
| Signature verification fails | Verify EIP-712 domain matches client/server |
| Memory growth | Implement negotiation expiry and cleanup |
| Slow responses | Cache pricing decisions, optimize strategy logic |

## Examples

See `examples/typescript/negotiated-pricing/` for complete working examples:
- Server with multiple strategies
- Client with automatic negotiation
- Custom pricing strategy implementation


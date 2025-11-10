# Negotiated Pricing Example

This example demonstrates the negotiated payment scheme for x402, which enables dynamic pricing through programmatic negotiation between clients and servers.

## Overview

The negotiated scheme allows:
- Clients to propose payment amounts
- Servers to accept, reject, or counter-offer based on pricing strategies
- Multiple rounds of negotiation before settlement
- Volume-based and reputation-based pricing strategies

## Features Demonstrated

### 1. Range-Based Pricing Strategy
- Simple acceptance/rejection based on price ranges
- Counter-offers for prices between min and base
- Configurable negotiation iterations

### 2. Volume-Based Pricing Strategy
- Automatic discounts for bulk purchases
- Configurable discount tiers
- Volume-aware price evaluation

## Running the Example

### Prerequisites

Make sure you're in the TypeScript workspace:

```bash
cd typescript
pnpm install
```

### Start the Server

In one terminal:

```bash
cd examples/negotiated-pricing
pnpm run server
```

The server will start on port 3000 with two endpoints:
- `/api/data/simple` - Range-based pricing
- `/api/data/bulk` - Volume-based pricing with discounts

### Run the Client

In another terminal:

```bash
cd examples/negotiated-pricing
pnpm run client
```

The client will demonstrate:
1. Successful negotiation with an acceptable offer
2. Low offer that receives a counter-offer
3. Volume-based pricing with bulk discounts

## How It Works

### Initial Request

```
Client -> Server: GET /api/data/simple
Server -> Client: 402 Payment Required
{
  "accepts": [{
    "scheme": "negotiated",
    "baseAmount": "0.10",
    "minAcceptable": "0.05",
    "maxIterations": 3
  }]
}
```

### Proposal Submission

```
Client -> Server: GET /api/data/simple
  Headers: X-PAYMENT: <base64-encoded-proposal>
  
Proposal contains:
- negotiationId: Unique session identifier
- proposedAmount: Client's offer
- proposer: Client's address
- signature: Cryptographic proof
```

### Server Response

**Accepted:**
```json
{
  "status": "accepted",
  "finalAmount": "0.07",
  "settlementRequired": true
}
```

**Counter-Offer:**
```json
{
  "status": "counter",
  "counterAmount": "0.08",
  "reason": "Please consider our counter-offer",
  "remainingIterations": 2
}
```

**Rejected:**
```json
{
  "status": "rejected",
  "reason": "Offer below minimum acceptable price"
}
```

## Creating Custom Strategies

Implement the `PricingStrategy` interface:

```typescript
import { PricingStrategy, PricingContext, NegotiationResponse } from 'x402-express';

class CustomStrategy implements PricingStrategy {
  async evaluateProposal(context: PricingContext): Promise<NegotiationResponse> {
    // Your custom pricing logic
    const { proposal, clientAddress, resource } = context;
    
    // Return accepted, counter, or rejected
    return {
      negotiationId: proposal.negotiationId,
      status: 'accepted',
      finalAmount: proposal.proposedAmount
    };
  }

  async getCurrentBasePrice(resource: string): Promise<string> {
    // Return current base price for resource
    return '0.10';
  }
}
```

## Security Considerations

This example uses mock signatures for demonstration. In production:

1. Use EIP-712 typed data signing
2. Verify signatures on the server
3. Implement nonce tracking to prevent replay attacks
4. Add rate limiting to prevent negotiation abuse
5. Set appropriate timeouts for negotiations

## Next Steps

- Integrate with a real wallet for signature generation
- Add EIP-712 signature verification
- Implement reputation-based pricing using ERC-8004
- Add persistent negotiation state tracking
- Integrate with the x402 facilitator for settlement


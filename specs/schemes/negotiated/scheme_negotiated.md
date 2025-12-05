# Negotiated Payment Scheme Specification

## Overview

The `negotiated` scheme enables dynamic pricing through a multi-round negotiation protocol between clients and resource servers. Unlike the `exact` scheme which requires fixed prices, the negotiated scheme allows clients to propose payment amounts and servers to accept, reject, or counter-offer based on configurable strategies.

This scheme is particularly valuable for:

- Market-based pricing where demand affects cost
- Reputation-based pricing using external reputation systems (e.g., ERC-8004)
- Bulk discount negotiations for high-volume consumers
- Time-sensitive pricing adjustments
- Resource scarcity management

## Protocol Flow

The negotiated scheme extends the standard x402 flow with additional negotiation rounds:

1. **Initial Request**: Client requests resource without payment
2. **Price Discovery**: Server responds with 402 and negotiation parameters
3. **Proposal**: Client sends payment proposal via X-PAYMENT header
4. **Evaluation**: Server evaluates proposal against pricing strategy
5. **Response**: Server responds with acceptance, rejection, or counter-offer
6. **Settlement**: If accepted, standard x402 settlement proceeds
7. **Iteration**: If counter-offered, client may accept counter or propose new amount

## Payment Requirements Structure

The `paymentRequirements` for negotiated scheme includes additional fields:

```json
{
  "scheme": "negotiated",
  "network": "base-sepolia",
  "baseAmount": "0.10",
  "minAcceptable": "0.05",
  "maxIterations": 3,
  "strategyHints": {
    "volumeDiscounts": true,
    "reputationAware": true,
    "demandBased": true
  },
  "negotiationTimeout": 30,
  "asset": "0x...",
  "payTo": "0x...",
  "resource": "/api/data",
  "description": "Environmental compliance data"
}
```

## Negotiation Payload Structure

The client's negotiation proposal in the X-PAYMENT header:

```json
{
  "x402Version": 1,
  "scheme": "negotiated",
  "network": "base-sepolia",
  "payload": {
    "negotiationId": "uuid-v4",
    "proposedAmount": "0.07",
    "maxAcceptable": "0.08",
    "volume": 100,
    "metadata": {
      "reputation": "0x...",
      "previousCustomer": true
    },
    "signature": "0x..."
  }
}
```

## Server Response Types

### Acceptance Response (200 OK)

```json
{
  "negotiationId": "uuid-v4",
  "status": "accepted",
  "finalAmount": "0.07",
  "settlementRequired": true,
  "X-PAYMENT-RESPONSE": "base64-encoded-settlement-data"
}
```

### Counter-Offer Response (402 Payment Required)

```json
{
  "negotiationId": "uuid-v4",
  "status": "counter",
  "counterAmount": "0.08",
  "reason": "Current demand is high",
  "remainingIterations": 2,
  "expiresAt": "2025-11-10T12:00:00Z"
}
```

### Rejection Response (402 Payment Required)

```json
{
  "negotiationId": "uuid-v4",
  "status": "rejected",
  "reason": "Offer below minimum acceptable price",
  "hint": "Minimum acceptable is 0.05"
}
```

## Security Considerations

1. **Replay Protection**: Each negotiationId must be unique and time-bound
2. **Signature Verification**: All proposals must be cryptographically signed
3. **Rate Limiting**: Servers should limit negotiation attempts per client
4. **State Management**: Servers must track negotiation state to prevent manipulation
5. **Timeout Enforcement**: Negotiations must expire to prevent resource exhaustion

## Implementation Requirements

Facilitators supporting the negotiated scheme MUST:

1. Verify proposal signatures match the proposing address
2. Ensure proposed amounts meet minimum gas/fee requirements
3. Track negotiation sessions to prevent replay attacks
4. Support atomic settlement of accepted negotiations


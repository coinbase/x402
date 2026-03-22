---
"@x402/core": minor
---

feat(core): improve 402 response bodies for autonomous agent discovery

Replaces empty {} response bodies with structured, agent-friendly JSON containing payment instructions, human-readable error messages, and actionable next steps. This enables autonomous agents to understand payment requirements and recover from failures without needing to decode base64 headers.

**Key improvements:**
- **Agent-friendly payment information**: Includes amount, currency, network, recipient address, and payment scheme in human-readable format
- **Currency detection**: Automatically detects USDC, ETH, SOL, and other tokens from asset addresses and network identifiers  
- **Human-readable error messages**: Maps technical error codes to clear explanations (insufficient_balance, invalid_signature, etc.)
- **Actionable next steps**: Provides specific guidance for each error type (fund wallet, retry with new signature, check network status)
- **Multiple payment options**: Lists alternative payment methods when multiple are available
- **Settlement failure context**: Enhanced settlement error responses with recovery guidance

**Breaking changes:** None - maintains full backward compatibility with existing `unpaidResponseBody` and `settlementFailedResponseBody` callbacks. This only changes the default response when no custom callback is provided.

**Example response:**
```json
{
  "status": 402,
  "payment_required": {
    "amount": "0.001",
    "currency": "USDC", 
    "network": "Base",
    "recipient": "0x1234...",
    "scheme": "exact"
  },
  "next_steps": [
    "Ensure wallet has sufficient USDC balance on Base",
    "Generate and include x402 payment signature in PAYMENT-SIGNATURE header"
  ]
}
```

This addresses issue #1677 by solving the autonomous agent discovery and recovery problem, enabling agents to programmatically understand payment requirements and take specific recovery actions.
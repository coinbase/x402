# Transport: MCP (Model Context Protocol)

## Summary

The MCP transport implements x402 payment flows over the Model Context Protocol. This enables AI agents and MCP clients to seamlessly pay for tools and resources.

## Payment Flow Overview

1. Client calls a paid tool without payment
2. Server returns a tool result with `isError: true` and `PaymentRequired` data
3. Client extracts payment requirements and creates a `PaymentPayload`
4. Client retries the tool call with payment in `_meta["x402/payment"]`
5. Server verifies payment, executes tool, settles payment
6. Server returns tool result with settlement info in `_meta["x402/payment-response"]`

## Payment Required Signaling

When a tool requires payment, servers MUST return a tool result with `isError: true` containing the `PaymentRequired` data.

### Server Requirements

Servers MUST provide `PaymentRequired` in `content[0].text` and SHOULD also provide `structuredContent`:

1. **`content[0].text`** (REQUIRED): JSON-encoded with `x402/error` wrapper
2. **`structuredContent`** (OPTIONAL): Direct `PaymentRequired` object for enhanced client compatibility

**Required Response Format:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "isError": true,
    "structuredContent": {
      "x402Version": 2,
      "error": "Payment required to access this resource",
      "resource": {
        "url": "mcp://tool/financial_analysis",
        "description": "Advanced financial analysis tool",
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
    },
    "content": [
      {
        "type": "text",
        "text": "{\"x402/error\":{\"code\":402,\"message\":\"Payment required\",\"data\":{...}}}"
      }
    ]
  }
}
```

### Client Requirements

Clients MUST check for `PaymentRequired` in this priority order:

1. `structuredContent` - Check for direct `PaymentRequired` object
2. `structuredContent["x402/error"].data` - Check for wrapped format  
3. `content[0].text` - Parse JSON and check for `PaymentRequired` or `x402/error` wrapper

### x402/error Wrapper Schema

The `content[0].text` fallback uses this wrapper structure:

```json
{
  "x402/error": {
    "code": 402,
    "message": "Human-readable error message",
    "data": { /* PaymentRequired */ }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `code` | number | MUST be `402` for payment-required errors |
| `message` | string | Human-readable error description |
| `data` | PaymentRequired | The payment requirements object |

## Payment Payload Transmission

Clients send payment data using the MCP `_meta` field with key `x402/payment`.

**Mechanism**: `_meta["x402/payment"]` field in request parameters
**Data Format**: `PaymentPayload` schema

**Example (Tool Call with Payment):**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "financial_analysis",
    "arguments": {
      "ticker": "AAPL",
      "analysis_type": "deep"
    },
    "_meta": {
      "x402/payment": {
        "x402Version": 2,
        "resource": {
          "url": "mcp://tool/financial_analysis",
          "description": "Advanced financial analysis tool",
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
    }
  }
}
```

## Settlement Response Delivery

Servers communicate payment settlement results using the `_meta["x402/payment-response"]` field.

**Mechanism**: `_meta["x402/payment-response"]` field in response result
**Data Format**: `SettlementResponse` schema

### Successful Settlement

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Financial analysis for AAPL: Strong fundamentals with positive outlook..."
      }
    ],
    "_meta": {
      "x402/payment-response": {
        "success": true,
        "transaction": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "network": "eip155:84532",
        "payer": "0x857b06519E91e3A54538791bDbb0E22373e36b66"
      }
    }
  }
}
```

### Settlement Failure

When payment settlement fails, servers MUST return a tool result with `isError: true` containing the failure details. The response follows the same format as Payment Required Signaling, with additional settlement failure information.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "isError": true,
    "structuredContent": {
      "x402Version": 2,
      "error": "Payment settlement failed: insufficient funds",
      "resource": {
        "url": "mcp://tool/financial_analysis",
        "description": "Advanced financial analysis tool",
        "mimeType": "application/json"
      },
      "accepts": [
        { /* original payment requirements */ }
      ],
      "x402/payment-response": {
        "success": false,
        "errorReason": "insufficient_funds",
        "transaction": "",
        "network": "eip155:84532"
      }
    },
    "content": [
      {
        "type": "text",
        "text": "{\"x402/error\":{\"code\":402,\"message\":\"Payment settlement failed\",\"data\":{...}}}"
      }
    ]
  }
}
```

## Error Handling

| Error Type | Response | Description |
|------------|----------|-------------|
| Payment Required | Tool result with `isError: true` | No payment provided, returns `PaymentRequired` |
| Payment Invalid | Tool result with `isError: true` | Payment verification failed, returns `PaymentRequired` with reason |
| Settlement Failed | Tool result with `isError: true` | Settlement failed after execution, returns failure details |

Clients SHOULD detect the format by checking the `x402Version` field and handle both accordingly.

## References

- [Core x402 Specification](../x402-specification-v2.md)
- [MCP Specification](https://modelcontextprotocol.io/specification/)
- [MCP \_meta Field Documentation](https://modelcontextprotocol.io/specification/2025-06-18/basic#meta)
- [agents/x402-mcp](https://github.com/cloudflare/agents/blob/main/packages/agents/src/mcp/x402.ts)
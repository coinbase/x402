# RFC: x402 Intent Traces

**Status:** Implemented
**Version:** 2025-12-17
**Scope:** Extension to support structured intent context for payment decisions.

This RFC extends the x402 protocol to support **Intent Tracing**. It defines a schema for clients to transmit structured data regarding _why_ a payment was declined, and for servers to provide richer context on _why_ a payment failed. This specification enables resource servers to transition from blind pricing to data-driven optimization.

---

## 1. Motivation

In the current x402 protocol, when a client declines to pay for a resource, the server receives no signal—the client simply doesn't submit a `PaymentPayload`. When payments fail, servers return error codes like `insufficient_funds` but provide no context about what the client might do differently.

**Agentic Commerce** changes this paradigm. When an AI agent manages payments on behalf of a user, a "declined payment" is no longer a silent exit; it is often a reasoned decision based on specific constraints (e.g., price exceeds budget, wrong network, untrusted facilitator).

This RFC proposes capturing that decision as an **Intent Trace**. By standardizing this signal, we convert declined payments from dead ends into actionable data points, where resource servers can:

- Understand _why_ clients aren't paying
- Optimize pricing based on real objections
- Offer alternative payment options dynamically
- Build trust through transparent negotiation

---

## 2. Design Rationale

### 2.1 Why Structured Data?

A free-text decline reason would be simpler but less actionable. Structured `reason_code` values enable:

- **Automated routing:** Servers can trigger different workflows per reason (e.g., `price_sensitivity` → offer lower-tier option).
- **Analytics aggregation:** Standardized codes allow servers to quantify decline causes across requests.
- **Future extensibility:** A subsequent RFC MAY define **Counter-Offers** keyed to specific reason codes.

### 2.2 Why Bidirectional?

Unlike the Agentic Commerce Protocol where intent traces flow only from client to server (cart abandonment), x402 benefits from bidirectional traces:

- **Client → Server (Decline Trace):** Why the client chose not to pay after receiving `PaymentRequired`.
- **Server → Client (Failure Trace):** Richer context when verification or settlement fails, including remediation hints.

### 2.3 Why Optional?

The `intent_trace` is optional to maintain backward compatibility. Clients and servers that do not support this extension simply omit the trace data, and the protocol proceeds as before.

### 2.4 Privacy Considerations

Intent Traces are:

- **Explicit:** The client transmits intent only when it chooses to decline.
- **Scoped:** Data is sent only to the resource server involved, not broadcast.
- **Minimal:** The schema encourages structured codes over free-text to reduce information leakage.

---

## 3. Specification Changes

This RFC adds a new message type and extends existing response schemas.

### 3.1 New Message Type: Payment Decline

Clients MAY send a `PaymentDecline` message when they receive `PaymentRequired` but choose not to pay. This is distinct from simply not responding—it actively communicates the reason.

**Schema:**

```json
{
  "x402Version": 2,
  "decline": true,
  "resource": {
    "url": "https://api.example.com/premium-data"
  },
  "intent_trace": {
    "reason_code": "price_sensitivity",
    "trace_summary": "Requested amount exceeds agent budget allocation for this resource category.",
    "metadata": {
      "max_budget": "5000",
      "requested_amount": "10000",
      "budget_category": "market_data"
    }
  }
}
```

### 3.2 Extended Response Schema: VerifyResponse

The `VerifyResponse` schema is extended to include an optional `intent_trace` for richer failure context:

```json
{
  "isValid": false,
  "invalidReason": "insufficient_funds",
  "payer": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
  "intent_trace": {
    "reason_code": "insufficient_funds",
    "trace_summary": "Wallet balance is below required amount.",
    "metadata": {
      "required_amount": "10000",
      "available_balance": "3500",
      "shortfall": "6500",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bda02913"
    },
    "remediation": {
      "action": "top_up",
      "min_amount": "6500",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bda02913",
      "network": "eip155:8453"
    }
  }
}
```

### 3.3 Extended Response Schema: SettleResponse

The `SettleResponse` schema is extended similarly:

```json
{
  "success": false,
  "errorReason": "invalid_transaction_state",
  "network": "eip155:8453",
  "transaction": "0x...",
  "intent_trace": {
    "reason_code": "transaction_reverted",
    "trace_summary": "On-chain transaction reverted during execution.",
    "metadata": {
      "revert_reason": "ERC20: transfer amount exceeds balance",
      "gas_used": "45000",
      "block_number": "12345678"
    },
    "remediation": {
      "action": "retry_with_fresh_authorization",
      "reason": "Balance changed between verification and settlement"
    }
  }
}
```

---

## 4. Schema Definitions

### 4.1 IntentTrace Object

| Field Name    | Type     | Required | Description                                                    |
| ------------- | -------- | -------- | -------------------------------------------------------------- |
| `reason_code` | `string` | Required | Enumerated code identifying the primary reason (see §4.2). **Validator hint:** Treat as lenient enum—accept any string value; unknown codes map to `other`. |
| `trace_summary` | `string` | Optional | Human-readable summary (max 500 chars)                       |
| `metadata`    | `object` | Optional | Flat key-value object for additional context                   |
| `remediation` | `object` | Optional | Suggested action to resolve the issue                          |

### 4.2 Reason Codes

#### Client Decline Reason Codes

Codes used when a client declines to pay after receiving `PaymentRequired`:

| Code                    | Description                                                         |
| ----------------------- | ------------------------------------------------------------------- |
| `price_sensitivity`     | Total price exceeds client's budget or value assessment             |
| `budget_exceeded`       | Payment would exceed allocated budget for this category/session     |
| `wrong_network`         | Client cannot or prefers not to pay on the offered network(s)       |
| `wrong_asset`           | Client does not hold or prefers not to use the offered asset(s)     |
| `insufficient_balance`  | Client knows it has insufficient funds before attempting            |
| `untrusted_facilitator` | Client does not trust the facilitator for this payment              |
| `untrusted_recipient`   | Client does not trust the `payTo` address                           |
| `timing_deferred`       | Client intends to pay later, not an objection to terms              |
| `comparison`            | Client is comparing options across multiple providers               |
| `rate_limit_concern`    | Client concerned about rate of spend or transaction frequency       |
| `gas_cost_concern`      | Expected transaction fees make the payment uneconomical             |
| `authorization_denied`  | User/policy denied authorization for this payment                   |
| `other`                 | Fallback for reasons not covered above                              |

#### Verification/Settlement Failure Reason Codes

Codes used when the server/facilitator explains why a payment failed:

| Code                    | Description                                                         |
| ----------------------- | ------------------------------------------------------------------- |
| `insufficient_funds`    | Wallet balance below required amount                                |
| `signature_invalid`     | Payment authorization signature failed verification                 |
| `signature_expired`     | Authorization past `validBefore` timestamp                          |
| `signature_not_yet_valid` | Authorization before `validAfter` timestamp                       |
| `amount_mismatch`       | Authorized amount doesn't match requirements                        |
| `recipient_mismatch`    | Authorization recipient doesn't match `payTo`                       |
| `nonce_already_used`    | Replay attack detected—nonce previously consumed                    |
| `network_mismatch`      | Payment submitted on wrong network                                  |
| `asset_mismatch`        | Payment uses wrong token contract                                   |
| `transaction_reverted`  | On-chain transaction reverted during execution                      |
| `transaction_timeout`   | Settlement didn't complete within `maxTimeoutSeconds`               |
| `facilitator_error`     | Facilitator encountered an internal error                           |
| `smart_wallet_error`    | ERC-4337 smart wallet deployment or execution failed                |
| `other`                 | Fallback for errors not covered above                               |

### 4.3 Metadata Object

- Keys MUST be strings.
- Values MUST be strings, numbers, or booleans. Arrays and nested objects are NOT permitted.
- Monetary values SHOULD be strings representing atomic token units (consistent with x402 amount formatting).
- Implementations MAY impose limits on key count (e.g., 20 keys) and total payload size (e.g., 4KB).

### 4.4 Remediation Object

| Field Name | Type     | Required | Description                                              |
| ---------- | -------- | -------- | -------------------------------------------------------- |
| `action`   | `string` | Required | Suggested action (e.g., `top_up`, `retry`, `switch_network`) |
| `reason`   | `string` | Optional | Why this action would help                               |
| Additional fields | varies | Optional | Action-specific parameters (e.g., `min_amount`, `network`) |

---

## 5. Transport Bindings

### 5.1 HTTP Transport

#### Client Decline

Clients send a decline by making a request to the same resource URL with a `PAYMENT-DECLINE` header containing the base64url-encoded `PaymentDecline` JSON:

```http
GET /premium-data HTTP/1.1
Host: api.example.com
PAYMENT-DECLINE: eyJ4NDAyVmVyc2lvbiI6MiwiZGVjbGluZSI6dHJ1ZSwicmVzb3VyY2UiOnsidXJsIjoiaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20vcHJlbWl1bS1kYXRhIn0sImludGVudF90cmFjZSI6eyJyZWFzb25fY29kZSI6InByaWNlX3NlbnNpdGl2aXR5In19
```

The server SHOULD respond with `200 OK` to acknowledge receipt of the decline. The response body is empty or contains acknowledgment metadata.

#### Failure Response

When returning a `402 Payment Required` after a failed payment attempt, the server MAY include an `X-PAYMENT-INTENT-TRACE` header with base64url-encoded intent trace JSON:

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
PAYMENT-REQUIRED: <base64url-encoded PaymentRequired>
X-PAYMENT-INTENT-TRACE: <base64url-encoded IntentTrace>
```

### 5.2 A2A Transport

#### Client Decline

Clients send a decline using a message with `x402.payment.status: "payment-declined"` and `x402.payment.intent_trace`:

```json
{
  "jsonrpc": "2.0",
  "method": "message/send",
  "id": "req-004",
  "params": {
    "message": {
      "taskId": "task-123",
      "role": "user",
      "parts": [
        { "kind": "text", "text": "I'm declining this payment." }
      ],
      "metadata": {
        "x402.payment.status": "payment-declined",
        "x402.payment.intent_trace": {
          "reason_code": "price_sensitivity",
          "trace_summary": "Amount exceeds my budget for API calls.",
          "metadata": {
            "max_budget": "5000000",
            "requested_amount": "10000000"
          }
        }
      }
    }
  }
}
```

#### Failure Response

Servers include intent traces in failure responses via `x402.payment.intent_trace`:

```json
{
  "kind": "task",
  "id": "task-123",
  "status": {
    "state": "failed",
    "message": {
      "kind": "message",
      "role": "agent",
      "parts": [
        { "kind": "text", "text": "Payment failed: insufficient funds." }
      ],
      "metadata": {
        "x402.payment.status": "payment-failed",
        "x402.payment.error": "insufficient_funds",
        "x402.payment.intent_trace": {
          "reason_code": "insufficient_funds",
          "trace_summary": "Wallet balance is below required amount.",
          "metadata": {
            "required_amount": "10000000",
            "available_balance": "3500000",
            "shortfall": "6500000"
          },
          "remediation": {
            "action": "top_up",
            "min_amount": "6500000",
            "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bda02913",
            "network": "eip155:8453"
          }
        }
      }
    }
  }
}
```

### 5.3 MCP Transport

#### Client Decline

Clients send a decline using the `_meta` field:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "get_premium_data",
    "arguments": {},
    "_meta": {
      "x402/payment": {
        "decline": true,
        "intent_trace": {
          "reason_code": "budget_exceeded",
          "trace_summary": "This call would exceed my session budget.",
          "metadata": {
            "session_budget_remaining": "2000000",
            "requested_amount": "5000000"
          }
        }
      }
    }
  }
}
```

#### Failure Response

Servers include intent traces in the error response:

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": 402,
    "message": "Payment required",
    "data": {
      "x402Version": 2,
      "error": "Payment verification failed",
      "resource": { "url": "tool://get_premium_data" },
      "accepts": [...],
      "intent_trace": {
        "reason_code": "signature_expired",
        "trace_summary": "Authorization expired before settlement.",
        "metadata": {
          "valid_before": "1740672154",
          "current_time": "1740672200",
          "expired_by_seconds": 46
        },
        "remediation": {
          "action": "retry_with_fresh_authorization",
          "suggested_valid_before_offset": 120
        }
      }
    }
  }
}
```

---

## 6. Example Interactions

### 6.1 Client Declines Due to Price (HTTP)

**Step 1:** Client requests resource, receives `PaymentRequired`:

```http
HTTP/1.1 402 Payment Required
PAYMENT-REQUIRED: <PaymentRequired with amount: 10000000>
```

**Step 2:** Client declines with intent trace:

```http
GET /premium-data HTTP/1.1
PAYMENT-DECLINE: <base64url PaymentDecline>
```

Decoded `PaymentDecline`:
```json
{
  "x402Version": 2,
  "decline": true,
  "resource": { "url": "https://api.example.com/premium-data" },
  "intent_trace": {
    "reason_code": "price_sensitivity",
    "trace_summary": "Agent budget allows max $0.05 per API call; this costs $0.10.",
    "metadata": {
      "max_acceptable_amount": "5000000",
      "requested_amount": "10000000",
      "currency_context": "USDC on Base"
    }
  }
}
```

**Step 3:** Server acknowledges:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "acknowledged": true,
  "message": "Decline recorded. Consider our economy tier at $0.03/call."
}
```

### 6.2 Payment Fails with Remediation Hint (A2A)

```json
{
  "kind": "task",
  "id": "task-456",
  "status": {
    "state": "input-required",
    "message": {
      "role": "agent",
      "parts": [{ "kind": "text", "text": "Payment failed. Please retry with updated authorization." }],
      "metadata": {
        "x402.payment.status": "payment-failed",
        "x402.payment.intent_trace": {
          "reason_code": "signature_expired",
          "trace_summary": "Your payment authorization expired 46 seconds before we could settle it.",
          "metadata": {
            "valid_before": "1740672154",
            "settlement_attempted_at": "1740672200"
          },
          "remediation": {
            "action": "retry_with_fresh_authorization",
            "reason": "Network congestion delayed settlement",
            "suggested_valid_before_offset": 300
          }
        },
        "x402.payment.required": { ... }
      }
    }
  }
}
```

---

## 7. Error Handling

If an `intent_trace` contains **structurally invalid data** (e.g., wrong types, nested objects in `metadata`), the receiver SHOULD:

- **For client declines:** Accept the decline but log/ignore the malformed trace.
- **For server responses:** Include the trace anyway if partially valid, or omit if completely malformed.

Unrecognized `reason_code` values are NOT errors—receivers SHOULD treat unknown codes as equivalent to `other` for processing purposes.

---

## 8. Security & Privacy Considerations

### 8.1 Data Minimization

- Agents SHOULD NOT transmit wallet private keys, seed phrases, or authentication credentials in trace data.
- The `trace_summary` field SHOULD avoid PII unless the client explicitly intends to share it.
- Servers SHOULD NOT require intent traces—they are voluntary signals.

### 8.2 Replay Considerations

Intent traces are informational and do not authorize any payment. They have no replay risk as they do not move funds.

### 8.3 Rate Limiting

Servers MAY rate-limit decline messages to prevent abuse (e.g., a client spamming declines with different reason codes).

---

## 9. Operational Considerations

### 9.1 Backward Compatibility

- **Servers** that do not implement Intent Traces MUST still accept requests that include decline messages or intent trace headers. They SHOULD ignore unrecognized fields and proceed normally.
- **Clients** receiving responses with `intent_trace` fields they don't understand SHOULD ignore them.

### 9.2 Forward Compatibility

If a receiver encounters an unrecognized `reason_code`, it SHOULD accept the trace and treat the unknown code as equivalent to `other` for processing purposes. The `reason_code` enum is explicitly extensible.

### 9.3 Analytics Use Cases

Resource servers can use intent traces to:

- **Price optimization:** Track `price_sensitivity` declines to find optimal price points.
- **Network expansion:** Track `wrong_network` declines to prioritize new network support.
- **UX improvement:** Track `untrusted_facilitator` to identify trust barriers.
- **Failure reduction:** Track remediation success rates to improve suggested actions.

---

## 10. Conformance Checklist

To claim compliance with the **Intent Traces** extension:

**For Clients:**
- [ ] **MAY** send `PaymentDecline` messages with `intent_trace` when declining to pay.
- [ ] **MUST** include `x402Version` and `resource` fields in `PaymentDecline`.
- [ ] **SHOULD** use standardized `reason_code` values where applicable.
- [ ] **MUST NOT** include PII or secrets in trace data unless explicitly authorized.

**For Servers:**
- [ ] **MAY** include `intent_trace` in `VerifyResponse` and `SettleResponse` for failures.
- [ ] **MAY** include `remediation` hints to help clients resolve issues.
- [ ] **MUST** accept decline messages even if not processing the trace data.
- [ ] **SHOULD** accept unrecognized `reason_code` values and treat as `other`.
- [ ] **MUST NOT** require intent traces for normal protocol operation.

**For Facilitators:**
- [ ] **MAY** include `intent_trace` in verify/settle responses.
- [ ] **SHOULD** include `remediation` hints for actionable failures.

---

## 11. Future Extensions

This RFC establishes the foundation for:

- **Counter-Offers:** Servers responding to `price_sensitivity` with alternative pricing.
- **Budget Negotiation:** Clients advertising budget constraints, servers optimizing offerings.
- **Trust Signals:** Clients explaining trust requirements, servers providing attestations.

These extensions are out of scope for this RFC and will be addressed in future proposals.

---

## 12. Implementation Status

This RFC has been implemented across all x402 SDKs. Below is a summary of the implementation:

### Core Types

| Language   | File                                                      | Types Implemented                                      |
| ---------- | --------------------------------------------------------- | ------------------------------------------------------ |
| TypeScript | `packages/core/src/types/facilitator.ts`                  | `IntentTrace`, `Remediation`                           |
| TypeScript | `packages/core/src/types/payments.ts`                     | `PaymentDecline`                                       |
| Go         | `types.go`                                                | `IntentTrace`, `Remediation`, `PaymentDecline`         |
| Python     | `x402/types.py`                                           | `IntentTrace`, `Remediation`, `PaymentDecline`         |
| Java       | `model/IntentTrace.java`, `model/Remediation.java`        | `IntentTrace`, `Remediation`, `PaymentDecline`         |

### HTTP Transport

| Language   | File                                                      | Functions/Features                                     |
| ---------- | --------------------------------------------------------- | ------------------------------------------------------ |
| TypeScript | `packages/core/src/http/index.ts`                         | `encodePaymentDeclineHeader`, `decodePaymentDeclineHeader`, `encodeIntentTraceHeader`, `decodeIntentTraceHeader` |
| TypeScript | `packages/core/src/http/x402HTTPResourceServer.ts`        | Decline header detection and acknowledgment            |
| Go         | `http/client.go`                                          | `EncodePaymentDeclineHeader`, `DecodePaymentDeclineHeader`, `EncodeIntentTraceHeader`, `DecodeIntentTraceHeader` |
| Go         | `http/server.go`                                          | `PAYMENT-DECLINE` header handling                      |
| Python     | `x402/encoding.py`                                        | `encode_payment_decline_header`, `decode_payment_decline_header`, `encode_intent_trace_header`, `decode_intent_trace_header` |

### Middleware/Filters

| Language   | File                                                      | Feature                                                |
| ---------- | --------------------------------------------------------- | ------------------------------------------------------ |
| Python     | `x402/flask/middleware.py`                                | `PAYMENT-DECLINE` header handling                      |
| Python     | `x402/fastapi/middleware.py`                              | `PAYMENT-DECLINE` header handling                      |
| Java       | `server/PaymentFilter.java`                               | `PAYMENT-DECLINE` header handling                      |

### Facilitator Logic (Intent Trace Helpers)

| Language   | File                                                      | Helper Functions                                       |
| ---------- | --------------------------------------------------------- | ------------------------------------------------------ |
| TypeScript | `packages/core/src/utils/intentTrace.ts`                  | `createInsufficientFundsTrace`, `createSignatureExpiredTrace`, `createSignatureNotYetValidTrace`, `createInvalidSignatureTrace`, `createRecipientMismatchTrace`, `createAmountMismatchTrace`, `createTransactionRevertedTrace`, `createUndeployedWalletTrace`, `createGenericFailureTrace` |
| TypeScript | `packages/mechanisms/evm/src/exact/facilitator/scheme.ts` | Intent traces integrated into verification/settlement failures |

### Extended Response Types

All languages extend `VerifyResponse` and `SettleResponse` with optional `intentTrace` field:

- TypeScript: `packages/core/src/types/facilitator.ts`
- Go: `types.go`
- Python: `x402/types.py`
- Java: `client/VerificationResponse.java`, `client/SettlementResponse.java`

### Tests

| Language   | File                                                      | Test Coverage                                          |
| ---------- | --------------------------------------------------------- | ------------------------------------------------------ |
| Go         | `http/client_test.go`                                     | `TestEncodeDecodeIntentTrace`, `TestEncodeDecodePaymentDecline`, `TestDecodeInvalidIntentTraceHeader`, `TestDecodeInvalidPaymentDeclineHeader` |
| Python     | `tests/test_encoding.py`                                  | `test_encode_decode_intent_trace`, `test_encode_decode_payment_decline`, `test_intent_trace_roundtrip` |

---

## 13. Change Log

- **2025-12-17:** Initial proposal for x402 Intent Traces. Adapted from Agentic Commerce Protocol RFC. Defined bidirectional trace schema with client decline codes and server failure codes. Added remediation hints. Specified transport bindings for HTTP, A2A, and MCP.
- **2025-12-17:** Implementation completed across TypeScript, Go, Python, and Java SDKs.
- **2025-12-17:** Fixed examples to use string formatting for monetary values per §4.3. Added lenient enum validator hint for `reason_code`.

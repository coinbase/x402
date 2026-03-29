# Extension: `diagnostic`

## Summary

The `diagnostic` extension provides **payment failure signaling** for autonomous agents by enabling resource servers to communicate detailed information about payment errors, retry patterns, and escalation requirements. This extension addresses the critical need for standardized error communication in autonomous agentic payment systems where broken payment logic can result in thousands of failed attempts without human awareness.

---

## Motivation

The current x402 specification defines how to request payment but lacks vocabulary for communicating **why** payment is failing. In production agentic payment systems, all payment failures result in identical 402 responses regardless of the underlying cause:

- First legitimate request discovering payment requirements  
- Payment attempt with expired invoice
- Payment attempt with insufficient wallet funds
- Broken payment logic making thousands of failed attempts
- Wallet signature verification failures

Without diagnostic information, autonomous agents cannot distinguish between these scenarios, leading to:
- Infinite retry loops on unrecoverable errors
- No escalation mechanism for human intervention
- Resource waste on both client and server sides
- Lost revenue opportunities for service providers

---

## `PaymentRequired`

A resource server provides payment diagnostic information by including the `diagnostic` extension in the `extensions` object of the **402 Payment Required** response.

The extension follows the standard v2 pattern:
- **`info`**: Contains the diagnostic data (error code, attempt tracking, escalation signals)
- **`schema`**: JSON Schema validating the structure of `info`

### Basic Example

```json
{
  "x402Version": 2,
  "error": "Payment required",
  "resource": {
    "url": "https://api.example.com/weather",
    "description": "Weather data endpoint"
  },
  "accepts": ["x402"],
  "extensions": {
    "diagnostic": {
      "info": {
        "code": "PAYMENT_REQUIRED",
        "message": "Payment required for access",
        "attempts": 0,
        "escalate": false
      },
      "schema": "https://specs.x402.org/extensions/diagnostic.json"
    }
  }
}
```

### Advanced Example: Broken Payment Logic Detection

```json
{
  "x402Version": 2,
  "error": "Payment required", 
  "resource": {
    "url": "https://oracle.example.com/btc-price",
    "description": "Bitcoin price oracle"
  },
  "accepts": ["x402"],
  "extensions": {
    "diagnostic": {
      "info": {
        "code": "PAYMENT_ATTEMPTS_EXCEEDED",
        "message": "8,432 requests received with no valid payment in 18 days",
        "attempts": 8432,
        "firstAttempt": "2026-03-10T00:00:00Z",
        "lastAttempt": "2026-03-28T14:30:00Z", 
        "suggestion": "Check payment handler configuration and wallet balance. See troubleshooting guide.",
        "helpUrl": "https://docs.x402.org/troubleshooting",
        "escalate": true,
        "metadata": {
          "averageRequestsPerDay": 469,
          "uniqueUserAgents": 1,
          "clientFingerprint": "python-requests/2.28.1"
        }
      },
      "schema": "https://specs.x402.org/extensions/diagnostic.json"
    }
  }
}
```

---

## Diagnostic Codes

The `code` field provides a **machine-readable enum** that autonomous agents can parse and act upon. Implementations **MUST** support these standard codes:

### `PAYMENT_REQUIRED`
**Standard first-request 402** with no prior payment attempts detected. This is the baseline case for legitimate payment discovery.

**Agent Action**: Parse payment requirements and attempt payment.

---

### `INVOICE_EXPIRED` 
**Payment was attempted but invoice/challenge expired** before settlement could be completed. Common in Lightning Network scenarios or time-sensitive payment schemes.

**Agent Action**: Retry with fresh payment requirements. Consider shorter processing time.

---

### `PAYMENT_UNVERIFIED`
**Payment header present but signature verification failed**. The client submitted payment information but it could not be cryptographically verified.

**Agent Action**: Check wallet configuration, key management, and signature generation logic.

---

### `WALLET_INSUFFICIENT_FUNDS`
**Payment attempted but on-chain wallet balance insufficient** to cover the required amount plus gas/network fees.

**Agent Action**: Fund wallet or reduce payment amounts. Check balance before retrying.

---

### `PAYMENT_ATTEMPTS_EXCEEDED`
**Many payment attempts with no successful settlement**. The server has detected a pattern of repeated failures indicating broken payment logic rather than legitimate retry behavior.

**Agent Action**: Stop retrying. Log error. Alert human operator for manual intervention.

---

### `OPERATOR_ALERT`
**Critical failure requiring human escalation**. The server has determined that autonomous resolution is unlikely and human intervention is required.

**Agent Action**: Immediately stop retrying. Surface to human operator through alerting, logging, or ticketing systems.

---

## Schema Definition

The `diagnostic` extension info object **MUST** conform to this JSON Schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://specs.x402.org/extensions/diagnostic.json",
  "title": "x402 Diagnostic Extension",
  "description": "Payment failure signaling for autonomous agents",
  "type": "object",
  "required": ["code", "message", "escalate"],
  "properties": {
    "code": {
      "type": "string",
      "enum": [
        "PAYMENT_REQUIRED",
        "INVOICE_EXPIRED", 
        "PAYMENT_UNVERIFIED",
        "WALLET_INSUFFICIENT_FUNDS",
        "PAYMENT_ATTEMPTS_EXCEEDED",
        "OPERATOR_ALERT"
      ],
      "description": "Machine-readable diagnostic code for agent decision-making"
    },
    "message": {
      "type": "string",
      "maxLength": 512,
      "description": "Human-readable description of the payment issue"
    },
    "attempts": {
      "type": "integer",
      "minimum": 0,
      "description": "Number of payment attempts from this client"
    },
    "firstAttempt": {
      "type": "string",
      "format": "date-time", 
      "description": "ISO 8601 timestamp of first payment attempt"
    },
    "lastAttempt": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp of most recent payment attempt"
    },
    "suggestion": {
      "type": "string",
      "maxLength": 256,
      "description": "Actionable suggestion for resolving the payment issue"
    },
    "helpUrl": {
      "type": "string",
      "format": "uri",
      "description": "URL to troubleshooting documentation or support resources"
    },
    "escalate": {
      "type": "boolean",
      "description": "Whether the agent should escalate to human operator"
    },
    "metadata": {
      "type": "object",
      "description": "Optional server-specific diagnostic metadata",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```

---

## Client Implementation Guidelines

### Parsing Diagnostic Information

Clients **SHOULD** parse the `diagnostic` extension when present and implement appropriate response logic:

```typescript
interface DiagnosticInfo {
  code: DiagnosticCode;
  message: string;
  attempts?: number;
  firstAttempt?: string;
  lastAttempt?: string;
  suggestion?: string;
  helpUrl?: string;
  escalate: boolean;
  metadata?: Record<string, any>;
}

function handlePaymentDiagnostic(diagnostic: DiagnosticInfo): PaymentAction {
  switch (diagnostic.code) {
    case 'PAYMENT_REQUIRED':
      return { action: 'retry', delay: 0 };
      
    case 'INVOICE_EXPIRED':
      return { action: 'retry', delay: 1000 };
      
    case 'PAYMENT_UNVERIFIED':
      return { 
        action: 'checkConfiguration', 
        error: 'Payment signature verification failed' 
      };
      
    case 'WALLET_INSUFFICIENT_FUNDS':
      return { 
        action: 'checkBalance', 
        error: 'Insufficient wallet balance for payment' 
      };
      
    case 'PAYMENT_ATTEMPTS_EXCEEDED':
    case 'OPERATOR_ALERT':
      return { 
        action: 'escalate', 
        error: diagnostic.message,
        escalate: true 
      };
      
    default:
      return { action: 'retry', delay: 5000 };
  }
}
```

### Escalation Behavior

When `escalate: true` is set, clients **MUST**:

1. **Stop automatic retries** to prevent resource waste
2. **Log the diagnostic information** for human review
3. **Alert operators** through configured channels (email, Slack, PagerDuty, etc.)
4. **Surface the error** in monitoring dashboards or agent status interfaces

### Retry Logic

Clients **SHOULD** implement exponential backoff with jitter for retriable error codes and **MUST NOT** retry when escalation is required:

```typescript
function getRetryDelay(diagnostic: DiagnosticInfo, attemptCount: number): number | null {
  if (diagnostic.escalate) {
    return null; // No retry on escalation
  }
  
  const baseDelay = getBaseDelay(diagnostic.code);
  return Math.min(baseDelay * Math.pow(2, attemptCount) + jitter(), MAX_RETRY_DELAY);
}

function getBaseDelay(code: DiagnosticCode): number {
  switch (code) {
    case 'PAYMENT_REQUIRED': return 0;
    case 'INVOICE_EXPIRED': return 1000;
    case 'PAYMENT_UNVERIFIED': return 5000;
    case 'WALLET_INSUFFICIENT_FUNDS': return 30000;
    default: return 10000;
  }
}
```

---

## Server Implementation Guidelines

### Tracking Payment Attempts

Servers **SHOULD** track payment attempts per client identifier (IP address, user agent, wallet address, or custom client ID) to provide accurate diagnostic information:

```typescript
interface ClientAttemptData {
  attempts: number;
  firstAttempt: Date;
  lastAttempt: Date;
  lastError?: string;
  successfulPayments: number;
}

class DiagnosticTracker {
  private attempts = new Map<string, ClientAttemptData>();
  
  recordAttempt(clientId: string, error?: string): ClientAttemptData {
    const existing = this.attempts.get(clientId);
    const now = new Date();
    
    if (!existing) {
      const data = {
        attempts: 1,
        firstAttempt: now,
        lastAttempt: now,
        lastError: error,
        successfulPayments: 0
      };
      this.attempts.set(clientId, data);
      return data;
    }
    
    existing.attempts++;
    existing.lastAttempt = now;
    existing.lastError = error;
    return existing;
  }
  
  recordSuccess(clientId: string): void {
    const data = this.attempts.get(clientId);
    if (data) {
      data.successfulPayments++;
      // Reset attempt counter on successful payment
      data.attempts = 0;
    }
  }
}
```

### Diagnostic Code Selection

Servers **SHOULD** use this decision tree for selecting appropriate diagnostic codes:

```typescript
function getDiagnosticCode(
  clientData: ClientAttemptData,
  paymentError?: PaymentError
): DiagnosticCode {
  // First request
  if (clientData.attempts <= 1) {
    return 'PAYMENT_REQUIRED';
  }
  
  // Specific payment errors
  if (paymentError) {
    switch (paymentError.type) {
      case 'EXPIRED_INVOICE': return 'INVOICE_EXPIRED';
      case 'SIGNATURE_INVALID': return 'PAYMENT_UNVERIFIED';
      case 'INSUFFICIENT_BALANCE': return 'WALLET_INSUFFICIENT_FUNDS';
    }
  }
  
  // Too many attempts with no success
  const daysSinceFirst = daysBetween(clientData.firstAttempt, new Date());
  if (clientData.attempts > 1000 && daysSinceFirst > 1) {
    return 'PAYMENT_ATTEMPTS_EXCEEDED';
  }
  
  // Escalation threshold
  if (clientData.attempts > 10000 || daysSinceFirst > 7) {
    return 'OPERATOR_ALERT';
  }
  
  return 'PAYMENT_REQUIRED';
}
```

---

## Backward Compatibility

The diagnostic extension is **fully backward compatible**:

- **Existing clients** that don't parse extensions will continue to work normally
- **New clients** can optionally parse diagnostic information for improved error handling
- **Servers** can add diagnostic information without breaking existing integrations

The extension is designed to **gracefully degrade** — if a client doesn't understand the diagnostic code, it can fall back to standard retry behavior while still benefiting from the human-readable message field.

---

## Security Considerations

### Information Disclosure

Servers **MUST** be careful not to expose sensitive information through diagnostic messages or metadata. Diagnostic information **SHOULD**:

- Provide actionable guidance without revealing internal system details
- Avoid exposing wallet addresses, private keys, or other credentials  
- Not reveal rate limiting thresholds that could be exploited
- Focus on client-actionable information rather than server state

### Rate Limiting

Servers **MAY** implement rate limiting on diagnostic extension responses to prevent abuse:

- Limit detailed diagnostic information to a reasonable number of attempts
- Provide simplified diagnostics after threshold exceeded
- Consider client reputation/history when providing diagnostic detail

### Client Identity

Servers **SHOULD** use stable but privacy-preserving client identifiers when tracking attempts:

- Prefer wallet addresses over IP addresses where possible
- Use hashed identifiers for user agents or other fingerprinting data
- Implement data retention policies for attempt tracking data
- Consider GDPR/privacy implications of tracking client behavior

---

## Example Use Cases

### Oracle API with Broken Client
```json
{
  "diagnostic": {
    "info": {
      "code": "PAYMENT_ATTEMPTS_EXCEEDED",
      "message": "8,432 payment attempts over 18 days with zero successful settlements",
      "attempts": 8432,
      "firstAttempt": "2026-03-10T00:00:00Z",
      "suggestion": "Check wallet configuration and payment signing logic",
      "helpUrl": "https://docs.oracle.com/payment-troubleshooting",
      "escalate": true
    }
  }
}
```

### Lightning Network Invoice Expiry
```json
{
  "diagnostic": {
    "info": {
      "code": "INVOICE_EXPIRED",
      "message": "Lightning invoice expired before settlement",
      "attempts": 3,
      "suggestion": "Retry with shorter payment processing time",
      "escalate": false
    }
  }
}
```

### Wallet Balance Issue
```json
{
  "diagnostic": {
    "info": {
      "code": "WALLET_INSUFFICIENT_FUNDS",
      "message": "Wallet balance insufficient for payment plus gas fees",
      "attempts": 12,
      "suggestion": "Fund wallet or reduce payment amount",
      "helpUrl": "https://docs.provider.com/funding-guide",
      "escalate": false
    }
  }
}
```

---

## Related Extensions

- **[`bazaar`](./bazaar.md)**: Service discovery and cataloging
- **[`payment_identifier`](./payment_identifier.md)**: Payment correlation and tracking
- **[`sign-in-with-x`](./sign-in-with-x.md)**: Authentication flows

The diagnostic extension complements these by providing essential error communication capabilities for the autonomous agent payment ecosystem.
# Lifecycle Hooks

Lifecycle hooks provide a powerful way to customize x402 payment flows by executing code at specific points during payment verification and settlement. They enable advanced use cases like logging, analytics, access control, rate limiting, and custom validation without modifying the core protocol.

---

## Overview

Lifecycle hooks are functions that execute at key stages of the payment flow. They're implemented through the [extension system](../extensions/overview.md), allowing you to add custom logic while keeping your code modular and maintainable.

### Why Use Lifecycle Hooks?

**Common use cases:**
- **Logging & Analytics**: Track payment attempts, success rates, and revenue
- **Access Control**: Implement custom authorization logic
- **Rate Limiting**: Prevent abuse by limiting requests per user
- **Custom Validation**: Add business-specific payment rules
- **Metadata Enrichment**: Attach additional data to payments
- **Error Handling**: Implement custom error recovery strategies
- **Notifications**: Send alerts on payment events

### Hook Architecture

Hooks operate at **Layer 3** (Extension Layer) of the x402 architecture:

```
┌─────────────────────────────────────┐
│   Extension Layer (Hooks)           │
│   beforeVerify → afterVerify        │
│   beforeSettle → afterSettle        │
├─────────────────────────────────────┤
│   Scheme Layer (exact, upto)        │
├─────────────────────────────────────┤
│   Transport Layer (HTTP 402)        │
└─────────────────────────────────────┘
```

---

## Available Hooks

x402 provides five lifecycle hooks that cover the complete payment flow:

### 1. `beforeVerify`

**When it runs:** Before payment verification begins

**Purpose:** Validate request parameters, check rate limits, log incoming payments

**Signature:**
```typescript
beforeVerify?: (context: VerifyContext) => Promise<void> | void;
```

**Context includes:**
- `route`: The endpoint being accessed
- `paymentPayload`: The payment data from the client
- `payerAddress`: The wallet address making the payment
- `amount`: The payment amount
- `network`: The CAIP-2 network identifier
- `requestHeaders`: HTTP headers from the request
- `timestamp`: When the request was received

**Example:**
```typescript
beforeVerify: async (context) => {
  console.log(`Payment verification starting for ${context.route}`);
  console.log(`Payer: ${context.payerAddress}`);
  console.log(`Amount: ${context.amount}`);
  
  // Custom validation
  if (context.amount < minimumPayment) {
    throw new Error("Payment amount below minimum");
  }
}
```

---

### 2. `afterVerify`

**When it runs:** After payment verification completes (success or failure)

**Purpose:** Log verification results, update analytics, handle verification failures

**Signature:**
```typescript
afterVerify?: (context: VerifyContext, result: VerifyResult) => Promise<void> | void;
```

**Result includes:**
- `valid`: Boolean indicating if verification succeeded
- `error`: Error message if verification failed
- `verificationTime`: Time taken to verify (milliseconds)
- `facilitatorResponse`: Raw response from facilitator

**Example:**
```typescript
afterVerify: async (context, result) => {
  if (result.valid) {
    console.log(`✓ Payment verified for ${context.payerAddress}`);
    await analytics.trackVerification({
      payer: context.payerAddress,
      amount: context.amount,
      success: true
    });
  } else {
    console.error(`✗ Verification failed: ${result.error}`);
    await analytics.trackVerification({
      payer: context.payerAddress,
      amount: context.amount,
      success: false,
      error: result.error
    });
  }
}
```

---

### 3. `beforeSettle`

**When it runs:** Before payment settlement on-chain

**Purpose:** Final validation, prepare settlement data, log settlement attempts

**Signature:**
```typescript
beforeSettle?: (context: SettleContext) => Promise<void> | void;
```

**Context includes:**
- All properties from `VerifyContext`
- `verificationResult`: The result from verification
- `settlementParams`: Parameters for the on-chain transaction
- `estimatedGas`: Estimated gas cost for settlement

**Example:**
```typescript
beforeSettle: async (context) => {
  console.log(`Settling payment on ${context.network}`);
  console.log(`Estimated gas: ${context.estimatedGas}`);
  
  // Log to database
  await db.payments.create({
    payer: context.payerAddress,
    amount: context.amount,
    network: context.network,
    status: 'settling',
    timestamp: new Date()
  });
}
```

---

### 4. `afterSettle`

**When it runs:** After payment settlement completes on-chain

**Purpose:** Log transaction hashes, update revenue tracking, trigger fulfillment

**Signature:**
```typescript
afterSettle?: (context: SettleContext, result: SettleResult) => Promise<void> | void;
```

**Result includes:**
- `success`: Boolean indicating if settlement succeeded
- `transactionHash`: On-chain transaction hash
- `blockNumber`: Block number where transaction was included
- `gasUsed`: Actual gas consumed
- `settlementTime`: Time taken to settle (milliseconds)
- `error`: Error message if settlement failed

**Example:**
```typescript
afterSettle: async (context, result) => {
  if (result.success) {
    console.log(`✓ Payment settled: ${result.transactionHash}`);
    console.log(`Block: ${result.blockNumber}, Gas: ${result.gasUsed}`);
    
    // Update database
    await db.payments.update({
      where: { payer: context.payerAddress },
      data: {
        status: 'settled',
        transactionHash: result.transactionHash,
        blockNumber: result.blockNumber,
        gasUsed: result.gasUsed
      }
    });
    
    // Trigger fulfillment
    await fulfillmentService.processOrder(context.payerAddress);
  } else {
    console.error(`✗ Settlement failed: ${result.error}`);
  }
}
```

---

### 5. `onError`

**When it runs:** When an error occurs in any phase

**Purpose:** Error logging, alerting, cleanup, error recovery

**Signature:**
```typescript
onError?: (context: ErrorContext, error: Error) => Promise<void> | void;
```

**Context includes:**
- `phase`: Which phase the error occurred in ('verify' | 'settle')
- `payerAddress`: The wallet address involved
- `route`: The endpoint being accessed
- `timestamp`: When the error occurred
- `originalContext`: The full context from the failed operation

**Example:**
```typescript
onError: async (context, error) => {
  console.error(`Error in ${context.phase} phase: ${error.message}`);
  
  // Send alert for critical errors
  if (error.message.includes('facilitator')) {
    await alerting.sendAlert({
      severity: 'high',
      message: `Facilitator error: ${error.message}`,
      context: context
    });
  }
  
  // Log to error tracking service
  await errorTracker.captureException(error, {
    tags: {
      phase: context.phase,
      route: context.route
    },
    user: {
      id: context.payerAddress
    }
  });
}
```

---

## Hook Execution Order

When multiple extensions are configured, hooks execute in the order extensions appear in the array:

```typescript
extensions: [
  extensionA(), // Hooks run first
  extensionB(), // Hooks run second
  extensionC()  // Hooks run third
]
```

### Complete Flow Example

```typescript
// Configuration
extensions: [
  loggingExtension(),
  analyticsExtension(),
  rateLimitExtension()
]

// Execution order:
1. loggingExtension.beforeVerify()
2. analyticsExtension.beforeVerify()
3. rateLimitExtension.beforeVerify()
4. [VERIFICATION HAPPENS]
5. loggingExtension.afterVerify()
6. analyticsExtension.afterVerify()
7. rateLimitExtension.afterVerify()
8. loggingExtension.beforeSettle()
9. analyticsExtension.beforeSettle()
10. rateLimitExtension.beforeSettle()
11. [SETTLEMENT HAPPENS]
12. loggingExtension.afterSettle()
13. analyticsExtension.afterSettle()
14. rateLimitExtension.afterSettle()
```

### Error Handling in Chain

If a hook throws an error:
- Subsequent hooks in the chain **do not execute**
- The `onError` hook is called for all extensions
- The payment flow is aborted

```typescript
// If analyticsExtension.beforeVerify() throws:
1. loggingExtension.beforeVerify() ✓
2. analyticsExtension.beforeVerify() ✗ THROWS ERROR
3. rateLimitExtension.beforeVerify() ✗ SKIPPED
4. loggingExtension.onError() ✓
5. analyticsExtension.onError() ✓
6. rateLimitExtension.onError() ✓
7. Payment flow aborted
```

---

## Practical Examples

### Example 1: Logging Extension

Track all payment events with detailed logging:

```typescript
import { X402Extension, VerifyContext, SettleContext } from "@x402/core";

export function loggingExtension(options: {
  logLevel: "info" | "debug" | "verbose";
}): X402Extension {
  const log = (level: string, message: string, data?: any) => {
    if (shouldLog(level, options.logLevel)) {
      console.log(`[${level.toUpperCase()}] ${message}`, data || '');
    }
  };

  return {
    name: "logging",
    version: "1.0.0",
    
    beforeVerify: async (context: VerifyContext) => {
      log("info", `Verifying payment for ${context.route}`, {
        payer: context.payerAddress,
        amount: context.amount,
        network: context.network
      });
    },
    
    afterVerify: async (context: VerifyContext, result) => {
      if (result.valid) {
        log("info", "Payment verified successfully", {
          payer: context.payerAddress,
          verificationTime: result.verificationTime
        });
      } else {
        log("error", "Payment verification failed", {
          payer: context.payerAddress,
          error: result.error
        });
      }
    },
    
    beforeSettle: async (context: SettleContext) => {
      log("info", "Settling payment on-chain", {
        network: context.network,
        estimatedGas: context.estimatedGas
      });
    },
    
    afterSettle: async (context: SettleContext, result) => {
      if (result.success) {
        log("info", "Payment settled successfully", {
          transactionHash: result.transactionHash,
          blockNumber: result.blockNumber,
          gasUsed: result.gasUsed
        });
      } else {
        log("error", "Payment settlement failed", {
          error: result.error
        });
      }
    },
    
    onError: async (context, error) => {
      log("error", `Error in ${context.phase} phase`, {
        error: error.message,
        stack: error.stack,
        route: context.route
      });
    }
  };
}

function shouldLog(messageLevel: string, configLevel: string): boolean {
  const levels = { info: 0, debug: 1, verbose: 2 };
  return levels[messageLevel] <= levels[configLevel];
}
```

---

### Example 2: Analytics Extension

Track payment metrics and revenue:

```typescript
import { X402Extension, VerifyContext, SettleContext } from "@x402/core";

interface AnalyticsOptions {
  trackRevenue: boolean;
  trackUsage: boolean;
  analyticsEndpoint?: string;
}

export function analyticsExtension(options: AnalyticsOptions): X402Extension {
  const metrics = {
    totalRequests: 0,
    successfulPayments: 0,
    failedPayments: 0,
    totalRevenue: 0
  };

  const sendAnalytics = async (event: string, data: any) => {
    if (options.analyticsEndpoint) {
      try {
        await fetch(options.analyticsEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event, data, timestamp: new Date() })
        });
      } catch (error) {
        console.error('Analytics error:', error);
      }
    }
  };

  return {
    name: "analytics",
    version: "1.0.0",
    
    beforeVerify: async (context: VerifyContext) => {
      if (options.trackUsage) {
        metrics.totalRequests++;
        await sendAnalytics('payment_attempt', {
          route: context.route,
          payer: context.payerAddress,
          amount: context.amount,
          network: context.network
        });
      }
    },
    
    afterVerify: async (context: VerifyContext, result) => {
      if (result.valid) {
        metrics.successfulPayments++;
      } else {
        metrics.failedPayments++;
        await sendAnalytics('payment_failed', {
          payer: context.payerAddress,
          error: result.error
        });
      }
    },
    
    afterSettle: async (context: SettleContext, result) => {
      if (result.success && options.trackRevenue) {
        const revenue = parseFloat(context.amount);
        metrics.totalRevenue += revenue;
        
        await sendAnalytics('payment_settled', {
          payer: context.payerAddress,
          amount: context.amount,
          revenue: revenue,
          transactionHash: result.transactionHash,
          gasUsed: result.gasUsed
        });
      }
    }
  };
}
```

---

### Example 3: Access Control Extension

Implement custom authorization logic:

```typescript
import { X402Extension, VerifyContext } from "@x402/core";

interface AccessControlOptions {
  allowlist?: string[];
  blocklist?: string[];
  requireKYC?: boolean;
  checkReputation?: boolean;
}

export function accessControlExtension(options: AccessControlOptions): X402Extension {
  const isAllowed = async (address: string): Promise<boolean> => {
    // Check blocklist
    if (options.blocklist?.includes(address.toLowerCase())) {
      return false;
    }
    
    // Check allowlist (if configured, only allowlist can access)
    if (options.allowlist && options.allowlist.length > 0) {
      return options.allowlist.includes(address.toLowerCase());
    }
    
    // Check KYC status
    if (options.requireKYC) {
      const kycStatus = await checkKYCStatus(address);
      if (!kycStatus.verified) {
        return false;
      }
    }
    
    // Check reputation
    if (options.checkReputation) {
      const reputation = await getReputation(address);
      if (reputation.score < 50) {
        return false;
      }
    }
    
    return true;
  };

  return {
    name: "access-control",
    version: "1.0.0",
    
    beforeVerify: async (context: VerifyContext) => {
      const allowed = await isAllowed(context.payerAddress);
      
      if (!allowed) {
        throw new Error(`Access denied for address ${context.payerAddress}`);
      }
    }
  };
}

async function checkKYCStatus(address: string) {
  // Implementation would call KYC service
  return { verified: true };
}

async function getReputation(address: string) {
  // Implementation would call reputation service
  return { score: 75 };
}
```

---

### Example 4: Rate Limiting Extension

Prevent abuse by limiting requests per user:

```typescript
import { X402Extension, VerifyContext } from "@x402/core";

interface RateLimitOptions {
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  maxRequestsPerDay: number;
}

interface RateLimitStats {
  minute: number;
  hour: number;
  day: number;
  lastReset: {
    minute: Date;
    hour: Date;
    day: Date;
  };
}

export function rateLimitExtension(options: RateLimitOptions): X402Extension {
  const stats = new Map<string, RateLimitStats>();

  const checkAndUpdateLimits = (address: string): void => {
    const now = new Date();
    let userStats = stats.get(address);

    // Initialize if new user
    if (!userStats) {
      userStats = {
        minute: 0,
        hour: 0,
        day: 0,
        lastReset: { minute: now, hour: now, day: now }
      };
      stats.set(address, userStats);
    }

    // Reset counters if time windows have passed
    const minutesPassed = (now.getTime() - userStats.lastReset.minute.getTime()) / 60000;
    const hoursPassed = (now.getTime() - userStats.lastReset.hour.getTime()) / 3600000;
    const daysPassed = (now.getTime() - userStats.lastReset.day.getTime()) / 86400000;

    if (minutesPassed >= 1) {
      userStats.minute = 0;
      userStats.lastReset.minute = now;
    }
    if (hoursPassed >= 1) {
      userStats.hour = 0;
      userStats.lastReset.hour = now;
    }
    if (daysPassed >= 1) {
      userStats.day = 0;
      userStats.lastReset.day = now;
    }

    // Check limits
    if (userStats.minute >= options.maxRequestsPerMinute) {
      throw new Error(`Rate limit exceeded: ${options.maxRequestsPerMinute} requests per minute`);
    }
    if (userStats.hour >= options.maxRequestsPerHour) {
      throw new Error(`Rate limit exceeded: ${options.maxRequestsPerHour} requests per hour`);
    }
    if (userStats.day >= options.maxRequestsPerDay) {
      throw new Error(`Rate limit exceeded: ${options.maxRequestsPerDay} requests per day`);
    }

    // Increment counters
    userStats.minute++;
    userStats.hour++;
    userStats.day++;
  };

  return {
    name: "rate-limit",
    version: "1.0.0",
    
    beforeVerify: async (context: VerifyContext) => {
      checkAndUpdateLimits(context.payerAddress);
    }
  };
}
```

---

### Example 5: Metadata Enrichment Extension

Attach additional data to payments:

```typescript
import { X402Extension, VerifyContext, SettleContext } from "@x402/core";

interface MetadataOptions {
  includeGeoLocation?: boolean;
  includeUserAgent?: boolean;
  includeTimestamp?: boolean;
  customFields?: Record<string, any>;
}

export function metadataExtension(options: MetadataOptions): X402Extension {
  const enrichMetadata = async (context: VerifyContext) => {
    const metadata: Record<string, any> = {};

    if (options.includeTimestamp) {
      metadata.timestamp = new Date().toISOString();
    }

    if (options.includeUserAgent && context.requestHeaders) {
      metadata.userAgent = context.requestHeaders['user-agent'];
    }

    if (options.includeGeoLocation && context.requestHeaders) {
      const ip = context.requestHeaders['x-forwarded-for'] ||
                 context.requestHeaders['x-real-ip'];
      if (ip) {
        metadata.geoLocation = await getGeoLocation(ip);
      }
    }

    if (options.customFields) {
      Object.assign(metadata, options.customFields);
    }

    // Attach metadata to context for use in other hooks
    (context as any).metadata = metadata;
  };

  return {
    name: "metadata",
    version: "1.0.0",
    
    beforeVerify: async (context: VerifyContext) => {
      await enrichMetadata(context);
    },
    
    afterSettle: async (context: SettleContext, result) => {
      if (result.success) {
        // Log enriched metadata with settlement
        console.log('Payment settled with metadata:', {
          transactionHash: result.transactionHash,
          metadata: (context as any).metadata
        });
      }
    }
  };
}

async function getGeoLocation(ip: string) {
  // Implementation would call geo-location service
  return { country: 'US', city: 'San Francisco' };
}
```

---

## Best Practices

### 1. Keep Hooks Fast

Hooks should execute quickly to avoid blocking the payment flow:

```typescript
// ✓ Good: Fast, non-blocking
afterSettle: async (context, result) => {
  // Fire and forget for non-critical operations
  sendNotification(context).catch(console.error);
};

// ✗ Avoid: Slow, blocking operations
afterSettle: async (context, result) => {
  // This blocks the response
  await slowExternalApiCall(context);
};
```

### 2. Handle Errors Gracefully

Don't let hook failures break the payment flow:

```typescript
// ✓ Good: Catches and logs errors
afterVerify: async (context, result) => {
  try {
    await sendAnalytics(context);
  } catch (error) {
    console.error('Analytics error:', error);
    // Don't throw - analytics failure shouldn't block payments
  }
};

// ✗ Avoid: Unhandled errors
afterVerify: async (context, result) => {
  await sendAnalytics(context); // If this throws, payment fails
};
```

### 3. Use Appropriate Hooks

Choose the right hook for your use case:

```typescript
// ✓ Good: Validation in beforeVerify
beforeVerify: async (context) => {
  if (!isValidAmount(context.amount)) {
    throw new Error('Invalid amount');
  }
};

// ✗ Avoid: Validation in afterSettle (too late)
afterSettle: async (context, result) => {
  if (!isValidAmount(context.amount)) {
    // Payment already settled!
    throw new Error('Invalid amount');
  }
};
```

### 4. Avoid State Mutations

Don't modify the context object:

```typescript
// ✓ Good: Read-only access
beforeVerify: async (context) => {
  console.log(context.amount);
};

// ✗ Avoid: Mutating context
beforeVerify: async (context) => {
  context.amount = "999"; // Don't do this!
};
```

### 5. Document Your Hooks

Provide clear documentation for custom extensions:

```typescript
/**
 * Custom validation extension
 *
 * @param options Configuration options
 * @param options.minAmount Minimum payment amount (default: $0.001)
 * @param options.maxAmount Maximum payment amount (default: $1000)
 *
 * @example
 * ```typescript
 * extensions: [
 *   validationExtension({
 *     minAmount: "$0.01",
 *     maxAmount: "$100"
 *   })
 * ]
 * ```
 */
export function validationExtension(options: ValidationOptions): X402Extension {
  // Implementation
}
```

### 6. Test Hooks Independently

Write unit tests for your hook logic:

```typescript
import { describe, it, expect } from "vitest";
import { rateLimitExtension } from "./rate-limit";

describe("rateLimitExtension", () => {
  it("should allow requests within limit", async () => {
    const ext = rateLimitExtension({ maxRequestsPerMinute: 10 });
    const context = createMockContext();
    
    // Should not throw
    await ext.beforeVerify?.(context);
  });

  it("should block requests exceeding limit", async () => {
    const ext = rateLimitExtension({ maxRequestsPerMinute: 1 });
    const context = createMockContext();
    
    await ext.beforeVerify?.(context); // First request OK
    
    // Second request should throw
    await expect(ext.beforeVerify?.(context)).rejects.toThrow('Rate limit exceeded');
  });
});
```

---

## Error Handling Patterns

### Pattern 1: Graceful Degradation

Allow the payment to proceed even if non-critical operations fail:

```typescript
afterSettle: async (context, result) => {
  // Critical: Must succeed
  await updateDatabase(context, result);
  
  // Non-critical: Can fail gracefully
  try {
    await sendEmail(context);
  } catch (error) {
    console.error('Email failed:', error);
    // Continue anyway
  }
  
  try {
    await updateCache(context);
  } catch (error) {
    console.error('Cache update failed:', error);
    // Continue anyway
  }
}
```

### Pattern 2: Retry Logic

Retry failed operations with exponential backoff:

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
  throw new Error('Max retries exceeded');
}

afterSettle: async (context, result) => {
  await withRetry(() => sendWebhook(context, result));
}
```

### Pattern 3: Circuit Breaker

Prevent cascading failures by temporarily disabling failing operations:

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailure: Date | null = null;
  private isOpen = false;

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen) {
      const timeSinceFailure = Date.now() - (this.lastFailure?.getTime() || 0);
      if (timeSinceFailure < 60000) { // 1 minute cooldown
        throw new Error('Circuit breaker is open');
      }
      this.isOpen = false;
      this.failures = 0;
    }

    try {
      const result = await fn();
      this.failures = 0;
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailure = new Date();
      if (this.failures >= 5) {
        this.isOpen = true;
      }
      throw error;
    }
  }
}

const breaker = new CircuitBreaker();

afterSettle: async (context, result) => {
  try {
    await breaker.execute(() => externalService.notify(context));
  } catch (error) {
    console.error('External service unavailable:', error);
  }
}
```

---

## Performance Considerations

### 1. Async Operations

Use `Promise.all()` for parallel operations:

```typescript
// ✓ Good: Parallel execution
afterSettle: async (context, result) => {
  await Promise.all([
    updateDatabase(context),
    sendNotification(context),
    updateCache(context)
  ]);
};

// ✗ Avoid: Sequential execution
afterSettle: async (context, result) => {
  await updateDatabase(context);
  await sendNotification(context);
  await updateCache(context);
};
```

### 2. Caching

Cache expensive operations:

```typescript
const cache = new Map<string, any>();

beforeVerify: async (context) => {
  const cacheKey = `reputation:${context.payerAddress}`;
  
  let reputation = cache.get(cacheKey);
  if (!reputation) {
    reputation = await fetchReputation(context.payerAddress);
    cache.set(cacheKey, reputation);
    // Expire after 5 minutes
    setTimeout(() => cache.delete(cacheKey), 300000);
  }
  
  if (reputation.score < 50) {
    throw new Error('Low reputation score');
  }
}
```

### 3. Batching

Batch multiple operations together:

```typescript
const pendingAnalytics: any[] = [];
let flushTimer: NodeJS.Timeout | null = null;

const flushAnalytics = async () => {
  if (pendingAnalytics.length === 0) return;
  
  const batch = [...pendingAnalytics];
  pendingAnalytics.length = 0;
  
  try {
    await analyticsService.sendBatch(batch);
  } catch (error) {
    console.error('Analytics batch failed:', error);
  }
};

afterSettle: async (context, result) => {
  pendingAnalytics.push({
    payer: context.payerAddress,
    amount: context.amount,
    transactionHash: result.transactionHash
  });
  
  // Flush after 1 second or 100 items
  if (pendingAnalytics.length >= 100) {
    await flushAnalytics();
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushAnalytics();
    }, 1000);
  }
}
```

### 4. Memory Management

Clean up resources and prevent memory leaks:

```typescript
const rateLimitStats = new Map<string, RateLimitStats>();

// Periodically clean up old entries
setInterval(() => {
  const now = Date.now();
  for (const [address, stats] of rateLimitStats.entries()) {
    const age = now - stats.lastReset.day.getTime();
    if (age > 86400000 * 7) { // 7 days
      rateLimitStats.delete(address);
    }
  }
}, 3600000); // Run every hour
```

---

## Summary

Lifecycle hooks provide powerful customization capabilities for x402 payment flows:

- **Five hooks** cover the complete payment lifecycle
- **Execution order** is determined by extension array order
- **Error handling** is critical for production reliability
- **Performance** considerations ensure hooks don't slow down payments
- **Best practices** help you write maintainable, robust hooks

**Next steps:**
- [Extensions Overview](../extensions/overview.md) - Learn about the extension system
- [Protocol Layers](../core-concepts/protocol-layers.md) - Understand the architecture
- [Quickstart for Sellers](../getting-started/quickstart
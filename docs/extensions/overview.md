# Extensions Overview

x402 V2 introduces a powerful **extension system** that allows developers to add optional features to their payment flows without modifying the core protocol. Extensions are modular, composable plugins that enhance x402's capabilities while keeping the base implementation lightweight.

### What Are Extensions?

Extensions are optional modules that add functionality to x402 payment flows. They operate at **Layer 3** of the x402 architecture (see [Protocol Layers](../core-concepts/protocol-layers.md)), sitting above the transport and scheme layers.

**Key characteristics:**
- **Opt-in**: Only include extensions you need
- **Composable**: Combine multiple extensions in a single configuration
- **Non-breaking**: Extensions don't affect core protocol behavior
- **Lifecycle-aware**: Hook into payment verification and settlement events

### Why Extensions Exist

The extension system solves several design challenges:

1. **Modularity**: Keep the core protocol simple while supporting advanced features
2. **Flexibility**: Different use cases need different capabilities
3. **Extensibility**: Community can build custom extensions without forking
4. **Performance**: Only load and execute features you actually use
5. **Compatibility**: Extensions are optional, so clients without extension support can still use the service

---

## Available Extensions

### 1. Bazaar Discovery Extension (Available Now)

Enables automatic service discovery and marketplace integration.

**Features:**
- Automatic endpoint registration with facilitator discovery services
- Machine-readable service catalogs
- AI agent discovery
- Input/output schema documentation

**Learn more:** [Bazaar Discovery](bazaar.md)

### 2. Analytics Extension (Coming Soon)

Track payment metrics and usage patterns.

**Planned features:**
- Request/payment analytics
- Revenue tracking
- Usage patterns and trends
- Custom event tracking

### 3. Reputation Extension (Planned)

Build trust through on-chain reputation scores.

**Planned features:**
- Service quality ratings
- Payment history tracking
- Dispute resolution
- Trust scores

---

## How Extensions Work

Extensions integrate with x402 middleware through the `extensions` array in your configuration. Each extension can:

1. **Modify payment requirements**: Add metadata to 402 responses
2. **Hook into lifecycle events**: Execute code during verification and settlement
3. **Store state**: Maintain extension-specific data
4. **Interact with facilitators**: Send additional data during verify/settle calls

### Basic Usage

```typescript
import { createPaymentMiddleware, exact } from "@x402/express";
import { bazaar, analytics } from "@x402/extensions";

app.use(createPaymentMiddleware({
  recipient: "0xYourAddress",
  facilitator: { url: "https://x402.org/facilitator" },
  
  // Extensions array - order matters for lifecycle hooks
  extensions: [
    bazaar({
      description: "Weather API with forecasts",
      inputSchema: {
        queryParams: {
          location: { type: "string", required: true }
        }
      }
    }),
    analytics({
      trackRevenue: true,
      trackUsage: true
    })
  ],
  
  routes: {
    "/api/weather": {
      network: "eip155:84532",
      scheme: exact({ amount: "$0.001" })
    }
  }
}));
```

---

## Extension Configuration

Extensions can be configured at two levels:

### 1. Global Configuration

Applied to all routes:

```typescript
extensions: [
  bazaar({
    // Global settings apply to all routes
    discoverable: true,
    category: "weather"
  })
]
```

### 2. Per-Route Configuration

Override global settings for specific routes:

```typescript
routes: {
  "/api/weather": {
    network: "eip155:84532",
    scheme: exact({ amount: "$0.001" }),
    extensions: {
      bazaar: {
        // Route-specific overrides
        description: "Current weather data",
        inputSchema: { /* ... */ }
      }
    }
  },
  "/api/forecast": {
    network: "eip155:84532",
    scheme: exact({ amount: "$0.01" }),
    extensions: {
      bazaar: {
        description: "7-day weather forecast",
        inputSchema: { /* ... */ }
      }
    }
  }
}
```

---

## Creating Custom Extensions

You can create custom extensions to add your own functionality to x402 payment flows.

### Extension Interface

```typescript
interface X402Extension {
  name: string;
  version: string;
  
  // Lifecycle hooks (all optional)
  beforeVerify?: (context: VerifyContext) => Promise<void> | void;
  afterVerify?: (context: VerifyContext, result: VerifyResult) => Promise<void> | void;
  beforeSettle?: (context: SettleContext) => Promise<void> | void;
  afterSettle?: (context: SettleContext, result: SettleResult) => Promise<void> | void;
  onError?: (context: ErrorContext, error: Error) => Promise<void> | void;
  
  // Modify payment requirements
  modifyPaymentRequirements?: (requirements: PaymentRequirements) => PaymentRequirements;
  
  // Extension-specific configuration
  config?: Record<string, any>;
}
```

### Example: Custom Logging Extension

```typescript
import { X402Extension, VerifyContext, SettleContext } from "@x402/core";

export function loggingExtension(options: {
  logLevel: "info" | "debug";
  includePaymentDetails: boolean;
}): X402Extension {
  return {
    name: "logging",
    version: "1.0.0",
    config: options,
    
    beforeVerify: async (context: VerifyContext) => {
      console.log(`[${options.logLevel}] Verifying payment for ${context.route}`);
      if (options.includePaymentDetails) {
        console.log(`Amount: ${context.amount}, Network: ${context.network}`);
      }
    },
    
    afterVerify: async (context: VerifyContext, result: VerifyResult) => {
      if (result.valid) {
        console.log(`[${options.logLevel}] Payment verified successfully`);
      } else {
        console.log(`[${options.logLevel}] Payment verification failed: ${result.error}`);
      }
    },
    
    beforeSettle: async (context: SettleContext) => {
      console.log(`[${options.logLevel}] Settling payment...`);
    },
    
    afterSettle: async (context: SettleContext, result: SettleResult) => {
      console.log(`[${options.logLevel}] Payment settled. TX: ${result.transactionHash}`);
    },
    
    onError: async (context: ErrorContext, error: Error) => {
      console.error(`[ERROR] Extension error in ${context.phase}: ${error.message}`);
    }
  };
}

// Usage
app.use(createPaymentMiddleware({
  recipient: "0xYourAddress",
  extensions: [
    loggingExtension({
      logLevel: "debug",
      includePaymentDetails: true
    })
  ],
  routes: { /* ... */ }
}));
```

### Example: Custom Rate Limiting Extension

```typescript
import { X402Extension, VerifyContext } from "@x402/core";

export function rateLimitExtension(options: {
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
}): X402Extension {
  const requestCounts = new Map<string, { minute: number; hour: number; lastReset: Date }>();
  
  return {
    name: "rate-limit",
    version: "1.0.0",
    config: options,
    
    beforeVerify: async (context: VerifyContext) => {
      const clientId = context.payerAddress;
      const now = new Date();
      
      // Get or initialize client stats
      let stats = requestCounts.get(clientId);
      if (!stats) {
        stats = { minute: 0, hour: 0, lastReset: now };
        requestCounts.set(clientId, stats);
      }
      
      // Reset counters if needed
      const minutesSinceReset = (now.getTime() - stats.lastReset.getTime()) / 60000;
      if (minutesSinceReset >= 60) {
        stats.hour = 0;
        stats.minute = 0;
        stats.lastReset = now;
      } else if (minutesSinceReset >= 1) {
        stats.minute = 0;
      }
      
      // Check limits
      if (stats.minute >= options.maxRequestsPerMinute) {
        throw new Error("Rate limit exceeded: too many requests per minute");
      }
      if (stats.hour >= options.maxRequestsPerHour) {
        throw new Error("Rate limit exceeded: too many requests per hour");
      }
      
      // Increment counters
      stats.minute++;
      stats.hour++;
    }
  };
}

// Usage
app.use(createPaymentMiddleware({
  recipient: "0xYourAddress",
  extensions: [
    rateLimitExtension({
      maxRequestsPerMinute: 10,
      maxRequestsPerHour: 100
    })
  ],
  routes: { /* ... */ }
}));
```

---

## Lifecycle Hooks

Extensions can hook into various stages of the payment flow:

### 1. `beforeVerify`

Called before payment verification begins.

**Use cases:**
- Validate request parameters
- Check rate limits
- Log incoming payments
- Add custom validation logic

**Context includes:**
- Route information
- Payment payload
- Request headers
- Payer address

### 2. `afterVerify`

Called after payment verification completes.

**Use cases:**
- Log verification results
- Update analytics
- Trigger notifications
- Handle verification failures

**Context includes:**
- Verification result (valid/invalid)
- Error details (if verification failed)
- Payment details

### 3. `beforeSettle`

Called before payment settlement on-chain.

**Use cases:**
- Final validation checks
- Prepare settlement data
- Log settlement attempts
- Update internal state

**Context includes:**
- Payment details
- Network information
- Settlement parameters

### 4. `afterSettle`

Called after payment settlement completes.

**Use cases:**
- Log transaction hashes
- Update revenue tracking
- Trigger fulfillment workflows
- Send confirmation notifications

**Context includes:**
- Settlement result
- Transaction hash
- Block number
- Gas used

### 5. `onError`

Called when an error occurs in any phase.

**Use cases:**
- Error logging
- Alerting
- Cleanup operations
- Error recovery

**Context includes:**
- Error phase (verify/settle)
- Error details
- Request context

### Hook Execution Order

When multiple extensions are configured, hooks execute in array order:

```typescript
extensions: [
  extensionA(), // Hooks run first
  extensionB(), // Hooks run second
  extensionC()  // Hooks run third
]
```

**Example flow:**
1. `extensionA.beforeVerify()`
2. `extensionB.beforeVerify()`
3. `extensionC.beforeVerify()`
4. **Verification happens**
5. `extensionA.afterVerify()`
6. `extensionB.afterVerify()`
7. `extensionC.afterVerify()`

---

## Extension Best Practices

### 1. Keep Extensions Focused

Each extension should do one thing well:

```typescript
// Good: Focused extension
const analyticsExtension = analytics({ trackRevenue: true });

// Avoid: Extension doing too much
const megaExtension = everything({
  analytics: true,
  logging: true,
  rateLimit: true,
  caching: true
});
```

### 2. Handle Errors Gracefully

Extensions should not break the payment flow:

```typescript
afterVerify: async (context, result) => {
  try {
    await sendAnalytics(context);
  } catch (error) {
    // Log error but don't throw - analytics failure shouldn't block payments
    console.error("Analytics error:", error);
  }
}
```

### 3. Use Async Operations Carefully

Avoid blocking the payment flow with slow operations:

```typescript
// Good: Fire and forget for non-critical operations
afterSettle: async (context, result) => {
  // Don't await - let it run in background
  sendNotification(context).catch(console.error);
};

// Avoid: Blocking on slow operations
afterSettle: async (context, result) => {
  // This blocks the response
  await slowExternalApiCall(context);
};
```

### 4. Document Configuration Options

Provide clear types and documentation:

```typescript
interface MyExtensionOptions {
  /** Enable debug logging */
  debug?: boolean;
  /** Maximum retries for failed operations */
  maxRetries?: number;
  /** Timeout in milliseconds */
  timeout?: number;
}

export function myExtension(options: MyExtensionOptions): X402Extension {
  // Implementation
}
```

### 5. Version Your Extensions

Use semantic versioning for compatibility:

```typescript
export function myExtension(): X402Extension {
  return {
    name: "my-extension",
    version: "1.2.0", // Major.Minor.Patch
    // ...
  };
}
```

### 6. Test Extensions Independently

Write unit tests for extension logic:

```typescript
import { describe, it, expect } from "vitest";
import { myExtension } from "./my-extension";

describe("myExtension", () => {
  it("should execute beforeVerify hook", async () => {
    const ext = myExtension({ debug: true });
    const context = createMockContext();
    
    await ext.beforeVerify?.(context);
    
    expect(context.modified).toBe(true);
  });
});
```

---

## Extension Discovery

Extensions can be discovered and loaded dynamically:

```typescript
import { loadExtension } from "@x402/core";

// Load extension from npm package
const customExt = await loadExtension("@mycompany/x402-custom-extension");

app.use(createPaymentMiddleware({
  recipient: "0xYourAddress",
  extensions: [
    customExt({ /* config */ })
  ],
  routes: { /* ... */ }
}));
```

---

## Publishing Extensions

To share your extension with the community:

1. **Package Structure**

```
my-x402-extension/
├── src/
│   ├── index.ts
│   └── types.ts
├── package.json
├── README.md
└── tsconfig.json
```

2. **Package.json**

```json
{
  "name": "@mycompany/x402-my-extension",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "peerDependencies": {
    "@x402/core": "^2.0.0"
  }
}
```

3. **Export Extension Factory**

```typescript
// src/index.ts
import { X402Extension } from "@x402/core";

export interface MyExtensionOptions {
  // Options
}

export function myExtension(options: MyExtensionOptions): X402Extension {
  return {
    name: "my-extension",
    version: "1.0.0",
    // Implementation
  };
}
```

4. **Document Usage**

Include clear examples in your README showing how to install and use the extension.

---

## Summary

x402 extensions provide a powerful way to enhance payment flows while keeping the core protocol simple:

- **Modular**: Add only the features you need
- **Composable**: Combine multiple extensions
- **Extensible**: Create custom extensions for your use case
- **Lifecycle-aware**: Hook into payment verification and settlement
- **Non-breaking**: Extensions don't affect core protocol compatibility

**Next steps:**
- [Bazaar Discovery Extension](bazaar.md) - Learn about service discovery
- [Protocol Layers](../core-concepts/protocol-layers.md) - Understand the layered architecture
- [Lifecycle Hooks](../advanced/lifecycle-hooks.md) - Deep dive into hooks
- [Quickstart for Sellers](../getting-started/quickstart-for-sellers.md) - Start using extensions

**Resources:**
- [Extension Examples](https://github.com/coinbase/x402/tree/main/examples/typescript/extensions)
- [Extension API Reference](https://github.com/coinbase/x402/tree/main/typescript/packages/extensions)
- [Community Extensions](https://github.com/topics/x402-extension)
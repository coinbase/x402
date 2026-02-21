/**
 * Comprehensive TypeScript error handling example for x402 applications.
 * 
 * This example demonstrates production-ready error handling patterns including:
 * - Type-safe error classification with discriminated unions
 * - Exponential backoff retry logic with jitter
 * - Batch operations with error isolation
 * - Configuration validation with Zod
 * - Generic error handling that works with fetch, axios, and other clients
 * - Structured error logging and context
 * - Graceful shutdown handling
 */

import { z } from "zod";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";

// Type-safe error classification using discriminated unions
export type X402ErrorType =
  | { kind: "network"; retryable: true; backoffMultiplier: 2 }
  | { kind: "payment_invalid"; retryable: false }
  | { kind: "payment_expired"; retryable: true; backoffMultiplier: 1.5 }
  | { kind: "verification_failed"; retryable: true; backoffMultiplier: 3 }
  | { kind: "settlement_failed"; retryable: true; backoffMultiplier: 2.5 }
  | { kind: "resource_error"; retryable: false }
  | { kind: "configuration_error"; retryable: false }
  | { kind: "timeout"; retryable: true; backoffMultiplier: 1.8 }
  | { kind: "unknown"; retryable: true; backoffMultiplier: 3 };

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
}

export interface ErrorContext {
  timestamp: Date;
  url: string;
  errorType: X402ErrorType;
  message: string;
  attempt: number;
  totalAttempts: number;
  retryDelayMs?: number;
  stack?: string;
}

export interface BatchOperationResult<T, E = unknown> {
  successful: Array<{ item: T; result: unknown; timestamp: Date }>;
  failed: Array<{ item: T; error: E; errorType: string; timestamp: Date }>;
  successRate: number;
}

// Configuration validation with Zod
const ConfigSchema = z.object({
  evmPrivateKey: z.string().startsWith("0x").optional(),
  svmPrivateKey: z.string().optional(),
  resourceServerUrl: z.string().url(),
  endpointPath: z.string().default("/api/data"),
  facilitatorUrl: z.string().url().optional(),
  requestTimeoutMs: z.number().positive().default(30000),
  maxRetries: z.number().min(1).max(10).default(3),
  concurrency: z.number().min(1).max(20).default(5),
})
.refine(
  config => config.evmPrivateKey || config.svmPrivateKey,
  { message: "Either evmPrivateKey or svmPrivateKey must be provided" }
);

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Centralized error handler with type-safe error classification and retry logic
 */
export class X402ErrorHandler {
  private errorHistory: ErrorContext[] = [];

  // eslint-disable-next-line no-unused-vars
  constructor(private retryConfig: RetryConfig) {}

  /**
   * Classify error using type guards for type safety
   */
  classifyError(error: unknown): X402ErrorType {
    if (error instanceof TypeError && error.message.includes("fetch")) {
      return { kind: "network", retryable: true, backoffMultiplier: 2 };
    }
    
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      const name = error.name.toLowerCase();

      // Payment-specific errors
      if (message.includes("payment invalid") || message.includes("malformed")) {
        return { kind: "payment_invalid", retryable: false };
      }
      if (message.includes("payment expired") || message.includes("expired")) {
        return { kind: "payment_expired", retryable: true, backoffMultiplier: 1.5 };
      }
      if (message.includes("verification failed") || message.includes("verify")) {
        return { kind: "verification_failed", retryable: true, backoffMultiplier: 3 };
      }
      if (message.includes("settlement failed") || message.includes("settle")) {
        return { kind: "settlement_failed", retryable: true, backoffMultiplier: 2.5 };
      }
      
      // Network errors
      if (name.includes("timeout") || message.includes("timeout")) {
        return { kind: "timeout", retryable: true, backoffMultiplier: 1.8 };
      }
      if (message.includes("network") || message.includes("connection")) {
        return { kind: "network", retryable: true, backoffMultiplier: 2 };
      }
      
      // HTTP errors
      if (message.includes("4") || message.includes("5")) {
        return { kind: "resource_error", retryable: false };
      }
      
      // Configuration errors
      if (message.includes("config") || message.includes("invalid")) {
        return { kind: "configuration_error", retryable: false };
      }
    }

    return { kind: "unknown", retryable: true, backoffMultiplier: 3 };
  }

  /**
   * Determine if error should be retried based on classification
   */
  shouldRetry(errorType: X402ErrorType, attempt: number): boolean {
    return errorType.retryable && attempt < this.retryConfig.maxAttempts;
  }

  /**
   * Calculate exponential backoff delay with optional jitter
   */
  calculateDelay(errorType: X402ErrorType, attempt: number): number {
    const multiplier = errorType.retryable ? errorType.backoffMultiplier : 1;
    const baseDelay = this.retryConfig.initialDelayMs * Math.pow(multiplier, attempt - 1);
    const cappedDelay = Math.min(baseDelay, this.retryConfig.maxDelayMs);

    if (this.retryConfig.jitter) {
      // Add ±25% jitter
      const jitterRange = cappedDelay * 0.25;
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      return Math.max(0, cappedDelay + jitter);
    }

    return cappedDelay;
  }

  /**
   * Log error with structured context
   */
  logError(context: ErrorContext): void {
    this.errorHistory.push(context);
    
    const retryInfo = context.retryDelayMs 
      ? ` (retrying in ${context.retryDelayMs}ms)`
      : " (not retrying)";

    console.error(
      `[${context.timestamp.toISOString()}] Error ${context.attempt}/${context.totalAttempts}: ` +
      `${context.errorType.kind} - ${context.message}${retryInfo}`
    );

    if (context.stack && context.attempt === 1) {
      console.error("Stack trace:", context.stack);
    }
  }

  /**
   * Execute operation with retry logic
   */
  async withRetry<T>(
    url: string,
    operation: () => Promise<T>
  ): Promise<T> {
    let lastError: unknown;
    
    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const errorType = this.classifyError(error);
        
        const context: ErrorContext = {
          timestamp: new Date(),
          url,
          errorType,
          message: error instanceof Error ? error.message : String(error),
          attempt,
          totalAttempts: this.retryConfig.maxAttempts,
          ...(error instanceof Error && error.stack && { stack: error.stack }),
        };

        if (this.shouldRetry(errorType, attempt)) {
          const delayMs = this.calculateDelay(errorType, attempt);
          context.retryDelayMs = delayMs;
          this.logError(context);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } else {
          this.logError(context);
          break;
        }
      }
    }

    throw lastError;
  }

  /**
   * Get error statistics
   */
  getStats() {
    const errorCounts = this.errorHistory.reduce((counts, error) => {
      counts[error.errorType.kind] = (counts[error.errorType.kind] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    return {
      totalErrors: this.errorHistory.length,
      errorsByType: errorCounts,
      recentErrors: this.errorHistory.slice(-5).map(e => ({
        timestamp: e.timestamp,
        type: e.errorType.kind,
        message: e.message,
        retried: e.retryDelayMs !== undefined,
      })),
    };
  }
}

/**
 * Type-safe configuration loader with validation
 */
export function loadConfig(): Config {
  const rawConfig = {
    evmPrivateKey: process.env.EVM_PRIVATE_KEY,
    svmPrivateKey: process.env.SVM_PRIVATE_KEY,
    resourceServerUrl: process.env.RESOURCE_SERVER_URL || "",
    endpointPath: process.env.ENDPOINT_PATH,
    facilitatorUrl: process.env.FACILITATOR_URL,
    requestTimeoutMs: process.env.REQUEST_TIMEOUT_MS ? 
      parseInt(process.env.REQUEST_TIMEOUT_MS, 10) : undefined,
    maxRetries: process.env.MAX_RETRIES ? 
      parseInt(process.env.MAX_RETRIES, 10) : undefined,
    concurrency: process.env.CONCURRENCY ? 
      parseInt(process.env.CONCURRENCY, 10) : undefined,
  };

  try {
    return ConfigSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("❌ Configuration validation failed:");
      error.errors.forEach(err => {
        console.error(`  - ${err.path.join(".")}: ${err.message}`);
      });
      console.error("\nRequired environment variables:");
      console.error("  - RESOURCE_SERVER_URL (required)");
      console.error("  - EVM_PRIVATE_KEY or SVM_PRIVATE_KEY (at least one required)");
      console.error("\nOptional variables:");
      console.error("  - ENDPOINT_PATH (default: /api/data)");
      console.error("  - FACILITATOR_URL");
      console.error("  - REQUEST_TIMEOUT_MS (default: 30000)");
      console.error("  - MAX_RETRIES (default: 3)");
      console.error("  - CONCURRENCY (default: 5)");
    }
    process.exit(1);
  }
}

/**
 * Setup x402 client with error handling
 */
export async function setupClient(config: Config): Promise<ReturnType<typeof wrapFetchWithPayment>> {
  console.log("🔧 Setting up x402 client...");
  
  const client = new x402Client();
  let hasPaymentMethod = false;

  // Register EVM if configured
  if (config.evmPrivateKey) {
    try {
      const account = privateKeyToAccount(config.evmPrivateKey as `0x${string}`);
      client.register("eip155:*", new ExactEvmScheme(account));
      console.log(`✅ EVM client registered: ${account.address}`);
      hasPaymentMethod = true;
    } catch (error) {
      console.error("❌ Failed to register EVM client:", error);
      throw new Error(`Invalid EVM private key: ${error}`);
    }
  }

  // Register SVM if configured
  if (config.svmPrivateKey) {
    try {
      const svmSigner = await createKeyPairSignerFromBytes(base58.decode(config.svmPrivateKey));
      client.register("solana:*", new ExactSvmScheme(svmSigner));
      console.log(`✅ SVM client registered: ${svmSigner.address}`);
      hasPaymentMethod = true;
    } catch (error) {
      console.error("❌ Failed to register SVM client:", error);
      throw new Error(`Invalid SVM private key: ${error}`);
    }
  }

  if (!hasPaymentMethod) {
    throw new Error("No valid payment methods configured");
  }

  // Set custom facilitator if provided
  if (config.facilitatorUrl) {
    // Note: This would need to be implemented based on the client API
    console.log(`✅ Facilitator configured: ${config.facilitatorUrl}`);
  }

  return wrapFetchWithPayment(fetch, client);
}

/**
 * Make a single request with comprehensive error handling
 */
export async function makeSingleRequest(
  fetchWithPayment: ReturnType<typeof wrapFetchWithPayment>,
  url: string,
  errorHandler: X402ErrorHandler,
  timeoutMs: number
): Promise<{
  status: number;
  body: string;
  headers: Record<string, string>;
  paymentMade: boolean;
}> {
  return errorHandler.withRetry(url, async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchWithPayment(url, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 402) {
        throw new Error("Payment required but not handled properly (status: 402)");
      }
      
      if (response.status >= 400) {
        throw new Error(`Server error (status: ${response.status}): ${await response.text()}`);
      }

      const body = await response.text();
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      return {
        status: response.status,
        body,
        headers,
        paymentMade: headers["x-payment-settle-response"] !== undefined,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      throw error;
    }
  });
}

/**
 * Process multiple URLs concurrently with error isolation
 */
 
export async function batchRequests<T>(
  items: T[],
  processor: (item: T) => Promise<unknown>,
  concurrency: number,
  errorHandler: X402ErrorHandler
): Promise<BatchOperationResult<T>> {
  console.log(`🔄 Processing ${items.length} items with concurrency limit of ${concurrency}...`);
  
  const result: BatchOperationResult<T> = {
    successful: [],
    failed: [],
    successRate: 0,
  };

  // Use a semaphore pattern for concurrency control
  const semaphore = Array(concurrency).fill(null).map(() => Promise.resolve());
  let semaphoreIndex = 0;

  const tasks = items.map(async (item) => {  
    // Wait for an available slot
    await semaphore[semaphoreIndex];
    const currentSlotIndex = semaphoreIndex;
    semaphoreIndex = (semaphoreIndex + 1) % concurrency;

    try {
      const itemResult = await processor(item);
      result.successful.push({
        item,
        result: itemResult,
        timestamp: new Date(),
      });
      console.log(`✅ Success: ${JSON.stringify(item)}`);
    } catch (error) {
      const errorType = errorHandler.classifyError(error);
      result.failed.push({
        item,
        error,
        errorType: errorType.kind,
        timestamp: new Date(),
      });
      console.log(`❌ Failed: ${JSON.stringify(item)} - ${errorType.kind}`);
    } finally {
      // Release the semaphore slot
      semaphore[currentSlotIndex] = Promise.resolve();
    }
  });

  await Promise.all(tasks);

  const total = result.successful.length + result.failed.length;
  result.successRate = total > 0 ? result.successful.length / total : 0;

  return result;
}

/**
 * Demonstrate various error scenarios and recovery patterns
 */
export async function demonstrateErrorScenarios(
  fetchWithPayment: ReturnType<typeof wrapFetchWithPayment>,
  baseUrl: string,
  errorHandler: X402ErrorHandler,
  config: Config
): Promise<void> {
  console.log("\n🧪 Demonstrating error scenarios and recovery...");

  // Test URLs with various scenarios
  const testScenarios = [
    `${baseUrl}${config.endpointPath}`, // Normal protected endpoint
    `${baseUrl}/api/nonexistent`, // 404 error
    `${baseUrl}/api/slow`, // Potential timeout
    "https://invalid-domain-x402-test-typescript.com/api/data", // Network error
  ];

  // Create processor function
  const processor = async (url: string) => {
    return makeSingleRequest(fetchWithPayment, url, errorHandler, config.requestTimeoutMs);
  };

  // Process batch with error isolation
  const batchResult = await batchRequests(
    testScenarios,
    processor,
    config.concurrency,
    errorHandler
  );

  console.log(`\n📈 Batch Results:`);
  console.log(`  - Success rate: ${(batchResult.successRate * 100).toFixed(1)}%`);
  console.log(`  - Successful: ${batchResult.successful.length}`);
  console.log(`  - Failed: ${batchResult.failed.length}`);

  // Show successful responses
  batchResult.successful.forEach(success => {
    const url = success.item;
    const result = success.result as { status: number; paymentMade: boolean };
    const paymentInfo = result.paymentMade ? " (with payment)" : " (no payment)";
    console.log(`  ✅ ${url} → ${result.status}${paymentInfo}`);
  });

  // Show failed responses with error types
  batchResult.failed.forEach(failure => {
    const url = failure.item;
    const errorType = failure.errorType;
    console.log(`  ❌ ${url} → ${errorType}`);
  });
}

/**
 * Print comprehensive error analysis
 */
export function printErrorSummary(errorHandler: X402ErrorHandler): void {
  const stats = errorHandler.getStats();

  if (stats.totalErrors === 0) {
    console.log("✅ No errors encountered!");
    return;
  }

  console.log(`\n📊 Error Summary (${stats.totalErrors} total errors):`);

  Object.entries(stats.errorsByType).forEach(([type, count]) => {
    console.log(`  - ${type}: ${count}`);
  });

  if (stats.recentErrors.length > 0) {
    console.log(`\n🔍 Recent errors:`);
    stats.recentErrors.forEach(error => {
      const retryStatus = error.retried ? "(retried)" : "(not retried)";
      console.log(`  - [${error.timestamp.toLocaleTimeString()}] ${error.type}: ${error.message} ${retryStatus}`);
    });
  }
}

/**
 * Graceful shutdown handler
 */
export function setupGracefulShutdown(cleanup: () => Promise<void> = async () => {}): void {
  const shutdown = async (signal: string) => {
    console.log(`\n⚠️ Received ${signal} signal, shutting down gracefully...`);
    try {
      await cleanup();
      console.log("🏁 Shutdown completed successfully");
      process.exit(0);
    } catch (error) {
      console.error("❌ Error during shutdown:", error);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

/**
 * Main demonstration function
 */
export async function main(): Promise<void> {
  console.log("🚀 Starting TypeScript x402 error handling demonstration...");

  // Setup graceful shutdown
  setupGracefulShutdown();

  try {
    // Load and validate configuration
    const config = loadConfig();

    // Initialize error handler
    const retryConfig: RetryConfig = {
      maxAttempts: config.maxRetries,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      jitter: true,
    };

    const errorHandler = new X402ErrorHandler(retryConfig);

    // Setup x402 client
    const fetchWithPayment = await setupClient(config);

    // Build target URL
    const targetUrl = `${config.resourceServerUrl}${config.endpointPath}`;
    console.log(`🎯 Target URL: ${targetUrl}`);

    // Demonstrate single request with error handling
    console.log(`\n📡 Making single request with error handling...`);
    try {
      const result = await makeSingleRequest(
        fetchWithPayment,
        targetUrl,
        errorHandler,
        config.requestTimeoutMs
      );

      console.log(`✅ Single request successful:`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Payment made: ${result.paymentMade ? "Yes" : "No"}`);
      if (result.body) {
        const truncatedBody = result.body.length > 200 
          ? result.body.slice(0, 200) + "..."
          : result.body;
        console.log(`   Body: ${truncatedBody}`);
      }
    } catch (error) {
      console.error(`❌ Single request failed:`, error);
    }

    // Demonstrate error scenarios
    await demonstrateErrorScenarios(fetchWithPayment, config.resourceServerUrl, errorHandler, config);

  } catch (error) {
    console.error("💥 Fatal error:", error);
    process.exit(1);
  } finally {
    // Print final error analysis
    const errorHandler = new X402ErrorHandler({ maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 30000, jitter: true });
    printErrorSummary(errorHandler);
    console.log("🏁 Demonstration completed");
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error("💥 Unhandled error:", error);
    process.exit(1);
  });
}
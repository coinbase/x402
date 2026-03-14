import { config } from "dotenv";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";
import { X402Error, classifyError, RateLimitError } from "./error-types";

config();

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const svmPrivateKey = process.env.SVM_PRIVATE_KEY as string;
const baseURL = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";

interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  jitter: boolean;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffFactor: 2,
  jitter: true,
};

/**
 * Exponential backoff retry implementation with jitter
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: X402Error;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      const result = await operation();
      if (attempt > 1) {
        console.log(`✅ Success on attempt ${attempt}`);
      }
      return result;
    } catch (rawError: any) {
      const error = classifyError(rawError);
      lastError = error;

      console.log(`❌ Attempt ${attempt}/${config.maxAttempts} failed: ${error.message}`);

      // Don't retry if error is not retryable
      if (!error.retryable) {
        console.log(`🚫 Error not retryable, stopping after ${attempt} attempt(s)`);
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === config.maxAttempts) {
        console.log(`🔚 Max attempts reached, giving up`);
        break;
      }

      // Calculate delay with exponential backoff and optional jitter
      let delay = Math.min(
        config.baseDelay * Math.pow(config.backoffFactor, attempt - 1),
        config.maxDelay
      );

      // Handle rate limit specific delays
      if (error instanceof RateLimitError && error.retryAfter) {
        delay = error.retryAfter * 1000; // Convert to milliseconds
        console.log(`⏱️  Rate limited - waiting ${error.retryAfter}s as requested`);
      } else {
        // Add jitter to prevent thundering herd
        if (config.jitter) {
          delay = delay * (0.5 + Math.random() * 0.5);
        }
        console.log(`⏳ Waiting ${Math.round(delay)}ms before retry...`);
      }

      await sleep(delay);
    }
  }

  throw lastError!;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Circuit breaker pattern to prevent cascading failures
 */
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";

  constructor(
    private readonly failureThreshold: number = 5,
    private readonly timeoutMs: number = 60000, // 1 minute
    private readonly halfOpenRetries: number = 3
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime > this.timeoutMs) {
        this.state = "HALF_OPEN";
        console.log("🔄 Circuit breaker entering HALF_OPEN state");
      } else {
        throw new X402Error({
          message: "Circuit breaker is OPEN - operation not allowed",
          code: "SERVER_ERROR",
          retryable: false,
        });
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state === "HALF_OPEN") {
      this.state = "CLOSED";
      console.log("✅ Circuit breaker reset to CLOSED state");
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === "HALF_OPEN") {
      this.state = "OPEN";
      console.log("❌ Circuit breaker back to OPEN state");
    } else if (this.failures >= this.failureThreshold) {
      this.state = "OPEN";
      console.log(`🔒 Circuit breaker OPENED after ${this.failures} failures`);
    }
  }

  getState(): string {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }
}

/**
 * Advanced error handling example with retry logic and circuit breaker
 */
async function advancedErrorHandlingExample(): Promise<void> {
  console.log("🔄 Advanced Error Handling with Retry and Circuit Breaker\n");

  const evmSigner = privateKeyToAccount(evmPrivateKey);
  const svmSigner = await createKeyPairSignerFromBytes(base58.decode(svmPrivateKey));

  const client = new x402Client();
  client.register("eip155:*", new ExactEvmScheme(evmSigner));
  client.register("solana:*", new ExactSvmScheme(svmSigner));

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const circuitBreaker = new CircuitBreaker();

  const endpoints = [
    { name: "Stable endpoint", url: `${baseURL}/weather` },
    { name: "Flaky endpoint", url: `${baseURL}/flaky-endpoint` },
    { name: "Rate limited endpoint", url: `${baseURL}/rate-limited` },
  ];

  for (const endpoint of endpoints) {
    console.log(`\n📡 Testing: ${endpoint.name}`);
    console.log(`   Circuit breaker state: ${circuitBreaker.getState()}`);
    console.log(`   Previous failures: ${circuitBreaker.getFailures()}`);

    try {
      const result = await circuitBreaker.execute(async () => {
        return await retryWithBackoff(
          async () => {
            const response = await fetchWithPayment(endpoint.url, {
              method: "GET",
              timeout: 10000, // 10 second timeout
            });

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
          },
          {
            maxAttempts: 3,
            baseDelay: 1000,
            backoffFactor: 2,
            jitter: true,
          }
        );
      });

      console.log("✅ Success:", JSON.stringify(result, null, 2));
    } catch (error: any) {
      const x402Error = error instanceof X402Error ? error : classifyError(error);
      console.log(`❌ Final error: ${x402Error.message}`);
      console.log(`   Error code: ${x402Error.code}`);
      console.log(`   Retryable: ${x402Error.retryable}`);

      // Log detailed error for debugging
      if (x402Error.originalError) {
        console.log(`   Original error: ${x402Error.originalError.message}`);
      }
    }
  }

  console.log(`\n🏁 Final circuit breaker state: ${circuitBreaker.getState()}`);
  console.log(`   Total failures tracked: ${circuitBreaker.getFailures()}`);
}

/**
 * Demonstrate different retry strategies for different error types
 */
async function demonstrateRetryStrategies(): Promise<void> {
  console.log("\n🔧 Different Retry Strategies by Error Type\n");

  const evmSigner = privateKeyToAccount(evmPrivateKey);
  const svmSigner = await createKeyPairSignerFromBytes(base58.decode(svmPrivateKey));

  const client = new x402Client();
  client.register("eip155:*", new ExactEvmScheme(evmSigner));
  client.register("solana:*", new ExactSvmScheme(svmSigner));

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  // Strategy 1: Aggressive retry for network errors
  console.log("🌐 Network Error Strategy - Aggressive Retry");
  try {
    await retryWithBackoff(
      () => fetchWithPayment("http://nonexistent.example.com/api"),
      {
        maxAttempts: 5,
        baseDelay: 500,
        backoffFactor: 1.5,
        jitter: true,
      }
    );
  } catch (error) {
    console.log("Expected network failure after retries");
  }

  // Strategy 2: Conservative retry for server errors  
  console.log("\n🔧 Server Error Strategy - Conservative Retry");
  try {
    await retryWithBackoff(
      () => fetchWithPayment(`${baseURL}/server-error-500`),
      {
        maxAttempts: 2,
        baseDelay: 2000,
        backoffFactor: 3,
        jitter: false,
      }
    );
  } catch (error) {
    console.log("Expected server error after limited retries");
  }

  // Strategy 3: No retry for client errors
  console.log("\n🚫 Client Error Strategy - No Retry");
  try {
    await retryWithBackoff(
      () => fetchWithPayment(`${baseURL}/client-error-400`),
      {
        maxAttempts: 1, // No retry for client errors
        baseDelay: 0,
        backoffFactor: 1,
        jitter: false,
      }
    );
  } catch (error) {
    console.log("Expected immediate failure for client error");
  }
}

async function main(): Promise<void> {
  console.log("🚀 x402 Retry and Circuit Breaker Examples\n");
  
  await advancedErrorHandlingExample();
  await demonstrateRetryStrategies();
  
  console.log("\n✨ Advanced examples completed!");
}

main().catch(error => {
  console.error("💥 Fatal error:", error);
  process.exit(1);
});
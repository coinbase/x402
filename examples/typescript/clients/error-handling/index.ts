/**
 * x402 Client Error Handling Examples
 * 
 * This example demonstrates comprehensive error handling patterns for x402 clients,
 * covering common failure scenarios and best practices for production applications.
 */

import { x402Client } from "@x402/fetch";
import { HTTPFacilitatorClient } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";

// Example API endpoint that requires payment
const API_ENDPOINT = "https://httpbin.org/status/402";
const FACILITATOR_URL = "https://x402.org/facilitator";

interface ApiResponse {
  data?: any;
  error?: string;
  paymentRequired?: boolean;
}

/**
 * Demonstrates basic error handling for x402 payment flows
 */
async function basicErrorHandling(): Promise<void> {
  console.log("🔍 Basic Error Handling Example");
  console.log("================================");

  const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  const client = new x402Client(
    facilitatorClient.register("eip155:84532", new ExactEvmScheme()),
    { fetch }
  );

  try {
    const response = await client.fetch(API_ENDPOINT);
    
    if (!response.ok) {
      console.log(`❌ HTTP Error: ${response.status} ${response.statusText}`);
      return;
    }

    const data = await response.json();
    console.log("✅ Success:", data);
    
  } catch (error) {
    if (error instanceof Error) {
      console.log(`❌ Request failed: ${error.message}`);
      
      // Check for specific x402 error types
      if (error.message.includes("payment required")) {
        console.log("💳 Payment required but failed");
      } else if (error.message.includes("insufficient funds")) {
        console.log("💸 Insufficient funds for payment");
      } else if (error.message.includes("network")) {
        console.log("🌐 Network connectivity issue");
      }
    } else {
      console.log("❌ Unknown error:", error);
    }
  }
}

/**
 * Advanced error handling with retry logic and circuit breaker pattern
 */
class ResilientX402Client {
  private client: x402Client;
  private maxRetries: number;
  private retryDelay: number;
  private circuitBreakerThreshold: number;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private circuitBreakerTimeout: number = 30000; // 30 seconds

  constructor(facilitatorUrl: string, options: {
    maxRetries?: number;
    retryDelay?: number;
    circuitBreakerThreshold?: number;
  } = {}) {
    const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });
    this.client = new x402Client(
      facilitatorClient.register("eip155:84532", new ExactEvmScheme()),
      { fetch }
    );
    
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelay = options.retryDelay ?? 1000;
    this.circuitBreakerThreshold = options.circuitBreakerThreshold ?? 5;
  }

  /**
   * Circuit breaker pattern - prevents calls when failure rate is too high
   */
  private isCircuitOpen(): boolean {
    const now = Date.now();
    const timeSinceLastFailure = now - this.lastFailureTime;
    
    if (this.failureCount >= this.circuitBreakerThreshold) {
      if (timeSinceLastFailure < this.circuitBreakerTimeout) {
        return true; // Circuit is open
      } else {
        // Reset circuit after timeout
        this.failureCount = 0;
        return false;
      }
    }
    
    return false;
  }

  /**
   * Resilient fetch with exponential backoff and circuit breaker
   */
  async fetch(url: string, options?: RequestInit): Promise<Response> {
    if (this.isCircuitOpen()) {
      throw new Error("Circuit breaker is open - too many recent failures");
    }

    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🔄 Attempt ${attempt + 1}/${this.maxRetries + 1} for ${url}`);
        
        const response = await this.client.fetch(url, options);
        
        // Reset failure count on success
        this.failureCount = 0;
        
        return response;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.failureCount++;
        this.lastFailureTime = Date.now();
        
        console.log(`❌ Attempt ${attempt + 1} failed: ${lastError.message}`);
        
        // Don't retry on certain error types
        if (this.isNonRetryableError(lastError)) {
          console.log("⛔ Non-retryable error, stopping attempts");
          break;
        }
        
        // Wait before retry (exponential backoff)
        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt);
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError || new Error("Maximum retries exceeded");
  }

  /**
   * Determine if an error should not be retried
   */
  private isNonRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Authentication/authorization errors shouldn't be retried
    if (message.includes("unauthorized") || message.includes("forbidden")) {
      return true;
    }
    
    // Invalid payment schemes shouldn't be retried
    if (message.includes("unsupported scheme") || message.includes("invalid scheme")) {
      return true;
    }
    
    // Malformed requests shouldn't be retried
    if (message.includes("bad request") || message.includes("invalid request")) {
      return true;
    }
    
    return false;
  }

  /**
   * Get circuit breaker status for monitoring
   */
  getStatus(): {
    isCircuitOpen: boolean;
    failureCount: number;
    lastFailureTime: number;
  } {
    return {
      isCircuitOpen: this.isCircuitOpen(),
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime
    };
  }
}

/**
 * Demonstrates advanced error handling with resilient client
 */
async function advancedErrorHandling(): Promise<void> {
  console.log("\n🛡️  Advanced Error Handling Example");
  console.log("===================================");

  const resilientClient = new ResilientX402Client(FACILITATOR_URL, {
    maxRetries: 3,
    retryDelay: 1000,
    circuitBreakerThreshold: 3
  });

  // Test multiple endpoints to trigger different error scenarios
  const testUrls = [
    API_ENDPOINT,
    "https://httpbin.org/status/500", // Server error
    "https://httpbin.org/delay/2",    // Slow response
    "https://invalid-domain-12345.com", // Network error
  ];

  for (const url of testUrls) {
    try {
      console.log(`\n📡 Testing: ${url}`);
      
      const response = await resilientClient.fetch(url);
      console.log(`✅ Success: ${response.status} ${response.statusText}`);
      
    } catch (error) {
      console.log(`❌ Final error: ${error instanceof Error ? error.message : error}`);
      
      // Check circuit breaker status
      const status = resilientClient.getStatus();
      console.log(`🔌 Circuit status: ${status.isCircuitOpen ? 'OPEN' : 'CLOSED'} (${status.failureCount} failures)`);
    }
  }
}

/**
 * Error categorization and monitoring
 */
class X402ErrorTracker {
  private errorCounts: Map<string, number> = new Map();
  private errorHistory: Array<{ timestamp: number; error: string; url: string }> = [];

  trackError(error: Error, url: string): void {
    const errorType = this.categorizeError(error);
    const currentCount = this.errorCounts.get(errorType) || 0;
    this.errorCounts.set(errorType, currentCount + 1);
    
    this.errorHistory.push({
      timestamp: Date.now(),
      error: errorType,
      url
    });

    console.log(`📊 Error tracked: ${errorType} (count: ${currentCount + 1})`);
  }

  private categorizeError(error: Error): string {
    const message = error.message.toLowerCase();
    
    if (message.includes("payment required") || message.includes("402")) {
      return "PAYMENT_REQUIRED";
    } else if (message.includes("insufficient funds")) {
      return "INSUFFICIENT_FUNDS";
    } else if (message.includes("timeout")) {
      return "TIMEOUT";
    } else if (message.includes("network") || message.includes("fetch")) {
      return "NETWORK_ERROR";
    } else if (message.includes("unauthorized") || message.includes("forbidden")) {
      return "AUTH_ERROR";
    } else if (message.includes("500") || message.includes("server error")) {
      return "SERVER_ERROR";
    } else {
      return "UNKNOWN_ERROR";
    }
  }

  getErrorReport(): {
    errorCounts: Record<string, number>;
    totalErrors: number;
    recentErrors: Array<{ timestamp: number; error: string; url: string }>;
  } {
    const now = Date.now();
    const recentErrors = this.errorHistory.filter(
      entry => now - entry.timestamp < 300000 // Last 5 minutes
    );

    return {
      errorCounts: Object.fromEntries(this.errorCounts),
      totalErrors: this.errorHistory.length,
      recentErrors
    };
  }
}

/**
 * Demonstrates error tracking and monitoring
 */
async function errorTrackingExample(): Promise<void> {
  console.log("\n📊 Error Tracking & Monitoring Example");
  console.log("=====================================");

  const errorTracker = new X402ErrorTracker();
  const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  const client = new x402Client(
    facilitatorClient.register("eip155:84532", new ExactEvmScheme()),
    { fetch }
  );

  // Simulate various error scenarios
  const testScenarios = [
    { url: "https://httpbin.org/status/402", description: "Payment required" },
    { url: "https://httpbin.org/status/500", description: "Server error" },
    { url: "https://httpbin.org/delay/10", description: "Timeout test" },
    { url: "https://invalid-domain-xyz.com", description: "Network error" },
  ];

  for (const scenario of testScenarios) {
    try {
      console.log(`\n🧪 Testing: ${scenario.description}`);
      await client.fetch(scenario.url);
      console.log("✅ Unexpected success");
      
    } catch (error) {
      if (error instanceof Error) {
        errorTracker.trackError(error, scenario.url);
      }
    }
  }

  // Generate error report
  const report = errorTracker.getErrorReport();
  console.log("\n📈 Error Report:");
  console.log("================");
  console.log(`Total errors: ${report.totalErrors}`);
  console.log("Error breakdown:", report.errorCounts);
  console.log(`Recent errors (last 5 min): ${report.recentErrors.length}`);
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  console.log("🚀 x402 Client Error Handling Examples");
  console.log("======================================\n");

  try {
    await basicErrorHandling();
    await advancedErrorHandling();
    await errorTrackingExample();
    
  } catch (error) {
    console.error("❌ Example execution failed:", error);
    process.exit(1);
  }

  console.log("\n✨ Examples completed successfully!");
}

// Run examples if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export {
  ResilientX402Client,
  X402ErrorTracker,
  basicErrorHandling,
  advancedErrorHandling,
  errorTrackingExample
};
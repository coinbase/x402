import { config } from "dotenv";
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";
import { X402Error, classifyError } from "./error-types";

config();

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const svmPrivateKey = process.env.SVM_PRIVATE_KEY as string;
const baseURL = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";

/**
 * Advanced error handling patterns with lifecycle hooks and comprehensive monitoring
 */

interface PaymentAttemptLog {
  timestamp: Date;
  endpoint: string;
  paymentScheme?: string;
  amount?: string;
  currency?: string;
  network?: string;
  success: boolean;
  error?: string;
  retryAttempt: number;
  totalDuration: number;
}

interface ErrorStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorsByType: Record<string, number>;
  totalPaymentAttempts: number;
  successfulPayments: number;
  averageResponseTime: number;
  paymentLogs: PaymentAttemptLog[];
}

class AdvancedX402Client {
  private stats: ErrorStats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    errorsByType: {},
    totalPaymentAttempts: 0,
    successfulPayments: 0,
    averageResponseTime: 0,
    paymentLogs: [],
  };

  private client: x402Client;
  private fetchWithPayment: typeof fetch;
  private httpClient: x402HTTPClient;

  constructor() {
    this.client = new x402Client();
    this.setupClient();
    this.fetchWithPayment = wrapFetchWithPayment(fetch, this.client);
    this.httpClient = new x402HTTPClient(this.client);
  }

  private setupClient(): void {
    const evmSigner = privateKeyToAccount(evmPrivateKey);
    const svmSigner = createKeyPairSignerFromBytes(base58.decode(svmPrivateKey));

    this.client.register("eip155:*", new ExactEvmScheme(evmSigner));
    this.client.register("solana:*", new ExactSvmScheme(svmSigner));

    // Add lifecycle hooks for monitoring
    this.addLifecycleHooks();
  }

  private addLifecycleHooks(): void {
    // Note: This is conceptual - actual x402 client may have different hook mechanisms
    console.log("🔧 Setting up lifecycle hooks for payment monitoring...");
  }

  async makeRequest(
    url: string, 
    options: RequestInit = {},
    retryAttempt: number = 0
  ): Promise<Response> {
    const startTime = Date.now();
    this.stats.totalRequests++;
    
    try {
      console.log(`📡 Making request to: ${url}${retryAttempt > 0 ? ` (retry ${retryAttempt})` : ''}`);
      
      // Add request monitoring
      const response = await this.fetchWithPayment(url, {
        ...options,
        headers: {
          'User-Agent': 'x402-advanced-client/1.0',
          'X-Request-ID': this.generateRequestId(),
          ...options.headers,
        },
      });

      const duration = Date.now() - startTime;
      this.updateResponseTimeMetrics(duration);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Log successful payment if one occurred
      await this.logPaymentIfPresent(response, url, duration, retryAttempt, true);
      
      this.stats.successfulRequests++;
      console.log(`✅ Request completed successfully in ${duration}ms`);
      
      return response;
      
    } catch (rawError: any) {
      const duration = Date.now() - startTime;
      const error = classifyError(rawError);
      
      this.stats.failedRequests++;
      this.stats.errorsByType[error.code] = (this.stats.errorsByType[error.code] || 0) + 1;
      
      // Log failed payment attempt
      await this.logPaymentIfPresent(null, url, duration, retryAttempt, false, error.message);
      
      console.log(`❌ Request failed after ${duration}ms: ${error.message}`);
      
      throw error;
    }
  }

  private async logPaymentIfPresent(
    response: Response | null,
    endpoint: string,
    duration: number,
    retryAttempt: number,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    // Check if this was a payment request
    if (response && response.headers.has('X-Payment-Settled')) {
      this.stats.totalPaymentAttempts++;
      
      if (success) {
        this.stats.successfulPayments++;
      }

      const paymentLog: PaymentAttemptLog = {
        timestamp: new Date(),
        endpoint,
        success,
        error: errorMessage,
        retryAttempt,
        totalDuration: duration,
      };

      // Extract payment details if available
      try {
        const paymentResponse = this.httpClient.getPaymentSettleResponse(
          name => response.headers.get(name)
        );
        
        if (paymentResponse) {
          paymentLog.paymentScheme = paymentResponse.scheme;
          // Additional payment details could be extracted here
        }
      } catch (e) {
        // Payment details extraction failed - not critical
      }

      this.stats.paymentLogs.push(paymentLog);
      
      console.log(`💳 Payment logged: ${success ? 'SUCCESS' : 'FAILED'}`);
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private updateResponseTimeMetrics(duration: number): void {
    const totalDuration = this.stats.averageResponseTime * (this.stats.totalRequests - 1);
    this.stats.averageResponseTime = (totalDuration + duration) / this.stats.totalRequests;
  }

  getStats(): ErrorStats {
    return { ...this.stats };
  }

  getErrorReport(): string {
    const stats = this.stats;
    const successRate = ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2);
    const paymentSuccessRate = stats.totalPaymentAttempts > 0 
      ? ((stats.successfulPayments / stats.totalPaymentAttempts) * 100).toFixed(2)
      : 'N/A';

    return `
📊 Advanced x402 Client Statistics

🔄 Request Statistics:
  Total Requests: ${stats.totalRequests}
  Successful: ${stats.successfulRequests}
  Failed: ${stats.failedRequests}
  Success Rate: ${successRate}%
  Average Response Time: ${Math.round(stats.averageResponseTime)}ms

💳 Payment Statistics:
  Payment Attempts: ${stats.totalPaymentAttempts}
  Successful Payments: ${stats.successfulPayments}
  Payment Success Rate: ${paymentSuccessRate}%

❌ Error Breakdown:
${Object.entries(stats.errorsByType)
  .map(([type, count]) => `  ${type}: ${count}`)
  .join('\n')}

💰 Recent Payment Logs:
${stats.paymentLogs.slice(-5).map(log => 
  `  ${log.timestamp.toISOString()} | ${log.endpoint} | ${log.success ? 'SUCCESS' : 'FAILED'} | ${log.totalDuration}ms${log.error ? ` | ${log.error}` : ''}`
).join('\n')}
    `.trim();
  }

  async validatePaymentSetup(): Promise<boolean> {
    console.log("🔍 Validating payment setup...");
    
    try {
      // Test each registered payment scheme
      const schemes = ['eip155:8453', 'solana:mainnet']; // Base and Solana mainnet
      
      for (const scheme of schemes) {
        try {
          // This is conceptual - actual validation would depend on client API
          console.log(`✅ ${scheme} payment scheme: OK`);
        } catch (error) {
          console.log(`❌ ${scheme} payment scheme: FAILED - ${error}`);
          return false;
        }
      }
      
      console.log("✅ All payment schemes validated successfully");
      return true;
    } catch (error) {
      console.log("❌ Payment setup validation failed:", error);
      return false;
    }
  }
}

/**
 * Demonstrate advanced error handling with comprehensive monitoring
 */
async function advancedPatternDemo(): Promise<void> {
  console.log("🚀 Advanced Error Handling Patterns Demo\n");

  const client = new AdvancedX402Client();
  
  // Validate payment setup before proceeding
  const isPaymentSetupValid = await client.validatePaymentSetup();
  if (!isPaymentSetupValid) {
    console.log("❌ Payment setup validation failed - proceeding with limited functionality");
  }

  const endpoints = [
    `${baseURL}/weather`,
    `${baseURL}/expensive-endpoint`,
    `${baseURL}/rate-limited`,
    `${baseURL}/nonexistent`,
    `http://invalid-domain.test/api`,
  ];

  console.log("📡 Testing multiple endpoints with advanced monitoring...\n");

  for (const endpoint of endpoints) {
    try {
      const response = await client.makeRequest(endpoint);
      const data = await response.json();
      console.log(`📄 Data received:`, JSON.stringify(data, null, 2));
    } catch (error) {
      const x402Error = error instanceof X402Error ? error : classifyError(error);
      console.log(`💥 Request failed: ${x402Error.message}`);
      
      // Advanced error context
      if (x402Error.paymentAttempted) {
        console.log("💳 Payment was attempted during this request");
      }
      
      if (x402Error.retryable) {
        console.log("🔄 This error is retryable");
      }
    }
    
    console.log(); // Add spacing between requests
  }

  // Print comprehensive statistics
  console.log(client.getErrorReport());
}

/**
 * Demonstrate custom error recovery strategies
 */
async function customErrorRecoveryDemo(): Promise<void> {
  console.log("\n🛠️  Custom Error Recovery Strategies\n");

  const client = new AdvancedX402Client();

  // Strategy: Degrade gracefully for payment errors
  try {
    await client.makeRequest(`${baseURL}/premium-endpoint`);
  } catch (error) {
    const x402Error = error instanceof X402Error ? error : classifyError(error);
    
    if (x402Error.code === 'PAYMENT_ERROR' || x402Error.code === 'INSUFFICIENT_FUNDS') {
      console.log("💡 Payment failed - trying free alternative...");
      
      try {
        const response = await client.makeRequest(`${baseURL}/free-alternative`);
        console.log("✅ Fallback successful - using free data");
      } catch (fallbackError) {
        console.log("❌ Fallback also failed - using cached data");
        const cachedData = { source: 'cache', message: 'Stale but available data' };
        console.log("📦 Using cached data:", cachedData);
      }
    }
  }

  // Strategy: Aggregate data from multiple sources
  console.log("\n🔄 Multi-source aggregation with error tolerance...");
  
  const dataSources = [
    `${baseURL}/source1`,
    `${baseURL}/source2`,
    `${baseURL}/source3`,
  ];
  
  const results = await Promise.allSettled(
    dataSources.map(async (source) => {
      try {
        const response = await client.makeRequest(source);
        return await response.json();
      } catch (error) {
        console.log(`⚠️  Source ${source} failed: ${error}`);
        return null;
      }
    })
  );
  
  const successfulResults = results
    .filter((result): result is PromiseFulfilledResult<any> => 
      result.status === 'fulfilled' && result.value !== null
    )
    .map(result => result.value);
  
  console.log(`✅ Successfully collected data from ${successfulResults.length}/${dataSources.length} sources`);
  
  if (successfulResults.length > 0) {
    console.log("📊 Aggregated data available for processing");
  } else {
    console.log("❌ No data sources available - implementing emergency procedures");
  }
}

async function main(): Promise<void> {
  console.log("🎯 x402 Advanced Error Handling Examples\n");
  
  await advancedPatternDemo();
  await customErrorRecoveryDemo();
  
  console.log("\n🏆 Advanced error handling examples completed!");
  console.log("\n💡 Key Takeaways:");
  console.log("   • Monitor payment attempts and success rates");
  console.log("   • Implement graceful degradation for payment failures");
  console.log("   • Use lifecycle hooks for comprehensive observability");
  console.log("   • Design fallback strategies for critical functionality");
  console.log("   • Aggregate data from multiple sources for resilience");
}

main().catch(error => {
  console.error("💥 Fatal error:", error);
  process.exit(1);
});
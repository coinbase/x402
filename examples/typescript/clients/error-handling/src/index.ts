import { x402Client, wrapFetchWithPayment } from "@x402/fetch";

/**
 * x402 Error Handling Examples
 * 
 * This example demonstrates various error scenarios you might encounter
 * when making x402 payments and how to handle them properly.
 */

// Configure x402 client
const client = new x402Client();

// Wrap fetch with payment handling
const fetchWithPayment = wrapFetchWithPayment(fetch, client);

/**
 * Example 1: Network Errors
 * Handles cases where the server is unreachable
 */
async function handleNetworkErrors() {
  console.log("\n🔗 Testing Network Errors...");
  
  try {
    // This should fail with a network error
    await fetchWithPayment("https://nonexistent-x402-server.example.com/api/data");
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("fetch")) {
      console.error("   Network error: Server unreachable");
      console.log("   💡 Tip: Check your internet connection and server URL");
    } else {
      console.error("   Unexpected error:", error);
    }
  }
}

/**
 * Example 2: Invalid Payment Requirements  
 * Handles malformed 402 responses from servers
 */
async function handleInvalidPaymentRequirements() {
  console.log("\n💰 Testing Invalid Payment Requirements...");
  
  try {
    // This would typically come from a misconfigured server
    await fetchWithPayment("https://httpbin.org/status/402", {
      headers: {
        // Simulate malformed 402 response
        'www-authenticate': 'x402 invalid-format'
      }
    });
  } catch (error) {
    if (error.name === 'PaymentRequiredError') {
      console.error("   Invalid payment requirements from server");
      console.log("   💡 Tip: Check server configuration");
    } else {
      console.error("   Error:", error.message);
    }
  }
}

/**
 * Example 3: Payment Creation Failures
 * Handles cases where payment creation fails (insufficient funds, etc.)
 */
async function handlePaymentCreationFailures() {
  console.log("\n🏦 Testing Payment Creation Failures...");
  
  try {
    // Simulate a server that requires payment
    const response = await fetchWithPayment("https://httpbin.org/status/402", {
      headers: {
        // Simulate realistic payment requirements
        'www-authenticate': 'x402 amount=100000000, payto=0x742d35cc6635c0532925a3b8d56000e50e2d6b16, network=eip155:1'
      }
    });
  } catch (error) {
    if (error.name === 'InsufficientFundsError') {
      console.error("   Insufficient funds for payment");
      console.log("   💡 Tip: Top up your wallet or reduce the payment amount");
    } else if (error.name === 'WalletConnectionError') {
      console.error("   Wallet connection failed");
      console.log("   💡 Tip: Check your wallet configuration");
    } else {
      console.error("   Payment creation failed:", error.message);
    }
  }
}

/**
 * Example 4: Server-Side Validation Failures
 * Handles cases where the server rejects the payment
 */
async function handleServerValidationFailures() {
  console.log("\n🔍 Testing Server Validation Failures...");
  
  try {
    // This would represent a server that rejects our payment
    await fetchWithPayment("https://httpbin.org/status/400", {
      headers: {
        'authorization': 'x402 invalid-payment-signature'
      }
    });
  } catch (error) {
    if (error.name === 'PaymentValidationError') {
      console.error("   Server rejected payment");
      console.log("   💡 Tip: Check payment format and signature");
    } else if (error.status === 400) {
      console.error("   Bad request - possibly invalid payment format");
      console.log("   💡 Tip: Ensure payment headers are correctly formatted");
    } else {
      console.error("   Server error:", error.message);
    }
  }
}

/**
 * Example 5: Rate Limiting and 429 Responses
 * Handles cases where requests are rate limited
 */
async function handleRateLimiting() {
  console.log("\n⏱️  Testing Rate Limiting...");
  
  try {
    await fetchWithPayment("https://httpbin.org/status/429");
  } catch (error) {
    if (error.status === 429) {
      console.error("   Rate limited by server");
      const retryAfter = error.headers?.['retry-after'];
      if (retryAfter) {
        console.log(`   💡 Tip: Wait ${retryAfter} seconds before retrying`);
      } else {
        console.log("   💡 Tip: Implement exponential backoff for retries");
      }
    } else {
      console.error("   Unexpected error:", error.message);
    }
  }
}

/**
 * Example 6: Timeout Handling
 * Handles slow or unresponsive servers
 */
async function handleTimeouts() {
  console.log("\n⏰ Testing Timeout Handling...");
  
  try {
    // Set a short timeout to demonstrate timeout handling
    await fetchWithPayment("https://httpbin.org/delay/10", {
      signal: AbortSignal.timeout(2000) // 2 second timeout
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error("   Request timed out");
      console.log("   💡 Tip: Increase timeout or check server performance");
    } else if (error.name === 'TimeoutError') {
      console.error("   Connection timeout");
      console.log("   💡 Tip: Check network connectivity");
    } else {
      console.error("   Timeout error:", error.message);
    }
  }
}

/**
 * Example 7: Comprehensive Error Classification
 * Shows how to classify different error types for proper handling
 */
async function classifyErrors() {
  console.log("\n🏷️  Error Classification Examples...");
  
  const testUrls = [
    "https://httpbin.org/status/400", // Bad Request
    "https://httpbin.org/status/401", // Unauthorized  
    "https://httpbin.org/status/402", // Payment Required
    "https://httpbin.org/status/403", // Forbidden
    "https://httpbin.org/status/404", // Not Found
    "https://httpbin.org/status/500", // Internal Server Error
  ];
  
  for (const url of testUrls) {
    try {
      await fetchWithPayment(url);
    } catch (error) {
      const errorType = classifyError(error);
      console.log(`   ${url}: ${errorType}`);
    }
  }
}

/**
 * Utility function to classify different types of errors
 */
function classifyError(error: any): string {
  // Network/Connection errors
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return "🔗 Network Error - Server unreachable";
  }
  
  // Timeout errors
  if (error.name === 'AbortError' || error.name === 'TimeoutError') {
    return "⏰ Timeout Error - Request took too long";
  }
  
  // HTTP status-based errors
  if (error.status) {
    switch (error.status) {
      case 400:
        return "❌ Bad Request - Invalid request format";
      case 401:
        return "🔐 Unauthorized - Authentication required";
      case 402:
        return "💳 Payment Required - x402 payment needed";
      case 403:
        return "🚫 Forbidden - Access denied";
      case 404:
        return "🔍 Not Found - Resource doesn't exist";
      case 429:
        return "⏱️  Rate Limited - Too many requests";
      case 500:
        return "🔥 Server Error - Internal server problem";
      case 502:
        return "🌐 Bad Gateway - Upstream server error";
      case 503:
        return "⚠️  Service Unavailable - Server temporarily down";
      default:
        return `❓ HTTP ${error.status} - ${error.statusText}`;
    }
  }
  
  // x402-specific errors
  if (error.name?.includes('Payment')) {
    return `💰 Payment Error - ${error.message}`;
  }
  
  // Generic fallback
  return `🚨 Unknown Error - ${error.message}`;
}

/**
 * Example 8: Retry Logic with Exponential Backoff
 * Demonstrates proper retry patterns for transient failures
 */
async function retryWithBackoff(url: string, maxRetries: number = 3): Promise<Response> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`   Attempt ${attempt}/${maxRetries}: ${url}`);
      return await fetchWithPayment(url);
    } catch (error) {
      lastError = error;
      
      // Don't retry on permanent failures
      if (error.status && [400, 401, 403, 404].includes(error.status)) {
        throw error;
      }
      
      // Don't retry on payment-specific errors
      if (error.name?.includes('Payment') && !error.name?.includes('NetworkError')) {
        throw error;
      }
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff
        console.log(`   Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

async function demonstrateRetryLogic() {
  console.log("\n🔄 Testing Retry Logic...");
  
  try {
    // This will likely fail but demonstrate retry logic
    await retryWithBackoff("https://httpbin.org/status/500");
  } catch (error) {
    console.error("   Final error after retries:", classifyError(error));
    console.log("   💡 Tip: Consider implementing circuit breaker pattern for repeated failures");
  }
}

/**
 * Main function - runs all error handling examples
 */
async function main() {
  console.log("🧪 x402 Error Handling Examples");
  console.log("===============================");
  
  // Run all error handling examples
  await handleNetworkErrors();
  await handleInvalidPaymentRequirements();
  await handlePaymentCreationFailures();
  await handleServerValidationFailures();
  await handleRateLimiting();
  await handleTimeouts();
  await classifyErrors();
  await demonstrateRetryLogic();
  
  console.log("\n✅ Error handling examples completed!");
  console.log("\n💡 Key Takeaways:");
  console.log("   • Always classify errors appropriately");
  console.log("   • Use lifecycle hooks for observability");
  console.log("   • Implement proper retry logic for transient failures");
  console.log("   • Don't retry payment-specific errors");
  console.log("   • Provide helpful error messages to users");
  console.log("   • Log errors appropriately for debugging");
}

// Run the examples
main().catch(console.error);
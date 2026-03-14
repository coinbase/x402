import { config } from "dotenv";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
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
 * Basic error handling example showing how to handle common x402 error scenarios
 * using try/catch blocks and proper error classification.
 */
async function basicErrorHandlingExample(): Promise<void> {
  console.log("🔄 Basic Error Handling Example\n");

  try {
    // Set up signers
    const evmSigner = privateKeyToAccount(evmPrivateKey);
    const svmSigner = await createKeyPairSignerFromBytes(base58.decode(svmPrivateKey));

    const client = new x402Client();
    client.register("eip155:*", new ExactEvmScheme(evmSigner));
    client.register("solana:*", new ExactSvmScheme(svmSigner));

    const fetchWithPayment = wrapFetchWithPayment(fetch, client);

    // Example endpoints to test different scenarios
    const endpoints = [
      { name: "Valid endpoint", url: `${baseURL}/weather` },
      { name: "Non-existent endpoint", url: `${baseURL}/nonexistent` },
      { name: "Invalid server", url: "http://invalid-server.example.com/api" },
    ];

    for (const endpoint of endpoints) {
      await testEndpointWithErrorHandling(fetchWithPayment, endpoint);
    }
  } catch (error) {
    console.error("❌ Fatal setup error:", error);
    process.exit(1);
  }
}

async function testEndpointWithErrorHandling(
  fetchWithPayment: typeof fetch,
  endpoint: { name: string; url: string }
): Promise<void> {
  console.log(`📡 Testing: ${endpoint.name}`);
  console.log(`   URL: ${endpoint.url}`);

  try {
    const response = await fetchWithPayment(endpoint.url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("✅ Success:", JSON.stringify(data, null, 2));
    console.log();
    
  } catch (rawError: any) {
    // Classify the error using our custom error types
    const error = classifyError(rawError);
    
    console.log("❌ Error Details:");
    console.log(`   Type: ${error.code}`);
    console.log(`   Message: ${error.message}`);
    
    if (error.statusCode) {
      console.log(`   Status Code: ${error.statusCode}`);
    }
    
    console.log(`   Retryable: ${error.retryable}`);
    console.log(`   Payment Attempted: ${error.paymentAttempted}`);

    // Handle different error types appropriately
    await handleSpecificError(error);
    console.log();
  }
}

async function handleSpecificError(error: X402Error): Promise<void> {
  switch (error.code) {
    case "NETWORK_ERROR":
      console.log("🌐 Network issue detected - check connectivity");
      if (error.retryable) {
        console.log("💡 Suggestion: Retry after network connectivity is restored");
      }
      break;

    case "PAYMENT_ERROR":
      console.log("💳 Payment processing failed");
      if (error.paymentAttempted) {
        console.log("💡 Suggestion: Check wallet balance and payment method");
      }
      break;

    case "INSUFFICIENT_FUNDS":
      console.log("💰 Insufficient funds for payment");
      console.log("💡 Suggestion: Add funds to wallet or use different payment method");
      break;

    case "RATE_LIMITED":
      console.log("🚦 Rate limit exceeded");
      if (error instanceof Error && "retryAfter" in error) {
        console.log(`💡 Suggestion: Wait ${error.retryAfter} seconds before retrying`);
      } else {
        console.log("💡 Suggestion: Wait before making additional requests");
      }
      break;

    case "SERVER_ERROR":
      console.log("🔧 Server error encountered");
      if (error.retryable) {
        console.log("💡 Suggestion: Retry request - server issues are often temporary");
      } else {
        console.log("💡 Suggestion: Contact API provider - persistent server issue");
      }
      break;

    case "AUTHENTICATION_ERROR":
      console.log("🔐 Authentication failed");
      console.log("💡 Suggestion: Check private keys and wallet configuration");
      break;

    case "MALFORMED_RESPONSE":
      console.log("🔧 Invalid API response received");
      console.log("💡 Suggestion: Check API documentation and request format");
      break;

    default:
      console.log("❓ Unknown error type");
      console.log("💡 Suggestion: Check logs and contact support if issue persists");
  }
}

// Demonstration of graceful degradation
async function gracefulDegradationExample(): Promise<void> {
  console.log("🛡️  Graceful Degradation Example\n");

  const client = new x402Client();
  // Intentionally not registering payment schemes to trigger errors
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  try {
    const response = await fetchWithPayment(`${baseURL}/weather`);
    const data = await response.json();
    console.log("✅ Got data:", data);
  } catch (rawError: any) {
    const error = classifyError(rawError);
    
    console.log("❌ Primary request failed:", error.message);
    
    // Attempt fallback strategy
    console.log("🔄 Attempting fallback strategy...");
    
    try {
      // Fallback: try free endpoint or cached data
      const fallbackData = await getFallbackData();
      console.log("✅ Fallback successful:", fallbackData);
    } catch (fallbackError) {
      console.log("❌ Fallback also failed:", fallbackError);
      console.log("💔 No data available - graceful failure");
    }
  }
}

async function getFallbackData(): Promise<any> {
  // Simulate fallback data source (cache, free endpoint, etc.)
  return { 
    source: "fallback",
    message: "Limited data from cache",
    timestamp: new Date().toISOString()
  };
}

// Run examples
async function main(): Promise<void> {
  console.log("🚀 x402 Error Handling Examples\n");
  
  await basicErrorHandlingExample();
  await gracefulDegradationExample();
  
  console.log("✨ Examples completed!");
}

main().catch(error => {
  console.error("💥 Fatal error:", error);
  process.exit(1);
});
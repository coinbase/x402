import { config } from "dotenv";
import { privateKeyToAccount } from "viem/accounts";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import type { PaymentRequirements } from "@x402/core/types";

config();

/**
 * Custom x402 Client Implementation
 *
 * This example demonstrates how to implement x402 payment handling manually
 * using only the core packages, without the convenience wrappers like @x402/fetch.
 *
 * This shows you how the payment flow works under the hood:
 * 1. Make initial request to protected endpoint
 * 2. Receive 402 Payment Required with requirements
 * 3. Create payment payload using x402Client
 * 4. Retry request with payment headers
 * 5. Receive success response with settlement headers
 *
 * Use this approach when you need:
 * - Complete control over the HTTP flow
 * - Custom request/response handling
 * - Integration with non-standard HTTP clients
 * - Understanding of the payment protocol internals
 */

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const baseURL = process.env.SERVER_URL || "http://localhost:4021";
const endpointPath = "/weather";
const url = `${baseURL}${endpointPath}`;

/**
 * Makes a request with manual payment handling
 *
 * @param client - The x402 client instance
 * @param url - The URL to make the request to
 */
async function makeRequestWithPayment(client: x402Client, url: string): Promise<void> {
  console.log(`\n🌐 Making initial request to: ${url}\n`);

  // Step 1: Make initial request
  let response = await fetch(url, {
    method: "GET",
  });

  console.log(`📥 Initial response status: ${response.status}\n`);

  // Step 2: Check if payment is required
  if (response.status === 402) {
    console.log("💳 Payment required! Processing payment requirements...\n");

    // Extract payment requirements from response
    const paymentRequirementsHeader = response.headers.get("X-PAYMENT");
    if (!paymentRequirementsHeader) {
      throw new Error("No payment requirements found in 402 response");
    }

    // Parse payment requirements
    const requirementsData = JSON.parse(
      Buffer.from(paymentRequirementsHeader, "base64").toString("utf-8"),
    );
    const requirements: PaymentRequirements[] = Array.isArray(requirementsData.accepts)
      ? requirementsData.accepts
      : [requirementsData.accepts];

    console.log("📋 Payment requirements:");
    requirements.forEach((req, i) => {
      console.log(
        `   ${i + 1}. Network: ${req.network}, Scheme: ${req.scheme}, Price: ${req.price}`,
      );
    });
    console.log();

    // Step 3: Select requirements and create payment
    console.log("🔐 Creating payment payload...\n");
    const selectedRequirements = requirements[0]; // Select first available payment method
    const paymentPayload = await client.createPayment(selectedRequirements);

    // Encode payment payload for header
    const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

    console.log("✅ Payment created successfully\n");

    // Step 4: Retry request with payment
    console.log("🔄 Retrying request with payment...\n");
    response = await fetch(url, {
      method: "GET",
      headers: {
        "X-PAYMENT": paymentHeader,
      },
    });

    console.log(`📥 Response with payment status: ${response.status}\n`);
  }

  // Step 5: Handle success response
  if (response.status === 200) {
    const body = await response.json();
    console.log("✅ Request successful!\n");
    console.log("Response body:", body);

    // Extract settlement information from response headers
    const settlementHeader = response.headers.get("X-PAYMENT-RESPONSE");
    if (settlementHeader) {
      const settlement = JSON.parse(Buffer.from(settlementHeader, "base64").toString("utf-8"));
      console.log("\n💰 Payment Settlement Details:");
      console.log(`   Transaction: ${settlement.transaction}`);
      console.log(`   Network: ${settlement.network}`);
      console.log(`   Payer: ${settlement.payer}`);
    }
  } else {
    throw new Error(`Unexpected response status: ${response.status}`);
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log("\n🔧 Custom x402 Client Implementation Example\n");
  console.log("This example demonstrates manual payment handling without wrappers.\n");

  if (!evmPrivateKey) {
    console.error("❌ EVM_PRIVATE_KEY environment variable is required");
    process.exit(1);
  }

  // Create signer from private key
  const evmSigner = privateKeyToAccount(evmPrivateKey);

  // Create x402 client and register payment scheme
  const client = new x402Client().register("eip155:*", new ExactEvmScheme(evmSigner));

  console.log("✅ Client configured with EVM payment scheme");

  // Make request with manual payment handling
  await makeRequestWithPayment(client, url);

  console.log("\n🎉 Custom implementation completed successfully!");
  console.log("\nKey steps demonstrated:");
  console.log("  1. ✅ Detect 402 Payment Required response");
  console.log("  2. ✅ Parse payment requirements from headers");
  console.log("  3. ✅ Create payment payload using core x402Client");
  console.log("  4. ✅ Retry request with payment headers");
  console.log("  5. ✅ Extract settlement details from response");
}

main().catch(error => {
  console.error("\n❌ Error:", error.message);
  process.exit(1);
});

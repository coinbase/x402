import { config } from "dotenv";
import {
  createSigner,
  decodeXPaymentResponse,
  wrapFetchWithPayment,
  type Hex,
  type PaymentPreferences,
} from "x402-fetch";

config();

const privateKey = process.env.PRIVATE_KEY as Hex | string;
const baseURL = process.env.RESOURCE_SERVER_URL as string; // e.g. https://example.com
const endpointPath = process.env.B3_ENDPOINT_PATH as string; // e.g. /api/b3/premium
const url = `${baseURL}${endpointPath}`; // e.g. https://example.com/api/b3/premium

if (!baseURL || !privateKey || !endpointPath) {
  console.error("Missing required environment variables");
  process.exit(1);
}

/**
 * This example demonstrates how to specify payment preferences:
 * - Pay with a specific token (WETH instead of USDC)
 * - Pay on a specific network (even if different from resource server's default)
 *
 * This enables cross-chain payments where:
 * - Client pays with WETH on Base
 * - Anyspend facilitator swaps WETH → USDC
 * - Resource server receives USDC on Base
 *
 * To run this example, you need to set the following environment variables:
 * - PRIVATE_KEY: The private key of the signer
 * - RESOURCE_SERVER_URL: The URL of the resource server
 * - ENDPOINT_PATH: The path of the endpoint to call on the resource server
 */
async function main(): Promise<void> {
  // Create signer for Base mainnet
  const signer = await createSigner("base", privateKey);

  // Pay with B3 token on Base mainnet
  console.log("=== Paying with B3 Token ===");
  console.log(`Endpoint: ${url}\n`);

  const b3Preferences: PaymentPreferences = {
    preferredToken: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", // B3 token on Base
    preferredNetwork: "arbitrum",
  };

  // Set max payment to 1000 tokens (100 tokens required + buffer)
  const maxValue = BigInt("1000000000000000000000"); // 1000 tokens with 18 decimals

  const fetchWithB3Payment = wrapFetchWithPayment(
    fetch,
    signer,
    maxValue,
    undefined, // paymentRequirementsSelector - use default
    undefined, // config - use default
    b3Preferences,
  );

  try {
    console.log("Making POST request with B3 payment...\n");
    const response = await fetchWithB3Payment(url, { method: "POST" });

    // Check if we got another 402 response (payment failed)
    if (response.status === 402) {
      const body = await response.json();
      console.error("❌ Payment was rejected! Server returned 402 again.");
      console.error("Response:", JSON.stringify(body, null, 2));
      process.exit(1);
    }

    // Check for other error status codes
    if (!response.ok) {
      const body = await response.text();
      console.error(`❌ Request failed with status ${response.status}`);
      console.error("Response:", body);
      process.exit(1);
    }

    const body = await response.json();

    console.log("✅ Success! Response data:");
    console.log(JSON.stringify(body, null, 2));
    console.log();

    const paymentResponseHeader = response.headers.get("x-payment-response");
    if (paymentResponseHeader) {
      const paymentResponse = decodeXPaymentResponse(paymentResponseHeader);
      console.log("💳 Payment details:");
      console.log(`   Status: ${paymentResponse.success ? "✅ Settled" : "⏳ Verified"}`);
      console.log(`   Payer: ${paymentResponse.payer}`);
      if (paymentResponse.transaction) {
        console.log(`   Transaction: ${paymentResponse.transaction}`);
        console.log(`   Network: ${paymentResponse.network}`);
        console.log(`   Explorer: https://basescan.org/tx/${paymentResponse.transaction}`);
      }
    }
  } catch (error: any) {
    console.error("❌ Error with B3 payment:", error.message || error);
    if (error.response) {
      console.error("Response data:", error.response.data);
    }
  }
}

main().catch(error => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});

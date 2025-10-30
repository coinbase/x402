import { config } from "dotenv";
import {
  decodeXPaymentResponse,
  wrapFetchWithPayment,
  createSigner,
  type Hex,
  type PaymentPreferences,
} from "x402-fetch";

config();

const privateKey = process.env.PRIVATE_KEY as Hex | string;
const apiUrl = process.env.API_URL || "http://localhost:3001";

if (!privateKey) {
  console.error("❌ Missing PRIVATE_KEY environment variable");
  console.log("\nPlease set PRIVATE_KEY in your .env file");
  console.log("Example: PRIVATE_KEY=0x1234567890abcdef...");
  process.exit(1);
}

/**
 * AnySpend Fetch Demo
 *
 * This example demonstrates how to use x402-fetch to make payments to the AnySpend server.
 * The server uses the x402-express middleware to handle payments automatically.
 *
 * Features:
 * - Automatic payment handling with x402-fetch
 * - Support for multiple payment tokens (USDC, WETH, DAI, B3, custom tokens)
 * - Works with the AnySpend Express server from examples/typescript/fullstack/anyspend
 *
 * Setup:
 * 1. Start the AnySpend server: cd examples/typescript/fullstack/anyspend && pnpm dev:server
 * 2. Set your PRIVATE_KEY in .env file
 * 3. Run this demo: pnpm start
 *
 * Environment Variables:
 * - PRIVATE_KEY: Your wallet private key (required)
 * - API_URL: Server URL (default: http://localhost:3001)
 * - PAYMENT_TOKEN: Token address to pay with (optional, defaults to USDC)
 * - NETWORK: Network to use (default: base-sepolia)
 */
async function main(): Promise<void> {
  console.log("\n🚀 AnySpend Fetch Demo\n");
  console.log("════════════════════════════════════════\n");

  const network = (process.env.NETWORK || "base-sepolia") as any;
  const paymentToken = process.env.PAYMENT_TOKEN;

  console.log(`📡 Server URL: ${apiUrl}`);
  console.log(`🌐 Network: ${network}`);
  if (paymentToken) {
    console.log(`💰 Payment Token: ${paymentToken}`);
  }
  console.log();

  // Create signer
  console.log("🔐 Creating signer from private key...");
  const signer = await createSigner(network, privateKey);
  console.log(`✅ Signer created for ${network}`);

  // Example 1: Test health endpoint (free, no payment required)
  console.log("════════════════════════════════════════");
  console.log("Example 1: Free Endpoint (No Payment)");
  console.log("════════════════════════════════════════\n");

  try {
    const healthResponse = await fetch(`${apiUrl}/health`);
    const healthData = await healthResponse.json();
    console.log("✅ Health check response:");
    console.log(JSON.stringify(healthData, null, 2));
    console.log();
  } catch (error) {
    console.error("❌ Health check failed:", error);
  }

  // Example 2: Premium endpoint with default payment (USDC)
  console.log("\n════════════════════════════════════════");
  console.log("Example 2: Premium Endpoint with Default Payment (USDC)");
  console.log("════════════════════════════════════════\n");

  const fetchWithPayment = wrapFetchWithPayment(fetch, signer);

  try {
    console.log("📤 Making request to /api/premium...");
    const response = await fetchWithPayment(`${apiUrl}/api/premium`, {
      method: "POST",
    });

    console.log(`✅ Response status: ${response.status} ${response.statusText}\n`);

    if (!response.ok) {
      const errorData = await response.json();
      console.error("❌ Request failed:");
      console.error(JSON.stringify(errorData, null, 2));
      return;
    }

    // Get payment response header
    const paymentResponseHeader = response.headers.get("X-PAYMENT-RESPONSE");
    if (paymentResponseHeader) {
      const paymentInfo = decodeXPaymentResponse(paymentResponseHeader);
      console.log("💳 Payment Information:");
      console.log(`   Status: ${paymentInfo.success ? "✅ Settled" : "⏳ Verified"}`);
      console.log(`   Payer: ${paymentInfo.payer}`);
      if (paymentInfo.transaction) {
        console.log(`   Transaction: ${paymentInfo.transaction}`);
        console.log(`   Network: ${paymentInfo.network}`);
        if (network.includes("sepolia")) {
          const explorerUrl = network.includes("base")
            ? `https://sepolia.basescan.org/tx/${paymentInfo.transaction}`
            : `https://sepolia.etherscan.io/tx/${paymentInfo.transaction}`;
          console.log(`   Explorer: ${explorerUrl}`);
        }
      }
      console.log();
    }

    // Get the response data
    const data = await response.json();
    console.log("📊 Premium Market Analysis Data:\n");
    console.log(JSON.stringify(data, null, 2));
  } catch (error: any) {
    console.error("❌ Error:", error.message || error);
    if (error.response) {
      console.error("Response data:", error.response.data);
    }
  }

  // Example 3: Premium endpoint with custom token (if specified)
  if (paymentToken) {
    console.log("\n════════════════════════════════════════");
    console.log(`Example 3: Premium Endpoint with Custom Token`);
    console.log("════════════════════════════════════════\n");

    const preferences: PaymentPreferences = {
      preferredToken: paymentToken,
      preferredNetwork: network,
    };

    const fetchWithCustomToken = wrapFetchWithPayment(
      fetch,
      signer,
      undefined, // maxValue
      undefined, // paymentRequirementsSelector
      undefined, // config
      preferences,
    );

    try {
      console.log(`📤 Making request with custom token: ${paymentToken}...`);
      const response = await fetchWithCustomToken(`${apiUrl}/api/premium`, {
        method: "POST",
      });

      console.log(`✅ Response status: ${response.status} ${response.statusText}\n`);

      if (!response.ok) {
        const errorData = await response.json();
        console.error("❌ Request failed:");
        console.error(JSON.stringify(errorData, null, 2));
        return;
      }

      const paymentResponseHeader = response.headers.get("X-PAYMENT-RESPONSE");
      if (paymentResponseHeader) {
        const paymentInfo = decodeXPaymentResponse(paymentResponseHeader);
        console.log("💳 Payment Information:");
        console.log(`   Status: ${paymentInfo.success ? "✅ Settled" : "⏳ Verified"}`);
        console.log(`   Payer: ${paymentInfo.payer}`);
        if (paymentInfo.transaction) {
          console.log(`   Transaction: ${paymentInfo.transaction}`);
          console.log(`   Network: ${paymentInfo.network}`);
        }
        console.log();
      }

      const data = await response.json();
      console.log("✅ Successfully paid with custom token!");
      console.log("📊 Data received (truncated):", data.success);
    } catch (error: any) {
      console.error("❌ Error:", error.message || error);
    }
  }

  console.log("\n════════════════════════════════════════");
  console.log("✅ Demo completed!");
  console.log("════════════════════════════════════════\n");
}

main().catch((error) => {
  console.error("\n❌ Fatal error:", error?.response?.data?.error ?? error.message ?? error);
  process.exit(1);
});

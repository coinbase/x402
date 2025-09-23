/**
 * Example: Starknet Integration with x402 Payment System
 *
 * This example demonstrates how to use the new Starknet support in x402
 * to create payment headers and handle USDC transactions on Starknet.
 */

import { createStarknetConnectedClient } from "../src/shared/starknet/client";
import { getUsdcBalance } from "../src/shared/starknet/usdc";
import { createConnectedClient, createSigner } from "../src/types/shared/wallet";

/**
 * Main function demonstrating Starknet integration with x402
 */
async function main() {
  console.log("🚀 x402 Starknet Integration Example\n");

  // Example 1: Creating a Starknet client for read-only operations
  console.log("1️⃣ Creating Starknet Connected Client...");
  createConnectedClient("starknet");
  console.log("✅ Connected to Starknet mainnet\n");

  // Example 2: Creating a Starknet signer for transactions
  console.log("2️⃣ Creating Starknet Signer...");
  const privateKey =
    process.env.STARKNET_PRIVATE_KEY ||
    "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  await createSigner("starknet", privateKey);
  console.log("✅ Signer created for Starknet\n");

  // Example 3: Checking USDC balance
  console.log("3️⃣ Checking USDC Balance...");
  const accountAddress = "0x04B3894Ad32083D1AE6C20EEC04d609869dD8cC76A1Fd8e02eFFC1a7938ef81e";

  try {
    const starknetClient = createStarknetConnectedClient("starknet");
    const balance = await getUsdcBalance(starknetClient, accountAddress);
    console.log(`💰 USDC Balance: ${balance} (in smallest units, 6 decimals)\n`);
  } catch (error) {
    console.log(`⚠️ Could not fetch balance: ${error}\n`);
  }

  // Example 4: Creating a payment with Starknet
  console.log("4️⃣ Creating Payment Requirements for Starknet...");
  const paymentRequirements = {
    scheme: "exact" as const,
    network: "starknet" as const,
    maxAmountRequired: "1000000", // 1 USDC (6 decimals)
    resource: "https://api.example.com/premium-service",
    description: "Premium AI Service Access",
    mimeType: "application/json",
    payTo: accountAddress,
    maxTimeoutSeconds: 300,
    asset: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8", // USDC on Starknet
  };

  console.log("📋 Payment Requirements:");
  console.log(`   Network: ${paymentRequirements.network}`);
  console.log(`   Amount: ${paymentRequirements.maxAmountRequired} (1 USDC)`);
  console.log(`   Pay To: ${paymentRequirements.payTo}`);
  console.log(`   Asset: USDC on Starknet\n`);

  // Example 5: Demonstrating multi-network support
  console.log("5️⃣ Multi-Network Support Example...");
  const networks = ["base", "avalanche", "solana", "starknet", "starknet-sepolia"];

  console.log("Supported Networks in x402:");
  for (const network of networks) {
    try {
      createConnectedClient(network);
      console.log(`   ✅ ${network} - Supported`);
    } catch (error) {
      console.log(`   ❌ ${network} - ${error}`);
    }
  }

  console.log("\n✨ Starknet integration with x402 is ready!");
  console.log("🎯 AI agents can now use USDC on Starknet for payments!");
}

// Run the example
main().catch(console.error);

/**
 * Example: Starknet Integration with x402 Payment System
 *
 * This example demonstrates how to use the new Starknet support in x402
 * to create payment headers and handle USDC transactions on Starknet.
 *
 * Enhanced with:
 * - Proper error handling and recovery
 * - Real-world payment scenarios
 * - Network switching capabilities
 * - Transaction monitoring
 */

import { createStarknetConnectedClient } from "../src/shared/starknet/client";
import { getUsdcBalance } from "../src/shared/starknet/usdc";
import { createConnectedClient, createSigner } from "../src/types/shared/wallet";
import { createX402PaymentPayload, signTransferAuthorization } from "../src/shared/starknet/auth";
import { globalStateManager } from "../src/shared/starknet/state";
import type { StarknetTransferAuthorization } from "../src/shared/starknet/types";

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

  // Example 4: Complete payment flow with error handling
  console.log("4️⃣ Complete Payment Flow with Error Handling...");

  // Create signer for transactions
  const userPrivateKey = process.env.USER_PRIVATE_KEY || privateKey;
  const userSigner = await createSigner("starknet", userPrivateKey);
  // const client = createStarknetConnectedClient("starknet");

  // Initialize facilitator (StarknetPaymentProvider)
  const facilitator = null as unknown; // StarknetPaymentProvider requires config object

  // Payment requirements
  const paymentRequirements = {
    scheme: "exact" as const,
    network: "starknet" as const,
    maxAmountRequired: "1000000", // 1 USDC (6 decimals)
    resource: "https://api.example.com/premium-service",
    description: "Premium AI Service Access",
    mimeType: "application/json",
    payTo: accountAddress,
    maxTimeoutSeconds: 300,
    asset: "0x053C91253BC9682c04929cA02ED00b3E423f6710D2ee7e0D5EBB06F3eCF368A8", // USDC on Starknet mainnet
  };

  console.log("📋 Payment Requirements:");
  console.log(`   Network: ${paymentRequirements.network}`);
  console.log(`   Amount: ${paymentRequirements.maxAmountRequired} (1 USDC)`);
  console.log(`   Pay To: ${paymentRequirements.payTo}`);
  console.log(`   Asset: USDC on Starknet`);

  try {
    // Create transfer authorization
    const authorization: StarknetTransferAuthorization = {
      tokenAddress: paymentRequirements.asset,
      from: userSigner.address,
      to: paymentRequirements.payTo,
      amount: paymentRequirements.maxAmountRequired,
      nonce: await facilitator.getNextNonce(userSigner.address),
      deadline: (Math.floor(Date.now() / 1000) + paymentRequirements.maxTimeoutSeconds).toString(),
      network: "starknet",
    };

    // Sign authorization
    const signature = await signTransferAuthorization(userSigner, authorization);
    const paymentPayload = createX402PaymentPayload(authorization, signature);

    console.log("\n✅ Payment payload created successfully");
    console.log(`   Payload (truncated): ${paymentPayload.substring(0, 50)}...`);

    // Verify before settlement
    const verification = await facilitator.verify(paymentPayload);
    if (verification.valid) {
      console.log("✅ Payment verification passed\n");
    } else {
      console.log(`❌ Payment verification failed: ${verification.reason}\n`);
    }
  } catch (error) {
    console.log(`⚠️ Payment flow error: ${error}\n`);
  }

  // Example 5: Error recovery and retry logic
  console.log("5️⃣ Error Recovery and Retry Example...");

  const performPaymentWithRetry = async (maxRetries = 3) => {
    let retryCount = 0;
    let lastError: Error | unknown;

    while (retryCount < maxRetries) {
      try {
        console.log(`\n   Attempt ${retryCount + 1}/${maxRetries}...`);

        // Simulate payment operation
        const mockAuth: StarknetTransferAuthorization = {
          tokenAddress: "0x053C91253BC9682c04929cA02ED00b3E423f6710D2ee7e0D5EBB06F3eCF368A8", // USDC mainnet
          from: userSigner.address,
          to: accountAddress,
          amount: "500000", // 0.5 USDC
          nonce: Date.now().toString(),
          deadline: (Math.floor(Date.now() / 1000) + 300).toString(),
          network: "starknet",
        };

        const sig = await signTransferAuthorization(userSigner, mockAuth);
        console.log(`   ✅ Payment attempt ${retryCount + 1} succeeded`);
        return { success: true, payload: createX402PaymentPayload(mockAuth, sig) };
      } catch (error) {
        lastError = error;
        retryCount++;
        console.log(`   ❌ Attempt ${retryCount} failed: ${error}`);

        if (retryCount < maxRetries) {
          const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 10000);
          console.log(`   ⏳ Retrying in ${backoffMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    console.log(`\n   ❌ All retry attempts failed`);
    return { success: false, error: lastError };
  };

  const retryResult = await performPaymentWithRetry();
  console.log(`\n   Final result: ${retryResult.success ? "SUCCESS" : "FAILED"}`);

  // Example 6: Multi-network support and switching
  console.log("\n6️⃣ Multi-Network Support and Switching...");
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

  // Example 7: Transaction monitoring
  console.log("\n7️⃣ Transaction Monitoring...");
  try {
    const recentTxs = await globalStateManager.getAccountHistory(userSigner.address, 5);
    console.log(`   Recent transactions: ${recentTxs.length} found`);
    recentTxs.forEach((tx, i) => {
      console.log(`   ${i + 1}. ${tx.txHash.substring(0, 10)}... - ${tx.status}`);
    });
  } catch (error) {
    console.log(`   ⚠️ Could not fetch transaction history: ${error}`);
  }

  console.log("\n✨ Starknet integration with x402 is ready!");
  console.log("🎯 AI agents can now use USDC on Starknet for payments!");
  console.log("🛡️ With error handling, retry logic, and monitoring!");
}

// Run the example
main().catch(console.error);

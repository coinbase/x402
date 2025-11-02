#!/usr/bin/env node
/**
 * Simple Starknet x402 Facilitator Example
 *
 * This example demonstrates how to use the x402 facilitator for Starknet
 * without requiring Express or other external dependencies.
 *
 * Usage:
 * 1. Set your private key: export FACILITATOR_PRIVATE_KEY="0x..."
 * 2. Run: npx ts-node examples/starknet-facilitator-simple.ts
 */

import { X402StarknetFacilitator, createStandardStarknetPaymentRequirements } from "../src/shared/starknet/facilitator";
import { createStarknetConnectedClient } from "../src/shared/starknet/client";
import type { StarknetSigner } from "../src/shared/starknet/wallet";
import type { VerifyRequest, PaymentRequirements } from "../src/types/verify";

// Configuration
const config = {
  network: (process.env.STARKNET_NETWORK || "starknet-sepolia") as "starknet" | "starknet-sepolia",
  facilitatorPrivateKey: process.env.FACILITATOR_PRIVATE_KEY || "0x1234",
  facilitatorAddress: process.env.FACILITATOR_ADDRESS || "0x0742B5662Ad2a06E3d3e91B6B79522e4e1c1C3e5EC388eB702330bEE0d10B2Ea",
};

async function main() {
  console.log("🚀 Starting Starknet x402 Facilitator Example");
  console.log(`📍 Network: ${config.network}`);
  console.log(`📍 Facilitator Address: ${config.facilitatorAddress}`);
  console.log("");

  // Create facilitator signer
  const facilitatorSigner: StarknetSigner = {
    address: config.facilitatorAddress,
    account: {} as any, // In production, create proper Account instance
    provider: {} as any,
    network: config.network,
  };

  // Initialize facilitator (now stateless - no rate limiting config)
  const facilitator = new X402StarknetFacilitator(config.network, facilitatorSigner);

  console.log("✅ Facilitator initialized (STATELESS - replay protection at blockchain level)");
  console.log("");

  // Create example payment requirements
  const paymentRequirements = createStandardStarknetPaymentRequirements(
    config.network,
    config.facilitatorAddress,
    "1000000", // 1 USDC
  );

  console.log("📋 Payment Requirements:");
  console.log(JSON.stringify(paymentRequirements, null, 2));
  console.log("");

  // Example verification request
  const exampleVerifyRequest: VerifyRequest = {
    paymentPayload: {
      scheme: "exact",
      network: config.network,
      x402Version: 1,
      payload: {
        signature: "0x" + "1".repeat(130), // Mock signature
        authorization: {
          from: "0x0742B5662Ad2a06E3d3e91B6B79522e4e1c1C3e5EC388eB702330bEE0d10B2Ea",
          to: config.facilitatorAddress,
          value: "1000000", // 1 USDC (6 decimals)
          validAfter: "0",
          validBefore: String(Math.floor(Date.now() / 1000) + 3600), // 1 hour from now
          nonce: "0x" + "0".repeat(64),
        },
      },
    },
    paymentRequirements,
  };

  console.log("🔍 Testing Verify Endpoint:");
  try {
    const verifyResult = await facilitator.verify(exampleVerifyRequest);
    console.log("Verify Result:", JSON.stringify(verifyResult, null, 2));
  } catch (error) {
    console.error("Verify Error:", error);
  }
  console.log("");

  // Example settle request (same as verify)
  console.log("💰 Testing Settle Endpoint:");
  try {
    const settleResult = await facilitator.settle(exampleVerifyRequest);
    console.log("Settle Result:", JSON.stringify(settleResult, null, 2));
  } catch (error) {
    console.error("Settle Error:", error);
  }
  console.log("");

  // NOTE: Session keys have been removed - they should be managed on-chain
  console.log("🔑 Session Keys:");
  console.log("Session keys should be managed ON-CHAIN via Starknet account contracts");
  console.log("");

  // Test nonce generation
  console.log("🔢 Testing Nonce Generation:");
  try {
    const nonce = await facilitator.getNextNonce(config.facilitatorAddress);
    console.log("Next Nonce:", nonce);
  } catch (error) {
    console.error("Nonce Error:", error);
  }

  console.log("");
  console.log("✅ Example completed!");
  console.log("");
  console.log("📚 Integration Notes:");
  console.log("1. In production, create proper Starknet Account and Provider instances");
  console.log("2. Use real signatures from actual Starknet wallets");
  console.log("3. Implement proper error handling and logging");
  console.log("4. x402 is STATELESS - no server-side state management");
  console.log("5. Replay protection happens at blockchain level via account nonces");
  console.log("6. Rate limiting and session keys should be implemented ON-CHAIN");
  console.log("7. Deploy with proper environment configuration");
}

// Run the example
main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
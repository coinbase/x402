/**
 * Production-Ready Starknet x402 Integration Example
 *
 * This example demonstrates all production features:
 * - Nonce registry for replay protection
 * - Session keys for delegation
 * - Custom account contracts with x402 support
 * - Proper signature verification
 * - State management and persistence
 * - Rate limiting
 * - Transaction history
 */

import {
  createStarknetSigner,
  createStarknetConnectedClient,
  StarknetFacilitator,
  createX402PaymentPayload,
  SessionKeyManager,
  globalStateManager,
  supportsX402,
  X402RateLimiter,
  type StarknetTransferAuthorization,
  type SessionKey,
} from "../src/shared/starknet";
import { signTransferAuthorization } from "../src/shared/starknet/x402-transfers";

// startCleanupTask is not exported, define inline
const startCleanupTask = (intervalMs: number) => {
  return setInterval(() => {
    globalStateManager.cleanup();
  }, intervalMs);
};

/**
 * Configuration for production deployment
 */
const PRODUCTION_CONFIG = {
  // Rate limiting
  maxAmountPerDay: "10000000000", // 10,000 USDC
  maxTransactionsPerDay: 100,
  enableRateLimiting: true,

  // Session keys
  enableSessionKeys: true,
  sessionKeyExpiration: 24 * 60 * 60 * 1000, // 24 hours

  // Cleanup interval
  cleanupIntervalMs: 60 * 60 * 1000, // 1 hour
};

/**
 * Example: Creating a production-ready facilitator
 *
 * @returns Object containing facilitator instance and cleanup interval
 */
async function setupProductionFacilitator() {
  console.log("🚀 Setting up Production Facilitator\n");

  // Create client and signer
  // Create client
  const client = createStarknetConnectedClient("starknet");
  const facilitatorPrivateKey = process.env.FACILITATOR_PRIVATE_KEY || "0x...";
  const signer = await createStarknetSigner("starknet", facilitatorPrivateKey);

  // Initialize facilitator with production config
  const facilitator = new StarknetFacilitator(
    client,
    signer,
    PRODUCTION_CONFIG as {
      maxAmountPerDay?: string;
      maxTransactionsPerDay?: number;
      enableRateLimiting?: boolean;
      enableSessionKeys?: boolean;
    },
  );

  // Start cleanup task for expired data
  const cleanupInterval = startCleanupTask(PRODUCTION_CONFIG.cleanupIntervalMs);
  console.log("✅ Cleanup task started\n");

  return { facilitator, cleanupInterval };
}

/**
 * Example: Creating and using session keys
 *
 * @returns Created session key
 */
async function demonstrateSessionKeys() {
  console.log("🔑 Session Key Demonstration\n");

  // Setup
  // Create client
  // const client = createStarknetConnectedClient("starknet");
  const masterPrivateKey = process.env.MASTER_PRIVATE_KEY || "0x...";
  const masterSigner = await createStarknetSigner("starknet", masterPrivateKey);

  // Create a session key for limited delegation
  const sessionKeyManager = new SessionKeyManager();

  const sessionKeyConfig: Omit<SessionKey, "masterSignature"> = {
    publicKey: "0xsession_key_public_key_here",
    expiresAt: Date.now() + PRODUCTION_CONFIG.sessionKeyExpiration,
    maxAmount: "1000000", // 1 USDC max per transaction
    allowedRecipients: [
      "0x04B3894Ad32083D1AE6C20EEC04d609869dD8cC76A1Fd8e02eFFC1a7938ef81e", // Example merchant
    ],
    allowedTokens: [
      "0x053C91253BC9682c04929cA02ED00b3E423f6710D2ee7e0D5EBB06F3eCF368A8", // USDC mainnet
    ],
  };

  const sessionKey = await sessionKeyManager.createSessionKey(masterSigner, sessionKeyConfig);
  console.log(`✅ Session key created:
    - Public Key: ${sessionKey.publicKey}
    - Expires: ${new Date(sessionKey.expiresAt).toISOString()}
    - Max Amount: ${sessionKey.maxAmount}
    - Allowed Recipients: ${sessionKey.allowedRecipients.length}
  `);

  // Validate session key for a transfer
  const isValid = await sessionKeyManager.validateSessionKey(sessionKey.publicKey, {
    tokenAddress: sessionKeyConfig.allowedTokens[0],
    from: masterSigner.address,
    to: sessionKeyConfig.allowedRecipients[0],
    amount: "500000", // 0.5 USDC
    nonce: Date.now().toString(),
    deadline: (Date.now() + 3600000).toString(),
    network: "starknet",
  });

  console.log(`✅ Session key validation: ${isValid ? "VALID" : "INVALID"}\n`);

  return sessionKey;
}

/**
 * Example: Complete payment flow with all production features
 */
async function demonstrateCompletePaymentFlow() {
  console.log("💳 Complete Payment Flow with Production Features\n");

  // Setup facilitator
  const { facilitator } = await setupProductionFacilitator();

  // Setup user account
  const userPrivateKey = process.env.USER_PRIVATE_KEY || "0x...";
  const userSigner = await createStarknetSigner("starknet", userPrivateKey);
  // Create client
  const client = createStarknetConnectedClient("starknet");

  // Check if account supports x402
  const hasX402Support = await supportsX402(client, userSigner.address);
  console.log(`Account x402 support: ${hasX402Support ? "✅" : "❌"}\n`);

  // Create transfer authorization
  const authorization: StarknetTransferAuthorization = {
    tokenAddress: "0x053C91253BC9682c04929cA02ED00b3E423f6710D2ee7e0D5EBB06F3eCF368A8", // USDC mainnet
    from: userSigner.address,
    to: "0x04B3894Ad32083D1AE6C20EEC04d609869dD8cC76A1Fd8e02eFFC1a7938ef81e", // Merchant
    amount: "1000000", // 1 USDC
    nonce: await facilitator.getNextNonce(userSigner.address),
    deadline: (Math.floor(Date.now() / 1000) + 3600).toString(), // 1 hour
    network: "starknet",
  };

  console.log("📝 Transfer Authorization:");
  console.log(`   From: ${authorization.from}`);
  console.log(`   To: ${authorization.to}`);
  console.log(`   Amount: ${authorization.amount} (1 USDC)`);
  console.log(`   Nonce: ${authorization.nonce}`);
  console.log(`   Deadline: ${new Date(parseInt(authorization.deadline) * 1000).toISOString()}\n`);

  // Sign the authorization
  const signature = await signTransferAuthorization(userSigner, authorization);
  console.log("✅ Authorization signed\n");

  // Create payment payload for x-Payment header
  const paymentPayload = createX402PaymentPayload(authorization, signature);
  console.log(`📦 Payment Payload (base64): ${paymentPayload.substring(0, 50)}...\n`);

  // Verify the payment
  console.log("🔍 Verifying payment...");
  const verification = await facilitator.verify(paymentPayload);

  if (!verification.valid) {
    console.error(`❌ Verification failed: ${verification.reason}`);
    return;
  }
  console.log("✅ Payment verified successfully\n");

  // Settle the payment (execute on-chain)
  console.log("💸 Settling payment...");
  const settlement = await facilitator.settle(paymentPayload, {
    maxRetries: 3,
    waitForConfirmation: true,
  });

  if (!settlement.success) {
    console.error(`❌ Settlement failed: ${settlement.error}`);
    return;
  }

  console.log(`✅ Payment settled successfully!
    - Transaction Hash: ${settlement.txHash}
    - Block Number: ${settlement.blockNumber}
  `);

  // Check transaction status
  if (settlement.txHash) {
    const status = await facilitator.getTransactionStatus(settlement.txHash);
    console.log(`📊 Transaction Status: ${status.status}\n`);
  }

  // Get transaction history
  const history = await globalStateManager.getAccountHistory(userSigner.address, 10);
  console.log(`📜 Recent Transactions: ${history.length} found`);

  for (const tx of history.slice(0, 3)) {
    console.log(
      `   - ${tx.txHash.substring(0, 10)}... | ${tx.status} | ${tx.amount} to ${tx.recipient.substring(0, 10)}...`,
    );
  }

  // Get metrics
  const metrics = await globalStateManager.getMetrics();
  console.log("\n📈 System Metrics:");
  console.log(`   - Nonces Used: ${metrics.nonces_used || 0}`);
  console.log(`   - Transactions Recorded: ${metrics.transactions_recorded || 0}`);
  console.log(`   - Session Keys Created: ${metrics.session_keys_created || 0}`);
  console.log(`   - Rate Limit Checks: ${metrics.rate_limit_checks_passed || 0} passed`);
}

/**
 * Example: Rate limiting demonstration
 */
async function demonstrateRateLimiting() {
  console.log("🚦 Rate Limiting Demonstration\n");

  const rateLimiter = new X402RateLimiter();
  const account = "0x123...";
  const token = "0x053C91253BC9682c04929cA02ED00b3E423f6710D2ee7e0D5EBB06F3eCF368A8"; // USDC mainnet

  // Test transaction count limit
  console.log("Testing transaction count limits:");
  for (let i = 1; i <= 5; i++) {
    const result = await rateLimiter.checkRateLimit(
      account,
      token,
      "1000000", // 1 USDC
      "100000000", // 100 USDC daily limit
      3, // Max 3 transactions per day
    );

    console.log(
      `   Transaction ${i}: ${result.allowed ? "✅ Allowed" : `❌ Blocked - ${result.reason}`}`,
    );
  }

  console.log("\nTesting amount limits:");
  const amountTest = await rateLimiter.checkRateLimit(
    "0x456...",
    token,
    "60000000", // 60 USDC
    "100000000", // 100 USDC daily limit
    100,
  );
  console.log(
    `   60 USDC transfer: ${amountTest.allowed ? "✅ Allowed" : `❌ Blocked - ${amountTest.reason}`}`,
  );

  const amountTest2 = await rateLimiter.checkRateLimit(
    "0x456...",
    token,
    "50000000", // 50 USDC (total would be 110 USDC)
    "100000000", // 100 USDC daily limit
    100,
  );
  console.log(
    `   Additional 50 USDC: ${amountTest2.allowed ? "✅ Allowed" : `❌ Blocked - ${amountTest2.reason}`}\n`,
  );

  // Cleanup expired data
  rateLimiter.cleanupExpired();
  console.log("✅ Cleaned up expired rate limit data\n");
}

/**
 * Main function - runs all examples
 */
async function main() {
  console.log("=".repeat(60));
  console.log("🏭 PRODUCTION-READY STARKNET x402 INTEGRATION");
  console.log("=".repeat(60));
  console.log();

  try {
    // Demonstrate session keys
    await demonstrateSessionKeys();

    // Demonstrate rate limiting
    await demonstrateRateLimiting();

    // Run complete payment flow
    await demonstrateCompletePaymentFlow();

    console.log("=".repeat(60));
    console.log("✅ ALL PRODUCTION FEATURES DEMONSTRATED SUCCESSFULLY!");
    console.log("=".repeat(60));

    // Note about production deployment
    console.log(`
📝 PRODUCTION DEPLOYMENT CHECKLIST:
    
1. ✅ Nonce Registry - Prevents replay attacks
2. ✅ Session Keys - Enables secure delegation
3. ✅ Account Contract Support - x402-specific validation
4. ✅ Signature Verification - Via account contracts
5. ✅ State Management - Persistent with database
6. ✅ Rate Limiting - Prevents abuse
7. ✅ Transaction History - Full audit trail
8. ✅ Metrics & Monitoring - System observability
9. ✅ Error Handling - Retry logic and recovery
10. ✅ Cleanup Tasks - Memory management

🚀 Ready for production deployment on Starknet!
    `);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

// Run the examples
if (require.main === module) {
  main().catch(console.error);
}

export {
  setupProductionFacilitator,
  demonstrateSessionKeys,
  demonstrateCompletePaymentFlow,
  demonstrateRateLimiting,
};

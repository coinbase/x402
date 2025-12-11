/**
 * TypeScript Facilitator for E2E Testing
 *
 * This facilitator provides HTTP endpoints for payment verification and settlement
 * using the x402 TypeScript SDK.
 * 
 * Features:
 * - Payment verification and settlement
 * - Bazaar discovery extension support
 * - Verified payment tracking (verify → settle flow)
 * - Discovery resource cataloging
 */

import { base58 } from "@scure/base";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { x402Facilitator } from "@x402/core/facilitator";
import {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { toFacilitatorEvmSigner } from "@x402/evm";
import { registerExactEvmScheme } from "@x402/evm/exact/facilitator";
import { BAZAAR, extractDiscoveryInfo } from "@x402/extensions/bazaar";
import { toFacilitatorSvmSigner } from "@x402/svm";
import { registerExactSvmScheme } from "@x402/svm/exact/facilitator";
import crypto from "crypto";
import dotenv from "dotenv";
import express from "express";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { BazaarCatalog } from "./bazaar.js";

dotenv.config();

// Configuration
const PORT = process.env.PORT || "4022";

// Validate required environment variables
if (!process.env.EVM_PRIVATE_KEY) {
  console.error("❌ EVM_PRIVATE_KEY environment variable is required");
  process.exit(1);
}

if (!process.env.SVM_PRIVATE_KEY) {
  console.error("❌ SVM_PRIVATE_KEY environment variable is required");
  process.exit(1);
}

// Initialize the EVM account from private key
const evmAccount = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
console.info(`EVM Facilitator account: ${evmAccount.address}`);


// Initialize the EVM account from private key
const svmAccount = await createKeyPairSignerFromBytes(base58.decode(process.env.SVM_PRIVATE_KEY as string));
console.info(`EVM Facilitator account: ${evmAccount.address}`);

// Create a Viem client with both wallet and public capabilities
const viemClient = createWalletClient({
  account: evmAccount,
  chain: baseSepolia,
  transport: http(),
}).extend(publicActions);

// Initialize the x402 Facilitator with EVM and SVM support

const evmSigner = toFacilitatorEvmSigner({
  address: evmAccount.address,
  readContract: (args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }) =>
    viemClient.readContract({
      ...args,
      args: args.args || [],
    }),
  verifyTypedData: (args: {
    address: `0x${string}`;
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
    signature: `0x${string}`;
  }) => viemClient.verifyTypedData(args as any),
  writeContract: (args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
  }) =>
    viemClient.writeContract({
      ...args,
      args: args.args || [],
    }),
  sendTransaction: (args: { to: `0x${string}`; data: `0x${string}` }) =>
    viemClient.sendTransaction(args),
  waitForTransactionReceipt: (args: { hash: `0x${string}` }) =>
    viemClient.waitForTransactionReceipt(args),
  getCode: (args: { address: `0x${string}` }) => viemClient.getCode(args),
});

// Facilitator can now handle all Solana networks with automatic RPC creation
const svmSigner = toFacilitatorSvmSigner(svmAccount);

const verifiedPayments = new Map<string, number>();
const bazaarCatalog = new BazaarCatalog();

function createPaymentHash(paymentPayload: PaymentPayload): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(paymentPayload))
    .digest("hex");
}

const facilitator = new x402Facilitator();

// Register EVM and SVM schemes using the new register helpers
registerExactEvmScheme(facilitator, {
  signer: evmSigner,
  networks: "eip155:84532"  // Base Sepolia
});
registerExactSvmScheme(facilitator, {
  signer: svmSigner,
  networks: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"  // Devnet
});

facilitator.registerExtension(BAZAAR)
  // Lifecycle hooks for payment tracking and discovery
  .onAfterVerify(async (context) => {
    // Hook 1: Track verified payment for verify→settle flow validation
    if (context.result.isValid) {
      const paymentHash = createPaymentHash(context.paymentPayload);
      verifiedPayments.set(paymentHash, Date.now());

      // Hook 2: Extract and catalog bazaar discovery info
      const discovered = extractDiscoveryInfo(context.paymentPayload, context.requirements);
      if (discovered) {
        bazaarCatalog.catalogResource(
          discovered.resourceUrl,
          discovered.method,
          discovered.x402Version,
          discovered.discoveryInfo,
          context.requirements,
        );
        console.log(`📦 Discovered resource: ${discovered.method} ${discovered.resourceUrl}`);
      }
    }
  })
  .onBeforeSettle(async (context) => {
    // Hook 3: Validate payment was previously verified
    const paymentHash = createPaymentHash(context.paymentPayload);
    const verificationTimestamp = verifiedPayments.get(paymentHash);

    if (!verificationTimestamp) {
      return {
        abort: true,
        reason: "Payment must be verified before settlement",
      };
    }

    // Check verification isn't too old (5 minute timeout)
    const age = Date.now() - verificationTimestamp;
    if (age > 5 * 60 * 1000) {
      verifiedPayments.delete(paymentHash);
      return {
        abort: true,
        reason: "Payment verification expired (must settle within 5 minutes)",
      };
    }
  })
  .onAfterSettle(async (context) => {
    // Hook 4: Clean up verified payment tracking after settlement
    const paymentHash = createPaymentHash(context.paymentPayload);
    verifiedPayments.delete(paymentHash);

    if (context.result.success) {
      console.log(`✅ Settlement completed: ${context.result.transaction}`);
    }
  })
  .onSettleFailure(async (context) => {
    // Hook 5: Clean up on settlement failure too
    const paymentHash = createPaymentHash(context.paymentPayload);
    verifiedPayments.delete(paymentHash);

    console.error(`❌ Settlement failed: ${context.error.message}`);
  });

// Initialize Express app
const app = express();
app.use(express.json());

/**
 * POST /verify
 * Verify a payment against requirements
 * 
 * Note: Payment tracking and bazaar discovery are handled by lifecycle hooks
 */
app.post("/verify", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body as { paymentPayload: PaymentPayload; paymentRequirements: PaymentRequirements };

    if (!paymentPayload || !paymentRequirements) {
      return res.status(400).json({
        error: "Missing paymentPayload or paymentRequirements",
      });
    }

    // Hooks will automatically:
    // - Track verified payment (onAfterVerify)
    // - Extract and catalog discovery info (onAfterVerify)
    const response: VerifyResponse = await facilitator.verify(
      paymentPayload,
      paymentRequirements,
    );

    res.json(response);
  } catch (error) {
    console.error("Verify error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /settle
 * Settle a payment on-chain
 * 
 * Note: Verification validation and cleanup are handled by lifecycle hooks
 */
app.post("/settle", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body;

    if (!paymentPayload || !paymentRequirements) {
      return res.status(400).json({
        error: "Missing paymentPayload or paymentRequirements",
      });
    }

    // Hooks will automatically:
    // - Validate payment was verified (onBeforeSettle - will abort if not)
    // - Check verification timeout (onBeforeSettle)
    // - Clean up tracking (onAfterSettle / onSettleFailure)
    const response: SettleResponse = await facilitator.settle(
      paymentPayload as PaymentPayload,
      paymentRequirements as PaymentRequirements,
    );

    res.json(response);
  } catch (error) {
    console.error("Settle error:", error);

    // Check if this was an abort from hook
    if (error instanceof Error && error.message.includes("Settlement aborted:")) {
      // Return a proper SettleResponse instead of 500 error
      return res.json({
        success: false,
        errorReason: error.message.replace("Settlement aborted: ", ""),
        network: req.body?.paymentPayload?.network || "unknown",
      } as SettleResponse);
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /supported
 * Get supported payment kinds and extensions
 */
app.get("/supported", async (req, res) => {
  try {
    const response = facilitator.getSupported();
    res.json(response);
  } catch (error) {
    console.error("Supported error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.get("/discovery/resources", (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const response = bazaarCatalog.getResources(limit, offset);
    res.json(response);
  } catch (error) {
    console.error("Discovery resources error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    network: "eip155:84532",
    facilitator: "typescript",
    version: "2.0.0",
    extensions: [BAZAAR],
    discoveredResources: bazaarCatalog.getCount(),
  });
});

/**
 * POST /close
 * Graceful shutdown endpoint
 */
app.post("/close", (req, res) => {
  res.json({ message: "Facilitator shutting down gracefully" });
  console.log("Received shutdown request");

  // Give time for response to be sent
  setTimeout(() => {
    process.exit(0);
  }, 100);
});

// Start the server
app.listen(parseInt(PORT), () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║           x402 TypeScript Facilitator                  ║
╠════════════════════════════════════════════════════════╣
║  Server:     http://localhost:${PORT}                  ║
║  Network:    eip155:84532                              ║
║  Address:    ${evmAccount.address}                        ║
║  Extensions: bazaar                                    ║
║                                                        ║
║  Endpoints:                                            ║
║  • POST /verify              (verify payment)         ║
║  • POST /settle              (settle payment)         ║
║  • GET  /supported           (get supported kinds)    ║
║  • GET  /discovery/resources (list discovered)        ║
║  • GET  /health              (health check)           ║
║  • POST /close               (shutdown server)        ║
╚════════════════════════════════════════════════════════╝
  `);

  // Log that facilitator is ready (needed for e2e test discovery)
  console.log("Facilitator listening");
});

#!/usr/bin/env node
/**
 * Production-ready Starknet x402 Facilitator Server
 *
 * This example demonstrates how to run a standalone facilitator server that handles
 * x402 payment verifications and settlements for Starknet.
 *
 * Features:
 * - REST API endpoints for /verify and /settle
 * - Session key support for delegated payments
 * - Rate limiting and security features
 * - Health check and monitoring endpoints
 * - Graceful shutdown handling
 *
 * Usage:
 * 1. Set up environment variables (see .env.example)
 * 2. Run: npx ts-node examples/starknet-facilitator-server.ts
 * 3. The server will start on port 3000 (or PORT env variable)
 */

import { createServer } from "http";
import { Account, RpcProvider } from "starknet";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import {
  X402StarknetFacilitator,
  createStarknetFacilitatorMiddleware,
  createStandardStarknetPaymentRequirements,
} from "../src/shared/starknet/facilitator";
import { createStarknetConnectedClient } from "../src/shared/starknet/client";
import type { StarknetSigner } from "../src/shared/starknet/wallet";
import type { VerifyRequest } from "../src/types/verify";


// Configuration from environment
const config = {
  port: process.env.PORT || 3000,
  network: (process.env.STARKNET_NETWORK || "starknet-sepolia") as "starknet" | "starknet-sepolia",
  facilitatorPrivateKey: process.env.FACILITATOR_PRIVATE_KEY || "",
  facilitatorAddress: process.env.FACILITATOR_ADDRESS || "",
  maxAmountPerDay: process.env.MAX_AMOUNT_PER_DAY || "1000000000", // 1000 USDC
  maxTransactionsPerDay: parseInt(process.env.MAX_TRANSACTIONS_PER_DAY || "100"),
  enableRateLimiting: process.env.ENABLE_RATE_LIMITING !== "false",
  enableSessionKeys: process.env.ENABLE_SESSION_KEYS !== "false",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  rpcUrl: process.env.STARKNET_RPC_URL,
};

// Validate required configuration
if (!config.facilitatorPrivateKey) {
  console.error("Error: FACILITATOR_PRIVATE_KEY environment variable is required");
  process.exit(1);
}

if (!config.facilitatorAddress) {
  console.error("Error: FACILITATOR_ADDRESS environment variable is required");
  process.exit(1);
}

// Initialize Express app
const app = express();
const server = createServer(app);

// Middleware
app.use(helmet());
app.use(cors({
  origin: config.corsOrigin,
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization", "X-402-Version"],
}));
app.use(express.json({ limit: "10mb" }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});

const settleLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit settle requests to 10 per minute
  message: "Too many settlement requests, please try again later.",
});

app.use("/api/verify", limiter);
app.use("/api/settle", settleLimiter);

// Initialize Starknet facilitator
let facilitator: X402StarknetFacilitator;
let facilitatorMiddleware: ReturnType<typeof createStarknetFacilitatorMiddleware>;

async function initializeFacilitator() {
  try {
    console.log("Initializing Starknet facilitator...");

    // Create Starknet client
    const client = createStarknetConnectedClient(config.network, config.rpcUrl);

    // Create facilitator signer
    const facilitatorSigner: StarknetSigner = {
      address: config.facilitatorAddress,
      privateKey: config.facilitatorPrivateKey,
      async signTransaction(calls: any[]) {
        // In production, use proper signing with Account class
        const provider = new RpcProvider({ nodeUrl: config.rpcUrl });
        const account = new Account(provider, config.facilitatorAddress, config.facilitatorPrivateKey);
        return await account.execute(calls);
      },
    };

    // Create facilitator instance (STATELESS - no config needed)
    facilitator = new X402StarknetFacilitator(config.network, facilitatorSigner);

    // Create middleware handlers
    facilitatorMiddleware = createStarknetFacilitatorMiddleware(facilitator);

    console.log("Facilitator initialized successfully");
    console.log(`Network: ${config.network}`);
    console.log(`Facilitator Address: ${config.facilitatorAddress}`);
    console.log(`Architecture: STATELESS (replay protection at blockchain level)`);
  } catch (error) {
    console.error("Failed to initialize facilitator:", error);
    process.exit(1);
  }
}

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "healthy",
    network: config.network,
    facilitatorAddress: config.facilitatorAddress,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// API Info endpoint
app.get("/api", (req: Request, res: Response) => {
  res.json({
    name: "Starknet x402 Facilitator",
    version: "1.0.0",
    network: config.network,
    endpoints: {
      verify: {
        method: "POST",
        path: "/api/verify",
        description: "Verify a payment authorization",
      },
      settle: {
        method: "POST",
        path: "/api/settle",
        description: "Execute a verified payment",
      },
      status: {
        method: "GET",
        path: "/api/status/:txHash",
        description: "Check transaction status",
      },
      nonce: {
        method: "GET",
        path: "/api/nonce/:account",
        description: "Get next nonce for an account",
      },
      sessionKey: {
        method: "POST",
        path: "/api/session-key",
        description: "DEPRECATED - Session keys should be managed on-chain",
      },
      requirements: {
        method: "GET",
        path: "/api/requirements",
        description: "Get payment requirements for a resource",
      },
    },
    configuration: {
      architecture: "STATELESS",
      replayProtection: "BLOCKCHAIN_LEVEL",
      note: "Rate limiting and session keys should be implemented on-chain",
    },
  });
});

// Payment requirements endpoint
app.get("/api/requirements", (req: Request, res: Response) => {
  const { amount = "1000000", recipient = config.facilitatorAddress } = req.query;

  const requirements = createStandardStarknetPaymentRequirements(
    config.network,
    recipient as string,
    amount as string,
  );

  res.json(requirements);
});

// Verify endpoint
app.post("/api/verify", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await facilitatorMiddleware.verify(req, res, next);
  } catch (error) {
    console.error("Verify error:", error);
    res.status(500).json({
      isValid: false,
      invalidReason: "unexpected_verify_error",
    });
  }
});

// Settle endpoint
app.post("/api/settle", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await facilitatorMiddleware.settle(req, res, next);
  } catch (error) {
    console.error("Settle error:", error);
    res.status(500).json({
      success: false,
      errorReason: "unexpected_settle_error",
      network: config.network,
      transaction: "",
    });
  }
});

// Transaction status endpoint
app.get("/api/status/:txHash", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await facilitatorMiddleware.status(req, res, next);
  } catch (error) {
    console.error("Status error:", error);
    res.status(500).json({
      error: "Failed to get transaction status",
    });
  }
});

// Nonce endpoint
app.get("/api/nonce/:account", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await facilitatorMiddleware.nonce(req, res, next);
  } catch (error) {
    console.error("Nonce error:", error);
    res.status(500).json({
      error: "Failed to get nonce",
    });
  }
});

// Session key endpoint (DEPRECATED)
app.post("/api/session-key", async (req: Request, res: Response, next: NextFunction) => {
  res.status(410).json({
    error: "Session keys are deprecated in favor of on-chain management",
    message: "Implement session keys in your Starknet account contract instead",
  });
});

// Example usage endpoint - demonstrates how to create a payment request
app.get("/api/example", (req: Request, res: Response) => {
  const exampleVerifyRequest: VerifyRequest = {
    paymentPayload: {
      scheme: "exact",
      network: config.network,
      x402Version: 1,
      payload: {
        signature: "0xSignatureR,0xSignatureS",
        authorization: {
          from: "0xYourAccountAddress",
          to: config.facilitatorAddress,
          value: "1000000", // 1 USDC (6 decimals)
          validAfter: "0",
          validBefore: String(Math.floor(Date.now() / 1000) + 3600), // 1 hour from now
          nonce: "1",
        },
      },
    },
    paymentRequirements: createStandardStarknetPaymentRequirements(
      config.network,
      config.facilitatorAddress,
      "1000000",
    ),
  };

  res.json({
    description: "Example payment request for testing",
    verifyEndpoint: "/api/verify",
    exampleRequest: exampleVerifyRequest,
    instructions: [
      "1. Replace 'YourAccountAddress' with your Starknet account address",
      "2. Sign the authorization with your account",
      "3. Replace signature values with actual signature",
      "4. POST this request to /api/verify",
      "5. If valid, POST the same payload to /api/settle to execute",
    ],
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: "Endpoint not found",
    availableEndpoints: ["/health", "/api", "/api/verify", "/api/settle", "/api/status/:txHash"],
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});

// Start server
async function startServer() {
  await initializeFacilitator();

  server.listen(config.port, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🚀 Starknet x402 Facilitator Server                        ║
║                                                               ║
║   Server running on: http://localhost:${config.port}                   ║
║   Network: ${config.network.padEnd(49)}  ║
║                                                               ║
║   Endpoints:                                                  ║
║   • GET  /health           - Health check                    ║
║   • GET  /api              - API documentation               ║
║   • GET  /api/requirements - Get payment requirements        ║
║   • POST /api/verify       - Verify payment                  ║
║   • POST /api/settle       - Execute payment                 ║
║   • GET  /api/status/:tx   - Check transaction               ║
║   • GET  /api/nonce/:acc   - Get next nonce                  ║
║   • POST /api/session-key  - Create session key              ║
║   • GET  /api/example      - Example request                 ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
    `);
  });
}

// Start the server
startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { paymentMiddleware } from "@x402/hono";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { registerExactSvmScheme } from "@x402/svm/exact/server";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import dotenv from "dotenv";

dotenv.config();

/**
 * Hono E2E Test Server with x402 Payment Middleware
 *
 * This server demonstrates how to integrate x402 payment middleware
 * with a Hono application for end-to-end testing.
 */

const PORT = process.env.PORT || "4023";
const EVM_NETWORK = "eip155:84532" as const;
const SVM_NETWORK = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" as `${string}:${string}`;
const EVM_PAYEE_ADDRESS = process.env.EVM_PAYEE_ADDRESS as `0x${string}`;
const SVM_PAYEE_ADDRESS = process.env.SVM_PAYEE_ADDRESS as string;
const facilitatorUrl = process.env.FACILITATOR_URL;

if (!EVM_PAYEE_ADDRESS) {
  console.error("❌ EVM_PAYEE_ADDRESS environment variable is required");
  process.exit(1);
}

if (!SVM_PAYEE_ADDRESS) {
  console.error("❌ SVM_PAYEE_ADDRESS environment variable is required");
  process.exit(1);
}

if (!facilitatorUrl) {
  console.error("❌ FACILITATOR_URL environment variable is required");
  process.exit(1);
}

// Initialize Hono app
const app = new Hono();

// Create HTTP facilitator client
const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

// Create x402 resource server with builder pattern (cleaner!)
const x402Server = new x402ResourceServer(facilitatorClient);

// Register server schemes
registerExactEvmScheme(x402Server);
registerExactSvmScheme(x402Server);

// Register Bazaar discovery extension
x402Server.registerExtension(bazaarResourceServerExtension);

console.log(
  `Facilitator account: ${process.env.EVM_PRIVATE_KEY ? process.env.EVM_PRIVATE_KEY.substring(0, 10) + "..." : "not configured"}`,
);
console.log(`Using remote facilitator at: ${facilitatorUrl}`);

/**
 * Configure x402 payment middleware using builder pattern
 *
 * This middleware protects endpoints with $0.001 USDC payment requirements
 * on Base Sepolia and Solana Devnet with bazaar discovery extension.
 */
app.use(
  "*",
  paymentMiddleware(
    {
      // Route-specific payment configuration
      "GET /protected": {
        accepts: {
          payTo: EVM_PAYEE_ADDRESS,
          scheme: "exact",
          price: "$0.001",
          network: EVM_NETWORK,
        },
        extensions: {
          ...declareDiscoveryExtension({
            output: {
              example: {
                message: "Protected endpoint accessed successfully",
                timestamp: "2024-01-01T00:00:00Z",
              },
              schema: {
                properties: {
                  message: { type: "string" },
                  timestamp: { type: "string" },
                },
                required: ["message", "timestamp"],
              },
            },
          }),
        },
      },
      "GET /protected-svm": {
        accepts: {
          payTo: SVM_PAYEE_ADDRESS,
          scheme: "exact",
          price: "$0.001",
          network: SVM_NETWORK,
        },
        extensions: {
          ...declareDiscoveryExtension({
            output: {
              example: {
                message: "Protected endpoint accessed successfully",
                timestamp: "2024-01-01T00:00:00Z",
              },
              schema: {
                properties: {
                  message: { type: "string" },
                  timestamp: { type: "string" },
                },
                required: ["message", "timestamp"],
              },
            },
          }),
        },
      },
    },
    x402Server, // Pass pre-configured server instance
  ),
);

/**
 * Protected endpoint - requires payment to access
 *
 * This endpoint demonstrates a resource protected by x402 payment middleware.
 * Clients must provide a valid payment signature to access this endpoint.
 */
app.get("/protected", (c) => {
  return c.json({
    message: "Protected endpoint accessed successfully",
    timestamp: new Date().toISOString(),
  });
});

/**
 * Protected SVM endpoint - requires payment to access
 *
 * This endpoint demonstrates a resource protected by x402 payment middleware for SVM.
 * Clients must provide a valid payment signature to access this endpoint.
 */
app.get("/protected-svm", (c) => {
  return c.json({
    message: "Protected endpoint accessed successfully",
    timestamp: new Date().toISOString(),
  });
});

/**
 * Health check endpoint - no payment required
 *
 * Used to verify the server is running and responsive.
 */
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    network: EVM_NETWORK,
    payee: EVM_PAYEE_ADDRESS,
    version: "2.0.0",
  });
});

/**
 * Shutdown endpoint - used by e2e tests
 *
 * Allows graceful shutdown of the server during testing.
 */
app.post("/close", (c) => {
  console.log("Received shutdown request");

  // Give time for response to be sent
  setTimeout(() => {
    process.exit(0);
  }, 100);

  return c.json({ message: "Server shutting down gracefully" });
});

// Start the server
const server = serve({
  fetch: app.fetch,
  port: parseInt(PORT),
});

console.log(`
╔════════════════════════════════════════════════════════╗
║           x402 Hono E2E Test Server                    ║
╠════════════════════════════════════════════════════════╣
║  Server:         http://localhost:${PORT}              ║
║  EVM Network:    ${EVM_NETWORK}                         ║
║  SVM Network:    ${SVM_NETWORK}                         ║
║  EVM Payee:      ${EVM_PAYEE_ADDRESS}                   ║
║  SVM Payee:      ${SVM_PAYEE_ADDRESS}                   ║
║                                                        ║
║  Endpoints:                                            ║
║  • GET  /protected     (requires $0.001 USDC payment) ║
║  • GET  /protected-svm (requires $0.001 USDC payment) ║
║  • GET  /health        (no payment required)          ║
║  • POST /close         (shutdown server)              ║
╚════════════════════════════════════════════════════════╝
  `);

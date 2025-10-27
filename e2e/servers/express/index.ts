import express from "express";
import { paymentMiddleware } from "@x402/express";
import { ExactEvmService } from "@x402/evm";
import { HTTPFacilitatorClient } from "@x402/core/server";
import dotenv from "dotenv";

dotenv.config();

/**
 * Express E2E Test Server with x402 Payment Middleware
 *
 * This server demonstrates how to integrate x402 payment middleware
 * with an Express application for end-to-end testing.
 */

const PORT = process.env.PORT || "4021";
const NETWORK = "eip155:84532" as const;
const PAYEE_ADDRESS = process.env.EVM_ADDRESS as `0x${string}`;
const facilitatorUrl = process.env.FACILITATOR_URL;

if (!PAYEE_ADDRESS) {
  console.error("❌ EVM_ADDRESS environment variable is required");
  process.exit(1);
}

if (!facilitatorUrl) {
  console.error("❌ FACILITATOR_URL environment variable is required");
  process.exit(1);
}

// Initialize Express app
const app = express();

// Create HTTP facilitator client
const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });
console.log(`Facilitator account: ${process.env.EVM_PRIVATE_KEY ? process.env.EVM_PRIVATE_KEY.substring(0, 10) + '...' : 'not configured'}`);
console.log(`Using remote facilitator at: ${facilitatorUrl}`);

/**
 * Configure x402 payment middleware
 *
 * This middleware protects the /protected endpoint with a $0.001 USDC payment requirement
 * on the Base Sepolia testnet.
 */
app.use(
  paymentMiddleware(
    {
      // Route-specific payment configuration
      "GET /protected": {
        payTo: PAYEE_ADDRESS,
        scheme: "exact",
        price: "$0.001",
        network: NETWORK,
      },
    },
    // Use facilitator (either remote or local)
    facilitatorClient,
    // Register the EVM server for handling exact payments
    [
      {
        network: NETWORK,
        server: new ExactEvmService(),
      },
    ],
    // No custom paywall configuration (uses defaults)
    undefined,
  ),
);

/**
 * Protected endpoint - requires payment to access
 *
 * This endpoint demonstrates a resource protected by x402 payment middleware.
 * Clients must provide a valid payment signature to access this endpoint.
 */
app.get("/protected", (req, res) => {
  res.json({
    message: "Protected endpoint accessed successfully",
    timestamp: new Date().toISOString(),
  });
});

/**
 * Health check endpoint - no payment required
 *
 * Used to verify the server is running and responsive.
 */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    network: NETWORK,
    payee: PAYEE_ADDRESS,
    version: "2.0.0",
  });
});

/**
 * Shutdown endpoint - used by e2e tests
 *
 * Allows graceful shutdown of the server during testing.
 */
app.post("/close", (req, res) => {
  res.json({ message: "Server shutting down gracefully" });
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
║           x402 Express E2E Test Server                 ║
╠════════════════════════════════════════════════════════╣
║  Server:     http://localhost:${PORT}                      ║
║  Network:    ${NETWORK}                       ║
║  Payee:      ${PAYEE_ADDRESS}     ║
║                                                        ║
║  Endpoints:                                            ║
║  • GET  /protected  (requires $0.001 USDC payment)    ║
║  • GET  /health     (no payment required)             ║
║  • POST /close      (shutdown server)                 ║
╚════════════════════════════════════════════════════════╝
  `);
});

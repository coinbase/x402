import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { paymentMiddleware } from "@x402/hono";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { registerExactSvmScheme } from "@x402/svm/exact/server";
import { registerExactAptosScheme } from "@x402/aptos/exact/server";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { declareEip2612GasSponsoringExtension } from "@x402/extensions";
import dotenv from "dotenv";

dotenv.config();

/**
 * Hono E2E Test Server with x402 Payment Middleware
 *
 * This server demonstrates how to integrate x402 payment middleware
 * with a Hono application for end-to-end testing.
 */

const PORT = process.env.PORT || "4023";
const EVM_NETWORK = (process.env.EVM_NETWORK || "eip155:84532") as `${string}:${string}`;
const SVM_NETWORK = (process.env.SVM_NETWORK || "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1") as `${string}:${string}`;
const APTOS_NETWORK = (process.env.APTOS_NETWORK || "aptos:2") as `${string}:${string}`;
const EVM_PAYEE_ADDRESS = process.env.EVM_PAYEE_ADDRESS as `0x${string}`;
const SVM_PAYEE_ADDRESS = process.env.SVM_PAYEE_ADDRESS as string;
const APTOS_PAYEE_ADDRESS = process.env.APTOS_PAYEE_ADDRESS as string;
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
if (APTOS_PAYEE_ADDRESS) {
  registerExactAptosScheme(x402Server);
}

// Register Bazaar discovery extension
x402Server.registerExtension(bazaarResourceServerExtension);

console.log(
  `Facilitator account: ${process.env.EVM_PRIVATE_KEY ? process.env.EVM_PRIVATE_KEY.substring(0, 10) + "..." : "not configured"}`,
);
console.log(`Using remote facilitator at: ${facilitatorUrl}`);

/**
 * Pre-middleware guard for optional Aptos endpoint
 * Returns 501 Not Implemented if Aptos is not configured
 */
app.use("/protected-aptos", async (c, next) => {
  if (!APTOS_PAYEE_ADDRESS) {
    return c.json({
      error: "Aptos payments not configured",
      message: "APTOS_PAYEE_ADDRESS environment variable is not set",
    }, 501);
  }
  await next();
});

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
      ...(APTOS_PAYEE_ADDRESS
        ? {
            "GET /protected-aptos": {
              accepts: {
                payTo: APTOS_PAYEE_ADDRESS,
                scheme: "exact",
                price: "$0.001",
                network: APTOS_NETWORK,
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
          }
        : {}),
      "GET /protected-permit2": {
        accepts: {
          payTo: EVM_PAYEE_ADDRESS,
          scheme: "exact",
          network: EVM_NETWORK,
          price: {
            amount: "1000",
            asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            extra: {
              assetTransferMethod: "permit2",
              name: "USDC",
              version: "2",
            },
          },
        },
        extensions: {
          ...declareDiscoveryExtension({
            output: {
              example: {
                message: "Permit2 endpoint accessed successfully",
                timestamp: "2024-01-01T00:00:00Z",
                method: "permit2",
              },
              schema: {
                properties: {
                  message: { type: "string" },
                  timestamp: { type: "string" },
                  method: { type: "string" },
                },
                required: ["message", "timestamp", "method"],
              },
            },
          }),
          ...declareEip2612GasSponsoringExtension(),
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
 * Protected Aptos endpoint - requires payment to access
 *
 * This endpoint demonstrates a resource protected by x402 payment middleware for Aptos.
 * Clients must provide a valid payment signature to access this endpoint.
 * Note: 501 check is handled by pre-middleware guard above.
 */
app.get("/protected-aptos", (c) => {
  return c.json({
    message: "Protected endpoint accessed successfully",
    timestamp: new Date().toISOString(),
  });
});

/**
 * Protected Permit2 endpoint - requires Permit2 payment with EIP-2612 gas sponsoring
 */
app.get("/protected-permit2", (c) => {
  return c.json({
    message: "Permit2 endpoint accessed successfully",
    timestamp: new Date().toISOString(),
    method: "permit2",
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
║  Aptos Network:  ${APTOS_NETWORK}                       ║
║  EVM Payee:      ${EVM_PAYEE_ADDRESS}                   ║
║  SVM Payee:      ${SVM_PAYEE_ADDRESS}                   ║
║  Aptos Payee:    ${APTOS_PAYEE_ADDRESS || "(not configured)"}
║                                                        ║
║  Endpoints:                                            ║
║  • GET  /protected          (EIP-3009 payment)        ║
║  • GET  /protected-permit2  (Permit2 + EIP-2612)      ║
║  • GET  /protected-svm      (SVM payment)             ║
║  • GET  /protected-aptos    (Aptos payment)           ║
║  • GET  /health             (no payment required)     ║
║  • POST /close              (shutdown server)         ║
╚════════════════════════════════════════════════════════╝
  `);

import Fastify from "fastify";
import { paymentMiddleware } from "@x402/fastify";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { ExactAptosScheme } from "@x402/aptos/exact/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import {
  declareEip2612GasSponsoringExtension,
  declareErc20ApprovalGasSponsoringExtension,
} from "@x402/extensions";
import dotenv from "dotenv";

dotenv.config();

/**
 * Fastify E2E Test Server with x402 Payment Middleware
 *
 * This server demonstrates how to integrate x402 payment middleware
 * with a Fastify application for end-to-end testing.
 */

const PORT = process.env.PORT || "4024";
const EVM_NETWORK = (process.env.EVM_NETWORK || "eip155:84532") as `${string}:${string}`;
const SVM_NETWORK = (process.env.SVM_NETWORK ||
  "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1") as `${string}:${string}`;
const APTOS_NETWORK = (process.env.APTOS_NETWORK || "aptos:2") as `${string}:${string}`;
const STELLAR_NETWORK = (process.env.STELLAR_NETWORK || "stellar:testnet") as `${string}:${string}`;
const EVM_PAYEE_ADDRESS = process.env.EVM_PAYEE_ADDRESS as `0x${string}`;
const SVM_PAYEE_ADDRESS = process.env.SVM_PAYEE_ADDRESS as string;
const APTOS_PAYEE_ADDRESS = process.env.APTOS_PAYEE_ADDRESS as string;
const STELLAR_PAYEE_ADDRESS = process.env.STELLAR_PAYEE_ADDRESS as string | undefined;
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

// Initialize Fastify app
const app = Fastify();

// Create HTTP facilitator client
const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

// Create x402 resource server
const server = new x402ResourceServer(facilitatorClient);

// Register server schemes
server.register("eip155:*", new ExactEvmScheme());
server.register("solana:*", new ExactSvmScheme());
if (APTOS_PAYEE_ADDRESS) {
  server.register("aptos:*", new ExactAptosScheme());
}
if (STELLAR_PAYEE_ADDRESS) {
  server.register("stellar:*", new ExactStellarScheme());
}

// Register Bazaar discovery extension
server.registerExtension(bazaarResourceServerExtension);

console.log(
  `Facilitator account: ${process.env.EVM_PRIVATE_KEY ? process.env.EVM_PRIVATE_KEY.substring(0, 10) + "..." : "not configured"}`,
);
console.log(`Using remote facilitator at: ${facilitatorUrl}`);

/**
 * Pre-middleware guard for optional Aptos endpoint
 * Returns 501 Not Implemented if Aptos is not configured
 */
app.addHook("onRequest", async (request, reply) => {
  if (request.url.split("?")[0] === "/protected-aptos" && !APTOS_PAYEE_ADDRESS) {
    return reply.status(501).send({
      error: "Aptos payments not configured",
      message: "APTOS_PAYEE_ADDRESS environment variable is not set",
    });
  }
});

/**
 * Pre-middleware guard for optional Stellar endpoint
 * Returns 501 Not Implemented if Stellar is not configured
 */
app.addHook("onRequest", async (request, reply) => {
  if (request.url.split("?")[0] === "/protected-stellar" && !STELLAR_PAYEE_ADDRESS) {
    return reply.status(501).send({
      error: "Stellar payments not configured",
      message: "STELLAR_PAYEE_ADDRESS environment variable is not set",
    });
  }
});

/**
 * Configure x402 payment middleware using builder pattern
 *
 * This middleware protects endpoints with $0.001 USDC payment requirements
 * on Base Sepolia, Solana Devnet, Aptos Testnet, and Stellar Testnet with bazaar discovery extension.
 */
paymentMiddleware(
  app,
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
    // Permit2 endpoint for generic ERC-20 tokens (no EIP-2612, uses raw approve tx)
    "GET /protected-permit2-erc20": {
      accepts: {
        payTo: EVM_PAYEE_ADDRESS,
        scheme: "exact",
        network: EVM_NETWORK,
        price: {
          amount: "1000",
          asset: "0xeED520980fC7C7B4eB379B96d61CEdea2423005a", // Generic MockERC20 token (no EIP-2612)
          extra: {
            assetTransferMethod: "permit2",
            // No name/version - generic ERC-20 without EIP-2612
          },
        },
      },
      extensions: {
        ...declareErc20ApprovalGasSponsoringExtension(),
      },
    },
    // Permit2 endpoint - explicitly requires Permit2 flow instead of EIP-3009
    "GET /protected-permit2": {
      accepts: {
        payTo: EVM_PAYEE_ADDRESS,
        scheme: "exact",
        network: EVM_NETWORK,
        price: "$0.001",
        // Use pre-parsed price with assetTransferMethod to force Permit2
        extra: { assetTransferMethod: "permit2" },
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
    ...(STELLAR_PAYEE_ADDRESS
      ? {
          "GET /protected-stellar": {
            accepts: {
              payTo: STELLAR_PAYEE_ADDRESS!,
              scheme: "exact",
              price: "$0.001",
              network: STELLAR_NETWORK,
            },
            extensions: {
              ...declareDiscoveryExtension({
                output: {
                  example: {
                    message: "Protected Stellar endpoint accessed successfully",
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
  },
  server, // Pass pre-configured server instance
);

/**
 * Protected endpoint - requires payment to access
 *
 * This endpoint demonstrates a resource protected by x402 payment middleware.
 * Clients must provide a valid payment signature to access this endpoint.
 */
app.get("/protected", async () => {
  return {
    message: "Protected endpoint accessed successfully",
    timestamp: new Date().toISOString(),
  };
});

/**
 * Protected SVM endpoint - requires payment to access
 *
 * This endpoint demonstrates a resource protected by x402 payment middleware for SVM.
 * Clients must provide a valid payment signature to access this endpoint.
 */
app.get("/protected-svm", async () => {
  return {
    message: "Protected endpoint accessed successfully",
    timestamp: new Date().toISOString(),
  };
});

/**
 * Protected Aptos endpoint - requires payment to access
 *
 * This endpoint demonstrates a resource protected by x402 payment middleware for Aptos.
 * Clients must provide a valid payment signature to access this endpoint.
 * Note: 501 check is handled by pre-middleware guard above.
 */
app.get("/protected-aptos", async () => {
  return {
    message: "Protected endpoint accessed successfully",
    timestamp: new Date().toISOString(),
  };
});

/**
 * Protected Permit2 ERC-20 endpoint - requires payment via Permit2 flow with ERC-20 approval
 *
 * This endpoint demonstrates the ERC-20 approval gas sponsoring flow for tokens
 * that do NOT implement EIP-2612. The facilitator broadcasts the pre-signed
 * approve() transaction on the client's behalf before settling.
 */
app.get("/protected-permit2-erc20", async () => {
  return {
    message: "Permit2 ERC-20 approval endpoint accessed successfully",
    timestamp: new Date().toISOString(),
    method: "permit2-erc20-approval",
  };
});

/**
 * Protected Permit2 endpoint - requires payment via Permit2 flow
 *
 * This endpoint demonstrates the Permit2 payment flow.
 * Clients must have approved Permit2 to spend their USDC before accessing.
 */
app.get("/protected-permit2", async () => {
  return {
    message: "Permit2 endpoint accessed successfully",
    timestamp: new Date().toISOString(),
    method: "permit2",
  };
});

/**
 * Protected Stellar endpoint - requires payment to access
 *
 * This endpoint demonstrates a resource protected by x402 payment middleware for Stellar.
 * Clients must provide a valid payment signature to access this endpoint.
 * Note: 501 check is handled by pre-middleware guard above.
 */
if (STELLAR_PAYEE_ADDRESS) {
  app.get("/protected-stellar", async () => {
    return {
      message: "Protected Stellar endpoint accessed successfully",
      timestamp: new Date().toISOString(),
    };
  });
}

/**
 * Health check endpoint - no payment required
 *
 * Used to verify the server is running and responsive.
 */
app.get("/health", async () => {
  return {
    status: "ok",
    network: EVM_NETWORK,
    payee: EVM_PAYEE_ADDRESS,
    version: "2.0.0",
  };
});

/**
 * Shutdown endpoint - used by e2e tests
 *
 * Allows graceful shutdown of the server during testing.
 */
app.post("/close", async (request, reply) => {
  reply.send({ message: "Server shutting down gracefully" });
  console.log("Received shutdown request");

  // Give time for response to be sent
  setTimeout(() => {
    process.exit(0);
  }, 100);
});

// Start the server
app.listen({ port: parseInt(PORT) }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`
╔════════════════════════════════════════════════════════╗
║           x402 Fastify E2E Test Server                 ║
╠════════════════════════════════════════════════════════╣
║  Server:       ${address}                              ║
║  EVM Network:  ${EVM_NETWORK}                          ║
║  SVM Network:  ${SVM_NETWORK}                          ║
║  Aptos Network: ${APTOS_NETWORK}                       ║
║  Stellar Network: ${STELLAR_NETWORK}║
║  EVM Payee:    ${EVM_PAYEE_ADDRESS}                    ║
║  SVM Payee:    ${SVM_PAYEE_ADDRESS}                    ║
║  Aptos Payee:  ${APTOS_PAYEE_ADDRESS || "(not configured)"}
║  Stellar Payee: ${STELLAR_PAYEE_ADDRESS || "(not configured)"}
║                                                        ║
║  Endpoints:                                            ║
║  • GET  /protected             (EIP-3009 payment - EVM)    ║
║  • GET  /protected-svm         (SVM payment)               ║
║  • GET  /protected-aptos       (Aptos payment)             ║
║  • GET  /protected-permit2     (Permit2 payment - EVM)     ║
║  • GET  /protected-permit2-erc20 (Permit2 + ERC-20 approval) ║
║  • GET  /protected-stellar     (Stellar payment)           ║
║  • GET  /health                (no payment required)       ║
║  • POST /close                 (shutdown server)           ║
╚════════════════════════════════════════════════════════╝
  `);
});

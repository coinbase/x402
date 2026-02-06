import { paymentProxy } from "@x402/next";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { registerExactSvmScheme } from "@x402/svm/exact/server";
import { registerExactStellarScheme } from "@x402/stellar/exact/server";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";

export const EVM_PAYEE_ADDRESS = process.env.EVM_PAYEE_ADDRESS as `0x${string}`;
export const SVM_PAYEE_ADDRESS = process.env.SVM_PAYEE_ADDRESS as string;
export const STELLAR_PAYEE_ADDRESS = process.env.STELLAR_PAYEE_ADDRESS as string | undefined;
export const EVM_NETWORK = (process.env.EVM_NETWORK || "eip155:84532") as `${string}:${string}`;
export const SVM_NETWORK = (process.env.SVM_NETWORK || "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1") as `${string}:${string}`;
export const STELLAR_NETWORK = (process.env.STELLAR_NETWORK ||
  "stellar:testnet") as `${string}:${string}`;
const facilitatorUrl = process.env.FACILITATOR_URL;

if (!facilitatorUrl) {
  console.error("❌ FACILITATOR_URL environment variable is required");
  process.exit(1);
}

// Create HTTP facilitator client
const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

// Create x402 resource server with builder pattern (cleaner!)
export const server = new x402ResourceServer(facilitatorClient);

// Register server schemes
registerExactEvmScheme(server);
registerExactSvmScheme(server);
if (STELLAR_PAYEE_ADDRESS) {
  registerExactStellarScheme(server);
}

// Register Bazaar discovery extension
server.registerExtension(bazaarResourceServerExtension);

console.log(`Using remote facilitator at: ${facilitatorUrl}`);
if (STELLAR_PAYEE_ADDRESS) {
  console.log(`Stellar Payee Address: ${STELLAR_PAYEE_ADDRESS}`);
}

// Optional Stellar route config - only included if STELLAR_PAYEE_ADDRESS is set
const stellarProxyConfig = STELLAR_PAYEE_ADDRESS
  ? {
      "/api/protected-stellar-proxy": {
        accepts: {
          payTo: STELLAR_PAYEE_ADDRESS,
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
  : {};

export const proxy = paymentProxy(
  {
    "/api/protected-proxy": {
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
    "/api/protected-svm-proxy": {
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
    // Stellar route - conditionally included
    ...stellarProxyConfig,
  },
  server, // Pass pre-configured server instance
);

// Configure which paths the middleware should run on
// Note: matcher must be static for Next.js, but routes can be dynamic
// Stellar route will return 404 if STELLAR_PAYEE_ADDRESS not configured
export const config = {
  matcher: ["/api/protected-proxy", "/api/protected-svm-proxy", "/api/protected-stellar-proxy"],
};

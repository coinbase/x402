import { paymentMiddlewareFromConfig } from "@x402/next";
import { ExactEvmService } from "@x402/evm";
import { ExactSvmService } from "@x402/svm";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";

const EVM_PAYEE_ADDRESS = process.env.EVM_PAYEE_ADDRESS as `0x${string}`;
const SVM_PAYEE_ADDRESS = process.env.SVM_PAYEE_ADDRESS as string;
const EVM_NETWORK = "eip155:84532" as const;
const SVM_NETWORK = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" as `${string}:${string}`;
const facilitatorUrl = process.env.FACILITATOR_URL;

if (!facilitatorUrl) {
  console.error("❌ FACILITATOR_URL environment variable is required");
  process.exit(1);
}

// Create HTTP facilitator client
const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

console.log(`Using remote facilitator at: ${facilitatorUrl}`);

export const middleware = paymentMiddlewareFromConfig(
  {
    "/api/protected": {
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
    "/api/protected-svm": {
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
  // Use facilitator (either remote or local)
  facilitatorClient,
  // Register the EVM and SVM servers for handling exact payments
  [
    {
      network: EVM_NETWORK,
      server: new ExactEvmService(),
    },
    {
      network: SVM_NETWORK,
      server: new ExactSvmService(),
    },
  ],
  // No custom paywall configuration (uses defaults)
  undefined,
);

// Configure which paths the middleware should run on
export const config = {
  matcher: ["/api/protected", "/api/protected-svm"],
  runtime: "nodejs", // TEMPORARY: Only needed until Edge runtime support is added
};


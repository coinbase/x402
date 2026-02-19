import { paymentProxy } from "@x402/next";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { registerExactSvmScheme } from "@x402/svm/exact/server";
import { ExactAptosScheme } from "@x402/aptos/exact/server";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { declareEip2612GasSponsoringExtension } from "@x402/extensions";

export const EVM_PAYEE_ADDRESS = process.env.EVM_PAYEE_ADDRESS as `0x${string}`;
export const SVM_PAYEE_ADDRESS = process.env.SVM_PAYEE_ADDRESS as string;
export const APTOS_PAYEE_ADDRESS = process.env.APTOS_PAYEE_ADDRESS as string;
export const EVM_NETWORK = (process.env.EVM_NETWORK || "eip155:84532") as `${string}:${string}`;
export const SVM_NETWORK = (process.env.SVM_NETWORK || "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1") as `${string}:${string}`;
export const APTOS_NETWORK = (process.env.APTOS_NETWORK || "aptos:2") as `${string}:${string}`;
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
if (APTOS_PAYEE_ADDRESS) {
  server.register("aptos:*", new ExactAptosScheme());
}

// Register Bazaar discovery extension
server.registerExtension(bazaarResourceServerExtension);

console.log(`Using remote facilitator at: ${facilitatorUrl}`);

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
    ...(APTOS_PAYEE_ADDRESS
      ? {
        "/api/protected-aptos-proxy": {
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
    "/api/protected-permit2-proxy": {
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
  server, // Pass pre-configured server instance
);

// Configure which paths the middleware should run on
export const config = {
  matcher: ["/api/protected-proxy", "/api/protected-svm-proxy", "/api/protected-aptos-proxy", "/api/protected-permit2-proxy"],
};

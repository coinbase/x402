import { paymentProxy } from "@x402/next";
import { x402ResourceServer, HTTPFacilitatorClient, HTTPRequestContext } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { registerExactSvmScheme } from "@x402/svm/exact/server";
import { createPaywall } from "@x402/paywall";
import { evmPaywall } from "@x402/paywall/evm";
import { svmPaywall } from "@x402/paywall/svm";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { ResourceServerExtension, SettleResultContext } from "@x402/core/types";

const facilitatorUrl = process.env.FACILITATOR_URL;
export const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;
export const svmAddress = process.env.SVM_ADDRESS;

if (!facilitatorUrl) {
  console.error("❌ FACILITATOR_URL environment variable is required");
  process.exit(1);
}

if (!evmAddress || !svmAddress) {
  console.error("❌ EVM_ADDRESS and SVM_ADDRESS environment variables are required");
  process.exit(1);
}

// Create HTTP facilitator client
const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

// Type for HTTP transport context provided during settlement
interface HTTPTransportContext {
  httpContext: HTTPRequestContext;
  responseBody: Buffer;
}

// Example extension that demonstrates transportContext usage
const transportContextExtension: ResourceServerExtension = {
  key: "transport-context-demo",

  enrichSettlementResponse: async (
    _declaration: unknown,
    context: SettleResultContext,
  ): Promise<unknown> => {
    const httpData = context.transportContext as HTTPTransportContext | undefined;

    if (!httpData) {
      console.log("⚠️  No transport context available");
      return undefined;
    }

    // Log what we have access to
    console.log("\n📦 Transport Context Available:");
    console.log("   httpContext:", httpData.httpContext);
    console.log("   Request path:", httpData.httpContext.path);
    console.log("   Request method:", httpData.httpContext.method);
    console.log("   Response body:", httpData.responseBody.toString("utf-8"));

    // Return the data in the settlement response extensions
    return {
      request: {
        path: httpData.httpContext.path,
        method: httpData.httpContext.method,
      },
      responseBody: httpData.responseBody.toString("utf-8"),
    };
  },
};

// Create x402 resource server
export const server = new x402ResourceServer(facilitatorClient);

// Register schemes
registerExactEvmScheme(server);
registerExactSvmScheme(server);

// Register extensions
server.registerExtension(transportContextExtension);

// Build paywall
export const paywall = createPaywall()
  .withNetwork(evmPaywall)
  .withNetwork(svmPaywall)
  .withConfig({
    appName: process.env.APP_NAME || "Next x402 Demo",
    appLogo: process.env.APP_LOGO || "/x402-icon-blue.png",
    testnet: true,
  })
  .build();

// Build proxy
export const proxy = paymentProxy(
  {
    "/protected": {
      accepts: [
        {
          scheme: "exact",
          price: "$0.001",
          network: "eip155:84532", // base-sepolia
          payTo: evmAddress,
        },
        {
          scheme: "exact",
          price: "$0.001",
          network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", // solana devnet
          payTo: svmAddress,
        },
      ],
      description: "Premium music: x402 Remix",
      mimeType: "text/html",
      extensions: {
        ...declareDiscoveryExtension({}),
        "transport-context-demo": {},
      },
    },
  },
  server,
  undefined, // paywallConfig (using custom paywall instead)
  paywall, // custom paywall provider
);

// Configure which paths the proxy should run on
export const config = {
  matcher: ["/protected/:path*"],
};

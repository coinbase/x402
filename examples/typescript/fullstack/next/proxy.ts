import { paymentProxy } from "@x402/next";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { registerExactSvmScheme } from "@x402/svm/exact/server";
import { registerExactAvmScheme } from "@x402/avm/exact/server";
import { evmPaywall } from "@x402/paywall/evm";
import { svmPaywall } from "@x402/paywall/svm";
import { avmPaywall } from "@x402/paywall/avm";
import { createPaywall } from "@x402/paywall";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";

const facilitatorUrl = process.env.FACILITATOR_URL;
export const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;
export const svmAddress = process.env.SVM_ADDRESS as string;
export const avmAddress = process.env.AVM_ADDRESS as string;

if (!facilitatorUrl) {
  console.error("❌ FACILITATOR_URL environment variable is required");
  process.exit(1);
}

if (!evmAddress || !svmAddress || !avmAddress) {
  console.error("❌ EVM_ADDRESS, SVM_ADDRESS, and AVM_ADDRESS environment variables are required");
  process.exit(1);
}

// Create HTTP facilitator client
const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

// Create x402 resource server with all networks
export const server = new x402ResourceServer(facilitatorClient);
registerExactEvmScheme(server);
registerExactSvmScheme(server);
registerExactAvmScheme(server);

const EVM_NETWORK = "eip155:84532" as const; // Base Sepolia
const SVM_NETWORK = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" as const; // Solana Devnet
const AVM_NETWORK = "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=" as const; // Algorand Testnet

export const accepts = [
  {
    scheme: "exact",
    price: "$0.001",
    network: EVM_NETWORK,
    payTo: evmAddress,
  },
  {
    scheme: "exact",
    price: "$0.001",
    network: SVM_NETWORK,
    payTo: svmAddress,
  },
  {
    scheme: "exact",
    price: "$0.001",
    network: AVM_NETWORK,
    payTo: avmAddress,
  },
];

// Build paywall with all networks
export const paywall = createPaywall()
  .withNetwork(evmPaywall)
  .withNetwork(svmPaywall)
  .withNetwork(avmPaywall)
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
      accepts,
      description: "Premium music: x402 Remix",
      mimeType: "text/html",
      extensions: {
        ...declareDiscoveryExtension({}),
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

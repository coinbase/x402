import { paymentProxy } from "@x402/next";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { createPaywall } from "@x402/paywall";
import { evmPaywall } from "@x402/paywall/evm";
import { facilitator } from "@coinbase/x402";
import {
  declareEip2612GasSponsoringExtension,
  declareErc20ApprovalGasSponsoringExtension,
} from "@x402/extensions";

export const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;

if (!evmAddress) {
  console.error("EVM_ADDRESS environment variable is required");
  process.exit(1);
}

const BASE_MAINNET = "eip155:8453" as const;
const BASE_MAINNET_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const facilitatorClient = new HTTPFacilitatorClient(facilitator);

export const server = new x402ResourceServer(facilitatorClient);
server.register("eip155:*", new ExactEvmScheme());

export const paywall = createPaywall()
  .withNetwork(evmPaywall)
  .withConfig({
    appName: process.env.APP_NAME || "Next x402 Demo",
    appLogo: process.env.APP_LOGO || "/x402-icon-blue.png",
    testnet: false,
  })
  .build();

export const proxy = paymentProxy(
  {
    // Backwards compatibility case (EIP3009)
    "/protected-currency": {
      accepts: {
        scheme: "exact",
        price: "$0.001",
        network: BASE_MAINNET,
        payTo: evmAddress,
      },
      description: "Currency shorthand pricing",
      mimeType: "text/html",
    },
    // Explicit EIP3009
    "/protected-eip3009": {
      accepts: {
        scheme: "exact",
        network: BASE_MAINNET,
        payTo: evmAddress,
        price: {
          amount: "1000",
          asset: BASE_MAINNET_USDC,
          extra: {
            assetTransferMethod: "eip3009",
            name: "USD Coin",
            version: "2",
          }
        },
      },
      description: "EIP-3009 long-form pricing (USDC transferWithAuthorization)",
      mimeType: "text/html",
    },
    "/protected-eip2612": {
      accepts: {
        scheme: "exact",
        network: BASE_MAINNET,
        payTo: evmAddress,
        price: {
          amount: "1000",
          asset: BASE_MAINNET_USDC,
          extra: {
            assetTransferMethod: "permit2",
          },
        },
      },
      extensions: {
        ...declareEip2612GasSponsoringExtension(),
      },
      description: "Permit2 with EIP-2612 gas sponsorship",
      mimeType: "text/html",
    },
    "/protected-erc20": {
      accepts: {
        scheme: "exact",
        network: BASE_MAINNET,
        payTo: evmAddress,
        price: {
          amount: "1000",
          asset: BASE_MAINNET_USDC,
          extra: {
            assetTransferMethod: "permit2",
          },
        },
      },
      extensions: {
        ...declareErc20ApprovalGasSponsoringExtension(),
      },
      description: "Permit2 with generic ERC-20 approval gas sponsorship",
      mimeType: "text/html",
    },
  },
  server,
  undefined,
  paywall,
);

export const config = {
  matcher: [
    "/protected-currency/:path*",
    "/protected-eip3009/:path*",
    "/protected-eip2612/:path*",
    "/protected-erc20/:path*",
  ],
};

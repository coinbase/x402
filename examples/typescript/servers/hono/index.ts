import { config } from "dotenv";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { facilitator } from "@coinbase/x402";
import {
  declareEip2612GasSponsoringExtension,
  declareErc20ApprovalGasSponsoringExtension,
} from "@x402/extensions";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
config();

const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;
if (!evmAddress) {
  console.error("EVM_ADDRESS environment variable is required");
  process.exit(1);
}

const BASE_MAINNET = "eip155:8453";
const BASE_MAINNET_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const facilitatorClient = new HTTPFacilitatorClient(facilitator);

const app = new Hono();

app.use(
  paymentMiddleware(
    {
      // Backwards compatibility case (EIP3009)
      "GET /protected-currency": {
        accepts: {
          scheme: "exact",
          price: "$0.001",
          network: BASE_MAINNET,
          payTo: evmAddress,
        },
        description: "Currency shorthand pricing",
        mimeType: "application/json",
      },
      // Explicit EIP3009
      "GET /protected-eip3009": {
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
        mimeType: "application/json",
      },
      "GET /protected-eip2612": {
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
        mimeType: "application/json",
      },
      "GET /protected-erc20": {
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
        mimeType: "application/json",
      },
    },
    new x402ResourceServer(facilitatorClient).register("eip155:*", new ExactEvmScheme()),
  ),
);

app.get("/protected-currency", c => {
  return c.json({ message: "Currency shorthand endpoint", timestamp: new Date().toISOString() });
});

app.get("/protected-eip3009", c => {
  return c.json({ message: "EIP-3009 endpoint", timestamp: new Date().toISOString() });
});

app.get("/protected-eip2612", c => {
  return c.json({ message: "EIP-2612 gas-sponsored endpoint", timestamp: new Date().toISOString() });
});

app.get("/protected-erc20", c => {
  return c.json({ message: "ERC-20 approval gas-sponsored endpoint", timestamp: new Date().toISOString() });
});

app.get("/health", c => {
  return c.json({ status: "ok", network: BASE_MAINNET });
});

serve({
  fetch: app.fetch,
  port: 4021,
});

console.log(`Server listening at http://localhost:4021`);

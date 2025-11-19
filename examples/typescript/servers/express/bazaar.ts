import { config } from "dotenv";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
config();

const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;
if (!evmAddress) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const facilitatorUrl = process.env.FACILITATOR_URL;
if (!facilitatorUrl) {
  console.error("❌ FACILITATOR_URL environment variable is required");
  process.exit(1);
}
const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

const app = express();

app.use(
  paymentMiddleware(
    {
      "GET /weather": {
        accepts: {
          scheme: "exact",
          price: "$0.001",
          network: "eip155:84532",
          payTo: evmAddress,
        },
        description: "Weather data",
        mimeType: "application/json",
        extensions: {
          ...declareDiscoveryExtension({
            input: {
              queryParams: {
                weather: { type: "string" },
                temperature: { type: "number" },
              },
            },
            inputSchema: {
              properties: {
                weather: { type: "string" },
                temperature: { type: "number" },
              },
              required: ["weather", "temperature"],
            },
            output: {
              example: {
                weather: "sunny",
                temperature: 70,
              },
            },
          }),
        },
      },
    },
    new x402ResourceServer(facilitatorClient).registerScheme("eip155:84532", new ExactEvmScheme()),
  ),
);

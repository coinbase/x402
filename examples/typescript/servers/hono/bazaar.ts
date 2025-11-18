import { config } from "dotenv";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { Hono } from "hono";
import { ExactEvmServer } from "@x402/evm";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
config();

const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;

if (!evmAddress) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const app = new Hono();

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
    new x402ResourceServer().registerScheme("eip155:84532", new ExactEvmServer()),
  ),
);

app.get("/weather", (c) => {
  return c.json({
    report: {
      weather: "sunny",
      temperature: 70,
    },
  });
});

export default {
  port: 4021,
  fetch: app.fetch,
};

console.log(`Server listening at http://localhost:4021`);

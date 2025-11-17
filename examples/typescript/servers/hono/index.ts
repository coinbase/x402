import { config } from "dotenv";
import { paymentMiddleware, x402ResourceService } from "@x402/hono";
import { ExactEvmService } from "@x402/evm";
import { ExactSvmService } from "@x402/svm";
import { Hono } from "hono";
config();

const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;
const svmAddress = process.env.SVM_ADDRESS;

if (!evmAddress || !svmAddress) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const app = new Hono();

app.use(
  paymentMiddleware(
    {
      "GET /weather": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.001",
            network: "eip155:84532",
            payTo: evmAddress,
          },
          {
            scheme: "exact",
            price: "$0.001",
            network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
            payTo: svmAddress,
          },
        ],
        description: "Weather data",
        mimeType: "application/json",
      },
    },
    new x402ResourceService()
      .registerScheme("eip155:84532", new ExactEvmService())
      .registerScheme("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", new ExactSvmService()),
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

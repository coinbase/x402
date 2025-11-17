import { config } from "dotenv";
import { paymentMiddleware, x402ResourceService } from "@x402/hono";
import { Hono } from "hono";
import { ExactEvmService } from "@x402/evm";
config();

const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;

const addressLookup = {
  US: evmAddress,
  UK: evmAddress,
  CA: evmAddress,
  AU: evmAddress,
  NZ: evmAddress,
  IE: evmAddress,
  FR: evmAddress,
} as Record<string, `0x${string}`>;

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
          payTo: context => {
            // Dynamic payTo based on HTTP request context
            const country = context.adapter.getQueryParam?.("country") ?? "US";
            return addressLookup[country as keyof typeof addressLookup];
          },
        },
        description: "Weather data",
        mimeType: "application/json",
      },
    },
    new x402ResourceService().registerScheme("eip155:84532", new ExactEvmService()),
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

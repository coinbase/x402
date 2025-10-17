import { config } from "dotenv";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { paymentMiddleware, Network, Resource, SolanaAddress } from "x402-hono";

config();

const facilitatorUrl = process.env.FACILITATOR_URL as Resource;
const payTo = process.env.ADDRESS as `0x${string}` | SolanaAddress;
const network = process.env.NETWORK as Network;

if (!facilitatorUrl || !payTo || !network) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const app = new Hono();

console.log("Server is running");

app.use(
  paymentMiddleware(
    payTo,
    {
      "/weather": {
        price: "$0.001",
        network,
      },
      "GET /hedera-usdc": {
        price: "$0.001",
        network: "hedera-testnet",
      },
      "GET /hedera-native": {
        price: {
          amount: "50000000",
          asset: {
            address: "hbar",
            decimals: 8,
          },
        },
        network: "hedera-testnet",
      },
    },
    {
      url: facilitatorUrl,
    },
  ),
);

app.get("/weather", c => {
  return c.json({
    report: {
      weather: "sunny",
      temperature: 70,
    },
  });
});
// Hedera endpoints
app.get("/hedera-usdc", c => {
  return c.json({
    report: {
      weather: "sunny on Hedera",
      temperature: 75,
    },
    data: {
      paid_with: "USDC",
      token_id: "0.0.429274",
      network: "hedera-testnet",
    },
  });
});

app.get("/hedera-native", c => {
  return c.json({
    report: {
      premium_content: "Exclusive Hedera network data with native payment",
      temperature: 75,
    },
    data: {
      paid_with: "HBAR",
      amount_hbar: "0.5",
    },
  });
});

serve({
  fetch: app.fetch,
  port: 4021,
});

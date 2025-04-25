import { config } from "dotenv";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { paymentMiddleware, Network, Resource } from "x402-hono";

config();

const facilitatorUrl = process.env.FACILITATOR_URL as Resource;
const payToAddress = process.env.ADDRESS as `0x${string}`;
const network = process.env.NETWORK as Network;
const port = parseInt(process.env.PORT as string);

if (!facilitatorUrl || !payToAddress || !network || !port) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const app = new Hono();

app.use(
  paymentMiddleware(
    payToAddress,
    {
      "/weather": {
        price: "$0.001",
        network,
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

serve({
  fetch: app.fetch,
  port,
});

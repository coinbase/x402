import { config } from "dotenv";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { configurePaymentMiddleware, Network, Resource } from "x402-hono";

config();

const { FACILITATOR_URL, ADDRESS, NETWORK, PORT } = process.env;

if (!FACILITATOR_URL || !ADDRESS || !NETWORK || !PORT) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const app = new Hono();
const port = parseInt(PORT);

const paymentMiddleware = configurePaymentMiddleware({
  facilitatorUrl: FACILITATOR_URL as Resource,
  address: ADDRESS as `0x${string}`,
  network: NETWORK as Network,
});

app.get(
  "/weather",
  paymentMiddleware("$0.001", {
    resource: `http://localhost:${port}/weather`,
  }),
  c => {
    return c.json({
      report: {
        weather: "sunny",
        temperature: 70,
      },
    });
  },
);

serve({
  fetch: app.fetch,
  port,
});

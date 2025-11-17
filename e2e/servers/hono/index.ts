import { config } from "dotenv";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { paymentMiddleware, Network, Resource } from "x402-hono";
import { facilitator } from "@coinbase/x402";

config();

const useCdpFacilitator = process.env.USE_CDP_FACILITATOR === "true";
const facilitatorUrl = process.env.FACILITATOR_URL as `${string}://${string}`;
const payTo = process.env.EVM_ADDRESS as `0x${string}`;
const network = process.env.EVM_NETWORK as Network;
const port = parseInt(process.env.PORT || "4021");

if (!payTo || !network) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const app = new Hono();

// Apply payment middleware to protected endpoint
app.use(
  paymentMiddleware(
    payTo,
    {
      "/protected": {
        price: "$0.001",
        network,
      },
    },
    facilitatorUrl
      ? {
          url: facilitatorUrl,
        }
      : useCdpFacilitator
        ? facilitator
        : undefined,
  ),
);

// Protected endpoint requiring payment
app.get("/protected", c => {
  return c.json({
    message: "Protected endpoint accessed successfully",
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint
app.get("/health", c => {
  return c.json({
    status: "healthy",
  });
});

// Graceful shutdown endpoint
app.post("/close", c => {
  console.log("Received shutdown request");
  setTimeout(() => {
    process.exit(0);
  }, 1000);

  return c.json({
    message: "Shutting down gracefully",
  });
});

console.log("Server listening on port", port);

serve({
  fetch: app.fetch,
  port,
});

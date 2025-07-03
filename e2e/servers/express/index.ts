import express from "express";
import { Network, paymentMiddleware, Resource } from "x402-express";
import { facilitator } from "@coinbase/x402";
import dotenv from "dotenv";

dotenv.config();

const useCdpFacilitator = process.env.USE_CDP_FACILITATOR as Resource;
const network = process.env.NETWORK as Network;
const payTo = process.env.ADDRESS as `0x${string}`;
const port = process.env.PORT || "4021";

if (!useCdpFacilitator || !payTo || !network) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const app = express();

app.use(
  paymentMiddleware(
    payTo,
    {
      "GET /protected": {
        price: "$0.001",
        network,
      },
    },
    useCdpFacilitator ? facilitator : undefined
  ),
);

app.get("/protected", (req, res) => {
  res.json({
    message: "Protected endpoint accessed successfully",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/close", (req, res) => {
  res.json({ message: "Server shutting down" });
  console.log("Received shutdown request");
  process.exit(0);
});

app.listen(parseInt(port), () => {
  console.log(`Server listening at http://localhost:${port}`);
}); 
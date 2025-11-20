import express from "express";
import { Network, paymentMiddleware } from "x402-express";
import dotenv from "dotenv";

dotenv.config();

const facilitatorUrl = process.env.FACILITATOR_URL as `${string}://${string}`;
const evmNetwork = process.env.EVM_NETWORK as Network;
const payToEvm = process.env.EVM_ADDRESS as `0x${string}`;
const port = process.env.PORT || "4021";

if (!payToEvm || !evmNetwork || !facilitatorUrl) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const app = express();

app.use(
  paymentMiddleware(
    payToEvm,
    {
      "GET /protected": {
        price: "$0.001",
        network: evmNetwork,
      },
    },
    facilitatorUrl
      ? {
          url: facilitatorUrl,
        }
      : undefined,
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

import { config } from "dotenv";
import express from "express";
import { paymentMiddleware } from "x402-express";
// Import the facilitator from the x402 package to use the mainnet facilitator
import { facilitator } from "@coinbase/x402";

config();

const payToAddress = process.env.ADDRESS as `0x${string}`;

// The CDP API key ID and secret are required to use the mainnet facilitator
if (!payToAddress || !process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const app = express();

app.use(
  paymentMiddleware(
    payToAddress,
    {
      "GET /weather": {
        // USDC amount in dollars
        price: "$0.001",
        network: "solana",
      },
    },
    // Pass the mainnet facilitator to the payment middleware
    facilitator,
  ),
);

app.get("/weather", (req, res) => {
  res.send({
    report: {
      weather: "sunny",
      temperature: 70,
    },
  });
});

app.listen(4021, () => {
  console.log(`Server listening at http://localhost:4021`);
});

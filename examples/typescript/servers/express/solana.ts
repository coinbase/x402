import { config } from "dotenv";
import express from "express";
import { paymentMiddleware, Resource } from "x402-express";
import { type Address } from "@solana/addresses";
config();

const facilitatorUrl = process.env.FACILITATOR_URL as Resource;
const payTo = process.env.ADDRESS as Address;

if (!facilitatorUrl || !payTo) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const app = express();

app.use(
  paymentMiddleware(
    payTo,
    {
      "GET /weather": {
        // USDC amount in dollars
        price: "$0.001",
        network: "solana-devnet",
      },
      "/premium/*": {
        // Define atomic amounts in any spl token
        price: {
          amount: "100000", // 0.1 USDC
          asset: {
            address: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
            decimals: 6,
          },
        },
        // network: "solana" // uncomment for Solana mainnet
        network: "solana-devnet",
      },
    },
    {
      url: facilitatorUrl,
    },
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

app.get("/premium/content", (req, res) => {
  res.send({
    content: "This is premium content",
  });
});

app.listen(4021, () => {
  console.log(`Server listening at http://localhost:${4021}`);
});

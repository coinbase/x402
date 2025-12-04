import { config } from "dotenv";
import express from "express";
import { Network, paymentMiddleware, Resource, type SolanaAddress } from "x402-express";
config();

const network = (process.env.NETWORK || "base-sepolia") as Network;
const facilitatorUrl = process.env.FACILITATOR_URL as Resource;
const payTo = process.env.ADDRESS as `0x${string}` | SolanaAddress;

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
        network,
      },
      "/premium/*": {
        // Define atomic amounts in any EIP-3009 token
        price: {
          amount: "100000",
          asset: {
            address: "0xabc",
            decimals: 18,
            // omit eip712 for Solana
            eip712: {
              name: "WETH",
              version: "1",
            },
          },
        },
        network,
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

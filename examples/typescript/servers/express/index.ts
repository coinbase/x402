import { config } from "dotenv";
import express from "express";
import { paymentMiddleware, Resource } from "x402-express";
config();

const facilitatorUrl = process.env.FACILITATOR_URL as Resource;
const payToAddress = process.env.ADDRESS as `0x${string}`;
const port = parseInt(process.env.PORT as string);

if (!facilitatorUrl || !payToAddress || !port) {
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
        network: "base-sepolia",
      },
      "/premium/*": {
        // Define atomic amounts in any EIP-3009 token
        price: {
          amount: "100000",
          asset: {
            address: "0xabc",
            decimals: 18,
            eip712: {
              name: "WETH",
              version: "1",
            },
          },
        },
        network: "base-sepolia",
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

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

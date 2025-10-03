import { config } from "dotenv";
import express from "express";
import {
  paymentMiddleware,
  deferredPaymentMiddleware,
  Resource,
  type SolanaAddress,
} from "x402-express";
config();

const facilitatorUrl = process.env.FACILITATOR_URL as Resource;
const payTo = process.env.ADDRESS as `0x${string}` | SolanaAddress;
const deferredEscrow = process.env.DEFERRED_ESCROW as `0x${string}`;

if (!facilitatorUrl || !payTo) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const app = express();

// Exact scheme content
app.use(
  paymentMiddleware(
    payTo,
    {
      "GET /weather": {
        // USDC amount in dollars
        price: "$0.001",
        // network: "base" // uncomment for Base mainnet
        // network: "solana" // uncomment for Solana mainnet
        network: "base-sepolia",
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
        // network: "base" // uncomment for Base mainnet
        // network: "solana" // uncomment for Solana mainnet
        network: "base-sepolia",
      },
    },
    {
      url: facilitatorUrl,
    },
  ),
);

// Deferred scheme content
if (deferredEscrow) {
  app.use(
    deferredPaymentMiddleware(
      payTo as `0x${string}`,
      {
        "/deferred/*": {
          price: "$0.001",
          network: "base-sepolia",
        },
      },
      deferredEscrow,
      {
        url: facilitatorUrl,
      },
    ),
  );
}

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

app.get("/free", (req, res) => {
  res.send({
    content: "This is free content",
  });
});

if (deferredEscrow) {
  app.get("/deferred/content", (req, res) => {
    res.send({
      content: "This is premium content via deferred scheme",
    });
  });
}

app.listen(4021, () => {
  console.log(`Server listening at http://localhost:${4021}`);
});

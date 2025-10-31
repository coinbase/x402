import { config } from "dotenv";
import express from "express";
import { paymentMiddleware, Resource, type SolanaAddress } from "@b3dotfun/anyspend-x402-express";
config();

const facilitatorUrl = process.env.FACILITATOR_URL as Resource;
const payTo = process.env.ADDRESS as `0x${string}` | SolanaAddress;

if (!facilitatorUrl || !payTo) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const app = express();

// Multi-token payment middleware configuration
// This example shows how to accept different tokens for different endpoints
app.use(
  paymentMiddleware(
    payTo,
    {
      // USDC payment (string format - easy way)
      "GET /weather": {
        price: "$0.001", // USDC amount in dollars
        network: "base-sepolia",
        config: {
          description: "Get current weather data",
        },
      },

      // WETH payment (ERC20TokenAmount format)
      "GET /premium/weth": {
        price: {
          amount: "100000000000000", // 0.0001 WETH (18 decimals)
          asset: {
            address: "0x4200000000000000000000000000000000000006", // WETH on Base Sepolia
            decimals: 18,
            eip712: {
              name: "Wrapped Ether",
              version: "1",
            },
          },
        },
        network: "base-sepolia",
        config: {
          description: "Premium content paid with WETH",
        },
      },

      // DAI payment
      "GET /premium/dai": {
        price: {
          amount: "1000000000000000", // 0.001 DAI (18 decimals)
          asset: {
            address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", // DAI on Base Sepolia
            decimals: 18,
            eip712: {
              name: "Dai Stablecoin",
              version: "1",
            },
          },
        },
        network: "base-sepolia",
        config: {
          description: "Premium content paid with DAI",
        },
      },

      // Cross-chain: Accept WETH on Ethereum Sepolia
      "GET /premium/eth-weth": {
        price: {
          amount: "100000000000000", // 0.0001 WETH
          asset: {
            address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // WETH on Ethereum Sepolia
            decimals: 18,
            eip712: {
              name: "Wrapped Ether",
              version: "1",
            },
          },
        },
        network: "ethereum-sepolia",
        config: {
          description: "Premium content paid with WETH on Ethereum",
        },
      },

      // Wildcard route accepting any token based on client preference
      // The middleware will check supported() and use client's X-PREFERRED-TOKEN header
      "GET /flexible/*": {
        price: "$0.01", // Default to USDC, but will accept other tokens if client specifies
        network: "base-sepolia",
        config: {
          description: "Flexible endpoint that accepts multiple tokens",
        },
      },
    },
    {
      url: facilitatorUrl,
    },
  ),
);

// Route handlers
app.get("/weather", (req, res) => {
  res.send({
    report: {
      weather: "sunny",
      temperature: 70,
    },
  });
});

app.get("/premium/weth", (req, res) => {
  res.send({
    content: "This premium content was paid with WETH",
    token: "WETH",
  });
});

app.get("/premium/dai", (req, res) => {
  res.send({
    content: "This premium content was paid with DAI",
    token: "DAI",
  });
});

app.get("/premium/eth-weth", (req, res) => {
  res.send({
    content: "This cross-chain premium content was paid with WETH on Ethereum",
    token: "WETH",
    network: "ethereum-sepolia",
  });
});

app.get("/flexible/content", (req, res) => {
  res.send({
    content: "This flexible endpoint accepts multiple payment tokens",
    message: "Client can specify X-PREFERRED-TOKEN header",
  });
});

app.listen(4021, () => {
  console.log(`Multi-token server listening at http://localhost:${4021}`);
  console.log(`
Endpoints:
  - GET /weather            - Accepts USDC ($0.001)
  - GET /premium/weth       - Accepts WETH (0.0001 WETH)
  - GET /premium/dai        - Accepts DAI (0.001 DAI)
  - GET /premium/eth-weth   - Accepts WETH on Ethereum (0.0001 WETH)
  - GET /flexible/content   - Accepts multiple tokens (uses client preference)
  `);
});

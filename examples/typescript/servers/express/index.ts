import { config } from "dotenv";
import express from "express";
import { paymentMiddleware, Resource, type SolanaAddress } from "x402-express";
config();

const facilitatorUrl = process.env.FACILITATOR_URL as Resource;
const payTo = process.env.ADDRESS as `0x${string}` | SolanaAddress | string; // Can be EVM, Solana, or Hedera address

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
      // Hedera examples
      "GET /hedera-usdc": {
        // Simple dollar amount - automatically uses USDC on Hedera testnet
        price: "$0.05",
        network: "hedera-testnet",
      },
      "GET /hedera-native": {
        // Native HBAR payment in tinybars (for demonstration)
        price: {
          amount: "50000000", // 0.5 HBAR
          asset: "HBAR", // or "0.0.0"
        },
        network: "hedera-testnet",
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

// Hedera endpoints
app.get("/hedera-usdc", (req, res) => {
  res.send({
    message: "You paid $0.05 with USDC on Hedera!",
    data: {
      weather: "sunny on Hedera",
      temperature: 75,
      paid_with: "USDC",
      token_id: "0.0.429274",
      network: "hedera-testnet",
    },
  });
});

app.get("/hedera-native", (req, res) => {
  res.send({
    message: "You paid 0.5 HBAR natively!",
    data: {
      premium_content: "Exclusive Hedera network data with native payment",
      paid_with: "HBAR",
      amount_hbar: "0.5",
    },
  });
});

app.listen(4021, () => {
  console.log(`Server listening at http://localhost:${4021}`);
  console.log("Available endpoints:");
  console.log("  GET /weather - Base Sepolia USDC payment ($0.01)");
  console.log("  GET /premium/content - Base Sepolia token payment");
  console.log("  GET /hedera-usdc - Hedera testnet USDC payment ($0.05)");
  console.log("  GET /hedera-native - Hedera testnet HBAR payment (0.5 HBAR)");
});

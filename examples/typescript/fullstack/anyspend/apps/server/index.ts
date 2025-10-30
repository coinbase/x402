import cors from "cors";
import dotenv from "dotenv";
import express, { Request, Response } from "express";
import { Address } from "viem";
import { paymentMiddleware } from "x402-express";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Basic middleware
app.use(cors());
app.use(express.json());

// Payment configuration from environment
const PAYTO_ADDRESS =
  (process.env.PAYTO_ADDRESS as Address) || "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0";
const NETWORK = (process.env.NETWORK as "base-sepolia" | "base") || "base-sepolia";
const PAYMENT_AMOUNT_USD = process.env.PAYMENT_AMOUNT_USD || "1000000"; // Default 1 USDC
const FACILITATOR_URL = (process.env.FACILITATOR_URL ||
  "https://facilitator.x402.org") as `${string}://${string}`;

// Apply payment middleware to protected routes
app.use(
  paymentMiddleware(
    PAYTO_ADDRESS,
    {
      "POST /api/premium": {
        price: PAYMENT_AMOUNT_USD,
        network: NETWORK,
        config: {
          description: "Access to premium market analysis data",
          mimeType: "application/json",
        },
      },
    },
    {
      url: FACILITATOR_URL,
    },
  ),
);

/**
 * Health check endpoint - Free (not protected by payment)
 */
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "healthy",
    facilitator: FACILITATOR_URL,
    network: NETWORK,
  });
});

/**
 * Premium API endpoint - Protected by payment middleware
 * The payment middleware automatically handles:
 * - Returning 402 when no payment header is provided
 * - Decoding and verifying the payment
 * - Settling the payment via remote facilitator
 * - Adding X-PAYMENT-RESPONSE header to successful responses
 */
app.post("/api/premium", (req: Request, res: Response) => {
  // Return premium data - payment middleware has already handled verification and settlement
  return res.json({
    success: true,
    data: generatePremiumData(),
  });
});

/**
 * Free API endpoint - No payment required
 */
app.get("/api/free", (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      message: "This is a free endpoint",
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Generate premium data (example)
 */
function generatePremiumData() {
  return {
    marketAnalysis: {
      trend: "bullish",
      confidence: 0.87,
      timeframe: "30d",
      signals: [
        "Strong institutional buying detected",
        "Increasing on-chain activity",
        "Positive technical indicators",
        "Rising social sentiment",
      ],
      riskFactors: ["Regulatory uncertainty", "Market volatility", "Macro headwinds"],
    },
    predictions: {
      btc: {
        price: "$95,000",
        change: "+5.5%",
        timeframe: "7d",
        support: "$88,000",
        resistance: "$98,000",
      },
      eth: {
        price: "$3,200",
        change: "+6.7%",
        timeframe: "7d",
        support: "$2,900",
        resistance: "$3,400",
      },
      sol: {
        price: "$145",
        change: "+8.2%",
        timeframe: "7d",
        support: "$130",
        resistance: "$155",
      },
    },
    recommendations: [
      {
        action: "ACCUMULATE",
        asset: "BTC",
        reason: "Strong fundamentals, institutional adoption increasing",
        priority: "high",
      },
      {
        action: "HOLD",
        asset: "ETH",
        reason: "Wait for confirmed breakout above resistance",
        priority: "medium",
      },
      {
        action: "TAKE_PROFIT",
        asset: "SOL",
        reason: "Approaching overbought levels, consider partial profit-taking",
        priority: "medium",
      },
    ],
    whaleActivity: {
      largeTransfers: 47,
      netFlow: "+$23.4M",
      topWallets: [
        { address: "0x742d...bEb0", balance: "$124.5M", change: "+2.3%" },
        { address: "0x8f3b...c7a2", balance: "$89.2M", change: "-1.1%" },
        { address: "0xa4d9...3fe8", balance: "$76.8M", change: "+5.7%" },
      ],
    },
    timestamp: new Date().toISOString(),
  };
}

// Start server
app.listen(PORT, () => {
  console.log("\n🚀 AnySpend Express Server with Remote Facilitator");
  console.log("===================================================");
  console.log(`   Server running on: http://localhost:${PORT}`);
  console.log(`   Facilitator URL: ${FACILITATOR_URL}`);
  console.log(`   Network: ${NETWORK}`);
  console.log(`   Payment Amount: ${PAYMENT_AMOUNT_USD}`);
  console.log(`   Pay To: ${PAYTO_ADDRESS}`);
  console.log("\n📝 Available Endpoints:");
  console.log("   GET  /health        - Health check (free)");
  console.log("   GET  /api/free      - Free endpoint (no payment)");
  console.log("   POST /api/premium   - Premium endpoint (requires payment)");
  console.log("\n💡 To test:");
  console.log("   Use the React client at http://localhost:3000\n");
});

export default app;

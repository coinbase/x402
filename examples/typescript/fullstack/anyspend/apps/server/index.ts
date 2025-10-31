import cors from "cors";
import dotenv from "dotenv";
import express, { Request, Response } from "express";
import { Address } from "viem";
import { paymentMiddleware } from "@b3dotfun/anyspend-x402-express";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Basic middleware
app.use(cors());
app.use(express.json());

// Payment configuration from environment
const PAYTO_ADDRESS =
  (process.env.PAYTO_ADDRESS as Address) || "0xB3B32F9f8827D4634fE7d973Fa1034Ec9fdDB3B3";
const NETWORK = (process.env.NETWORK as "base-sepolia" | "base") || "base";
const PAYMENT_AMOUNT_USD = process.env.PAYMENT_AMOUNT_USD || "100000000"; // Default 100 USDC (100 * 10^6)
const FACILITATOR_URL = (process.env.FACILITATOR_URL ||
  "https://facilitator.x402.org") as `${string}://${string}`;

// API Keys from environment
if (!process.env.COINGECKO_API_KEY) {
  console.warn("⚠️  COINGECKO_API_KEY not found in .env file");
}
if (!process.env.SIMDUNE_API_KEY) {
  console.warn("⚠️  SIMDUNE_API_KEY not found in .env file");
}
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY!;
const SIMDUNE_API_KEY = process.env.SIMDUNE_API_KEY!;

// Apply payment middleware to protected routes
app.use(
  paymentMiddleware(
    PAYTO_ADDRESS,
    {
      "POST /api/b3/premium": {
        price: {
          amount: "100000000000000000000", // 100 B3 tokens (100 * 10^18)
          asset: {
            address: "0xB3B32F9f8827D4634fE7d973Fa1034Ec9fdDB3B3" as Address,
            decimals: 18,
            eip712: {
              name: "B3",
              version: "1",
            },
          },
        },
        network: NETWORK,
        config: {
          description: "Access to premium ETH price history data from CoinGecko",
          mimeType: "application/json",
        },
      },
    },
    {
      url: FACILITATOR_URL,
    },
  ),
);

app.use(
  paymentMiddleware(
    PAYTO_ADDRESS,
    {
      "POST /api/usdc/premium": {
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

app.use(
  paymentMiddleware(
    PAYTO_ADDRESS,
    {
      "POST /api/btc": {
        price: "10000", // 0.01 USDC (0.01 * 10^6)
        network: NETWORK,
        config: {
          description: "Access to premium BTC price history data",
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
app.post("/api/b3/premium", async (req: Request, res: Response) => {
  try {
    // Fetch ETH price history from CoinGecko
    const premiumData = await fetchEthPriceHistory();

    return res.json({
      success: true,
      data: premiumData,
    });
  } catch (error) {
    console.error("Error fetching premium data:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch premium data",
    });
  }
});

/**
 * Premium API endpoint - Protected by payment middleware
 * The payment middleware automatically handles:
 * - Returning 402 when no payment header is provided
 * - Decoding and verifying the payment
 * - Settling the payment via remote facilitator
 * - Adding X-PAYMENT-RESPONSE header to successful responses
 */
app.post("/api/usdc/premium", async (req: Request, res: Response) => {
  try {
    // Fetch ETH price history from CoinGecko
    const premiumData = await fetchEthPriceHistory();

    return res.json({
      success: true,
      data: premiumData,
    });
  } catch (error) {
    console.error("Error fetching premium data:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch premium data",
    });
  }
});

/**
 * BTC API endpoint - Protected by payment middleware (0.01 USDC)
 * The payment middleware automatically handles:
 * - Returning 402 when no payment header is provided
 * - Decoding and verifying the payment
 * - Settling the payment via remote facilitator
 * - Adding X-PAYMENT-RESPONSE header to successful responses
 */
app.post("/api/btc", async (req: Request, res: Response) => {
  try {
    // Fetch BTC price history from CoinGecko
    const btcData = await fetchBtcPriceHistory();

    return res.json({
      success: true,
      data: btcData,
    });
  } catch (error) {
    console.error("Error fetching BTC data:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch BTC data",
    });
  }
});

/**
 * Free API endpoint - No payment required
 */
app.get("/api/free", (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      message: "This is a free endpoint - pay to access ETH price history",
      timestamp: new Date().toISOString(),
    },
  });
});

// Type definitions for SimDune API response
interface SimDuneBalance {
  address: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  amount?: string;
  price_usd?: string;
}

interface SimDuneResponse {
  balances?: SimDuneBalance[];
}

/**
 * Token balances endpoint - Returns user's token balances from SimDune
 * This is a free endpoint to help users see what tokens they can pay with
 */
app.get("/api/balances/:address", async (req: Request, res: Response) => {
  const { address } = req.params;
  const chainId = req.query.chain_id || "8453"; // Default to Base

  console.log(`Fetching balances for ${address} on chain ${chainId}`);

  try {
    const url = `https://api.sim.dune.com/v1/evm/balances/${address}?chain_ids=${chainId}&exclude_spam_tokens=true`;

    const response = await fetch(url, {
      headers: {
        "X-Sim-Api-Key": SIMDUNE_API_KEY,
      },
    });

    if (!response.ok) {
      console.error("SimDune API error:", response.status, await response.text());
      return res.status(response.status).json({
        success: false,
        error: "Failed to fetch balances from SimDune",
      });
    }

    const data = (await response.json()) as SimDuneResponse;
    console.log(`SimDune returned ${data.balances?.length || 0} balances`);

    // Extract balances from the response
    const balances = data.balances || [];

    // Calculate USD values and sort by value
    const tokensWithValue = balances
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((balance: any) => {
        const rawAmount = balance.amount || "0";
        const decimals = balance.decimals || 18;

        // Convert wei to human-readable format
        let amount: number;
        try {
          const weiBigInt = BigInt(rawAmount.toString().split(".")[0]);
          amount = Number(weiBigInt) / Math.pow(10, decimals);
        } catch {
          amount = parseFloat(rawAmount) / Math.pow(10, decimals);
        }

        const price = parseFloat(balance.price_usd || "0");
        const valueUsd = amount * price;

        // Format balance to remove trailing zeros
        let formattedBalance: string;
        if (amount > 0 && amount < 0.01) {
          formattedBalance = amount.toFixed(6).replace(/\.?0+$/, "");
        } else if (amount >= 0.01 && amount < 1) {
          formattedBalance = amount.toFixed(4).replace(/\.?0+$/, "");
        } else {
          formattedBalance = amount.toFixed(2).replace(/\.?0+$/, "");
        }

        return {
          address: balance.address,
          symbol: balance.symbol || "UNKNOWN",
          name: balance.name || "Unknown Token",
          decimals: decimals,
          balance: formattedBalance,
          valueUsd: valueUsd,
        };
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((token: any) => token.valueUsd > 0)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .sort((a: any, b: any) => b.valueUsd - a.valueUsd)
      .slice(0, 5); // Top 5

    console.log(`Returning ${tokensWithValue.length} tokens with value`);

    res.json({
      success: true,
      tokens: tokensWithValue,
    });
  } catch (err) {
    console.error("Error fetching balances:", err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

/**
 * Fetch ETH price history from CoinGecko
 *
 * @returns {Promise} Promise resolving to price history data
 */
async function fetchEthPriceHistory() {
  try {
    // Fetch ETH OHLCV data for the last 24 hours (minute intervals)
    const url =
      "https://pro-api.coingecko.com/api/v3/coins/ethereum/ohlc?vs_currency=usd&days=1&precision=2";

    console.log("Fetching ETH price history from CoinGecko...");

    const response = await fetch(url, {
      headers: {
        "x-cg-pro-api-key": COINGECKO_API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("CoinGecko API error:", response.status, errorText);
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = (await response.json()) as number[][];

    // Data format: [[timestamp, open, high, low, close], ...]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const priceHistory = data.map((item: any) => ({
      timestamp: item[0],
      open: item[1],
      high: item[2],
      low: item[3],
      close: item[4],
    }));

    // Calculate statistics
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prices = priceHistory.map((p: any) => p.close);
    const currentPrice = prices[prices.length - 1];
    const dayStartPrice = prices[0];
    const highPrice = Math.max(...prices);
    const lowPrice = Math.min(...prices);
    const priceChange = currentPrice - dayStartPrice;
    const priceChangePercent = ((priceChange / dayStartPrice) * 100).toFixed(2);

    return {
      symbol: "ETH",
      name: "Ethereum",
      currentPrice: currentPrice,
      priceChange: priceChange,
      priceChangePercent: priceChangePercent,
      high24h: highPrice,
      low24h: lowPrice,
      priceHistory: priceHistory,
      dataPoints: priceHistory.length,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error fetching ETH price history:", error);
    throw error;
  }
}

/**
 * Fetch BTC price history from CoinGecko
 *
 * @returns {Promise} Promise resolving to price history data
 */
async function fetchBtcPriceHistory() {
  try {
    // Fetch BTC OHLCV data for the last 24 hours (minute intervals)
    const url =
      "https://pro-api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=1&precision=2";

    console.log("Fetching BTC price history from CoinGecko...");

    const response = await fetch(url, {
      headers: {
        "x-cg-pro-api-key": COINGECKO_API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("CoinGecko API error:", response.status, errorText);
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = (await response.json()) as number[][];

    // Data format: [[timestamp, open, high, low, close], ...]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const priceHistory = data.map((item: any) => ({
      timestamp: item[0],
      open: item[1],
      high: item[2],
      low: item[3],
      close: item[4],
    }));

    // Calculate statistics
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prices = priceHistory.map((p: any) => p.close);
    const currentPrice = prices[prices.length - 1];
    const dayStartPrice = prices[0];
    const highPrice = Math.max(...prices);
    const lowPrice = Math.min(...prices);
    const priceChange = currentPrice - dayStartPrice;
    const priceChangePercent = ((priceChange / dayStartPrice) * 100).toFixed(2);

    return {
      symbol: "BTC",
      name: "Bitcoin",
      currentPrice: currentPrice,
      priceChange: priceChange,
      priceChangePercent: priceChangePercent,
      high24h: highPrice,
      low24h: lowPrice,
      priceHistory: priceHistory,
      dataPoints: priceHistory.length,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error fetching BTC price history:", error);
    throw error;
  }
}

// Start server
app.listen(PORT, () => {
  console.log("\n🚀 AnySpend Express Server with CoinGecko Premium Data");
  console.log("========================================================");
  console.log(`   Server running on: http://localhost:${PORT}`);
  console.log(`   Facilitator URL: ${FACILITATOR_URL}`);
  console.log(`   Network: ${NETWORK}`);
  console.log(`   Payment USDC Amount: 0.001 USDC (1 * 10^6) to api/usdc/premium`);
  console.log(`   Payment B3 Amount: 100 B3 tokens (100 * 10^18) to api/b3/premium`);
  console.log(`   Payment for BTC: 0.01 USDC (10000 * 10^-6) to api/btc`);
  console.log(`   Pay To Address: ${PAYTO_ADDRESS}`);
  console.log("\n📝 Available Endpoints:");
  console.log("   GET  /health                - Health check (free)");
  console.log("   GET  /api/free              - Free endpoint (no payment)");
  console.log("   GET  /api/balances/:address - Token balances (free)");
  console.log("   POST /api/b3/premium       - B3 premium data (requires payment)");
  console.log("   POST /api/usdc/premium     - USDC premium data (requires payment)");
  console.log("   POST /api/btc              - BTC premium data (0.01 USDC)");
  console.log("\n💎 Premium Data Includes:");
  console.log("   • 24-hour ETH/BTC price history (OHLC data)");
  console.log("   • Current price & price change");
  console.log("   • 24h high/low prices");
  console.log("   • Historical data points");
  console.log("\n💡 To test:");
  console.log("   Use the React client at http://localhost:3000\n");
});

export default app;

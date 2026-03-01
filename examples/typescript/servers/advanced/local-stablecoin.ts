/**
 * Local Stablecoin Server Example
 *
 * Demonstrates how to accept payments in local currency stablecoins
 * (e.g., wARS/Peso Argentino, wBRL/Real Brasileiro) using x402.
 *
 * x402 is asset-agnostic by design. While USDC is the default, any ERC-20
 * token can be used as a payment asset. This is especially powerful for
 * agents operating in local markets — they can pay in local currency
 * without FX friction.
 *
 * This example uses Permit2 (not EIP-3009) because most local stablecoins
 * implement EIP-2612 permit rather than EIP-3009 transferWithAuthorization.
 *
 * Token: wARS (Peso Argentino) on Base
 * Address: 0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D
 * Decimals: 18
 * Standard: ERC-20 with EIP-2612 permit
 */
import { config } from "dotenv";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
config();

const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;
if (!evmAddress) {
  console.error("❌ EVM_ADDRESS environment variable is required");
  process.exit(1);
}

const facilitatorUrl = process.env.FACILITATOR_URL;
if (!facilitatorUrl) {
  console.error("❌ FACILITATOR_URL environment variable is required");
  process.exit(1);
}
const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

// ─── Local Stablecoin Registry ──────────────────────────────────────────────
// Add your local stablecoins here. Each entry maps a network to token metadata.
// This pattern scales to any number of local currencies.
const LOCAL_STABLECOINS: Record<
  string,
  Record<string, { address: string; symbol: string; decimals: number }>
> = {
  // wARS - Argentine Peso stablecoin by Ripio
  ARS: {
    "eip155:8453": {
      address: "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D",
      symbol: "wARS",
      decimals: 18,
    },
  },
  // Future local stablecoins can be added here:
  // BRL: {
  //   "eip155:8453": { address: "0x...", symbol: "wBRL", decimals: 18 },
  // },
  // COP: {
  //   "eip155:8453": { address: "0x...", symbol: "wCOP", decimals: 18 },
  // },
};

// ─── Money Parser for Local Currency ────────────────────────────────────────
// When a server prices in local currency (e.g., ARS 1500), this parser
// converts the amount to the correct token units.
function createLocalCurrencyParser(currencyCode: string) {
  return async (amount: number, network: string) => {
    const currencies = LOCAL_STABLECOINS[currencyCode];
    if (!currencies) return null;

    const token = currencies[network];
    if (!token) return null;

    // Convert decimal amount to token smallest unit
    const tokenAmount = BigInt(Math.round(amount * 10 ** token.decimals)).toString();

    return {
      amount: tokenAmount,
      asset: token.address,
      extra: {
        token: token.symbol,
        // Use permit2 since wARS supports EIP-2612, not EIP-3009
        assetTransferMethod: "permit2",
      },
    };
  };
}

const app = express();

// ─── Payment Middleware ─────────────────────────────────────────────────────
// Price your API in local currency. Agents pay in wARS on Base.
// No USD conversion needed — price directly in ARS.
app.use(
  paymentMiddleware(
    {
      // Price: 1500 ARS per request (about $1.25 USD at typical rates)
      "GET /cotizacion": {
        accepts: {
          scheme: "exact",
          price: 1500,
          network: "eip155:8453",
          payTo: evmAddress,
        },
        description: "Argentine market data - real-time exchange rates",
        mimeType: "application/json",
      },
      // Cheaper endpoint: 100 ARS
      "GET /clima": {
        accepts: {
          scheme: "exact",
          price: 100,
          network: "eip155:8453",
          payTo: evmAddress,
        },
        description: "Weather data for Argentine cities",
        mimeType: "application/json",
      },
    },
    new x402ResourceServer(facilitatorClient).register(
      "eip155:8453",
      new ExactEvmScheme().registerMoneyParser(createLocalCurrencyParser("ARS")),
    ),
  ),
);

// ─── Endpoints ──────────────────────────────────────────────────────────────
app.get("/cotizacion", (_req, res) => {
  res.json({
    currency: "ARS",
    rates: {
      USD: { buy: 1180, sell: 1220 },
      BRL: { buy: 195, sell: 205 },
      EUR: { buy: 1280, sell: 1340 },
    },
    source: "BCRA + market",
    timestamp: new Date().toISOString(),
  });
});

app.get("/clima", (_req, res) => {
  res.json({
    city: "Buenos Aires",
    temperature: 28,
    condition: "Partly cloudy",
    humidity: 65,
    timestamp: new Date().toISOString(),
  });
});

const PORT = 4022;
app.listen(PORT, () => {
  console.log(`🇦🇷 Local stablecoin server listening at http://localhost:${PORT}`);
  console.log(`   Accepting wARS payments on Base`);
  console.log(`   GET /cotizacion - 1500 ARS`);
  console.log(`   GET /clima - 100 ARS`);
});

/**
 * Local Stablecoin Client Example
 *
 * Demonstrates how an AI agent (or any client) pays for API access
 * using a local currency stablecoin (wARS) via x402.
 *
 * The client doesn't need to know anything special about wARS — it just
 * sends an HTTP request, gets a 402 back with payment requirements, and
 * pays using the standard x402 flow. The Permit2 mechanism handles
 * token approval and transfer automatically.
 *
 * This is the power of x402: agents can pay for services in any currency
 * the server accepts, without accounts, API keys, or manual setup.
 */
import { config } from "dotenv";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { publicActions } from "viem";
import { withX402 } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
config();

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) {
  console.error("❌ PRIVATE_KEY environment variable is required");
  process.exit(1);
}

// Server URL (the local-stablecoin server example)
const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:4022";

async function main() {
  // ─── Setup wallet ───────────────────────────────────────────────────────
  const account = privateKeyToAccount(PRIVATE_KEY);
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(),
  }).extend(publicActions);

  const signer = toClientEvmSigner(walletClient);

  // ─── Create x402-enabled fetch ──────────────────────────────────────────
  // withX402 wraps the standard fetch function. When a server responds with
  // HTTP 402, it automatically handles payment and retries the request.
  const x402Fetch = withX402(fetch, {
    "eip155:8453": new ExactEvmScheme(signer),
  });

  // ─── Make paid request ──────────────────────────────────────────────────
  // The agent just fetches a URL. x402 handles the rest:
  // 1. Server returns 402 with wARS payment requirements
  // 2. Client signs Permit2 authorization for wARS
  // 3. Server verifies and settles payment on Base
  // 4. Server returns the data
  console.log("🇦🇷 Fetching Argentine market data (costs 1500 wARS)...\n");

  const response = await x402Fetch(`${SERVER_URL}/cotizacion`);
  const data = await response.json();

  console.log("Exchange rates:");
  console.log(JSON.stringify(data, null, 2));

  // ─── Another request ────────────────────────────────────────────────────
  console.log("\n🌤️  Fetching weather data (costs 100 wARS)...\n");

  const weatherResponse = await x402Fetch(`${SERVER_URL}/clima`);
  const weatherData = await weatherResponse.json();

  console.log("Weather:");
  console.log(JSON.stringify(weatherData, null, 2));
}

main().catch(console.error);

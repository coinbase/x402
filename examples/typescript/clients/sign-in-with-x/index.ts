import { config } from "dotenv";
import { x402Client, x402HTTPClient, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { createSIWxClientHook } from "@x402/extensions/sign-in-with-x";
config();

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const baseURL = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";

const signer = privateKeyToAccount(evmPrivateKey);

// Configure client with SIWX hook - automatically tries SIWX auth before payment
const client = new x402Client();
registerExactEvmScheme(client, { signer });

const httpClient = new x402HTTPClient(client).onPaymentRequired(createSIWxClientHook(signer));

const fetchWithPayment = wrapFetchWithPayment(fetch, httpClient);

/**
 * Demonstrates the SIWX authentication flow.
 *
 * Flow depends on whether this is the first run or a subsequent run:
 *
 * **First Run:**
 * 1. First request → Server returns 402 with SIWX extension
 * 2. Client attempts SIWX auth (not yet paid) → Server still returns 402
 * 3. Client pays → Server records payment and grants access
 * 4. Second request → Client uses SIWX auth (now paid) → Access granted without payment
 *
 * **Subsequent Runs (if signature still valid):**
 * 1. First request → Client uses SIWX auth (paid from previous run) → Access granted
 * 2. Second request → Client uses SIWX auth → Access granted
 *
 * @param path - The resource path to request
 */
async function demonstrateResource(path: string): Promise<void> {
  const url = `${baseURL}${path}`;
  console.log(`\n--- ${path} ---`);

  // First request
  console.log("1. First request...");
  const response1 = await fetchWithPayment(url);
  const paymentHeader1 = response1.headers.get("payment-response");
  if (paymentHeader1) {
    console.log("   ✓ Paid via payment settlement");
  } else {
    console.log("   ✓ Authenticated via SIWX (previously paid)");
  }
  console.log("   Response:", await response1.json());

  // Second request
  console.log("2. Second request...");
  const response2 = await fetchWithPayment(url);
  const paymentHeader2 = response2.headers.get("payment-response");
  if (paymentHeader2) {
    console.log("   ✓ Paid via payment settlement");
  } else {
    console.log("   ✓ Authenticated via SIWX (previously paid)");
  }
  console.log("   Response:", await response2.json());
}

/**
 * Main entry point - demonstrates SIWX authentication flow.
 */
async function main(): Promise<void> {
  console.log(`Client address: ${signer.address}`);
  console.log(`Server: ${baseURL}`);

  await demonstrateResource("/weather");
  await demonstrateResource("/joke");

  console.log("\nDone. Each resource required payment once, then SIWX auth worked.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

import { config } from "dotenv";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithSIWx } from "@x402/extensions/sign-in-with-x";
config();

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const baseURL = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";

const evmSigner = privateKeyToAccount(evmPrivateKey);

// Payment wrapper - handles initial 402 by paying
const client = new x402Client();
registerExactEvmScheme(client, { signer: evmSigner });
const fetchWithPayment = wrapFetchWithPayment(fetch, client);

// SIWX wrapper - handles 402 by proving wallet ownership (for returning users)
const fetchWithSIWx = wrapFetchWithSIWx(fetch, evmSigner);

/**
 * Demonstrates the SIWX flow for a single resource.
 *
 * @param path - The resource path
 */
async function demonstrateResource(path: string): Promise<void> {
  const url = `${baseURL}${path}`;
  console.log(`\n--- ${path} ---`);

  // First request: pay for access
  console.log("1. First request (paying)...");
  const paidResponse = await fetchWithPayment(url);
  console.log("   Response:", await paidResponse.json());

  // Second request: use SIWX to prove we already paid
  console.log("2. Second request (SIWX auth)...");
  const siwxResponse = await fetchWithSIWx(url);
  console.log("   Response:", await siwxResponse.json());
}

/**
 * Tests SIWX auth only (assumes server pre-seeded with TEST_ADDRESS).
 *
 * @param path - The resource path
 */
async function testSIWxOnly(path: string): Promise<void> {
  const url = `${baseURL}${path}`;
  console.log(`\n--- Testing SIWX auth for ${path} ---`);

  console.log("1. Request without auth (expect 402)...");
  const noAuthResponse = await fetch(url);
  console.log(`   Status: ${noAuthResponse.status}`);

  console.log("2. Request with SIWX auth...");
  const siwxResponse = await fetchWithSIWx(url);
  console.log("   Response:", await siwxResponse.json());
}

/**
 * Main entry point demonstrating SIWX authentication flow.
 */
async function main(): Promise<void> {
  console.log(`Client address: ${evmSigner.address}`);
  console.log(`Server: ${baseURL}`);

  const testOnly = process.env.TEST_SIWX_ONLY === "true";

  if (testOnly) {
    // Test mode: assumes server has TEST_ADDRESS pre-seeded
    await testSIWxOnly("/weather");
    console.log("\nSIWX auth test complete.");
  } else {
    // Full flow: pay then auth
    await demonstrateResource("/weather");
    await demonstrateResource("/joke");
    console.log("\nDone. Each resource required payment once, then SIWX auth worked.");
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

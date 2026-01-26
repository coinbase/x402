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
 * Demonstrates the SIWX flow for a given resource path.
 *
 * @param path - The resource path to request
 */
async function demonstrateResource(path: string): Promise<void> {
  const url = `${baseURL}${path}`;
  console.log(`\n--- ${path} ---`);

  // First request: pays for access
  console.log("1. First request (paying)...");
  const response1 = await fetchWithPayment(url);
  console.log("   Response:", await response1.json());

  // Second request: SIWX hook automatically proves we already paid
  console.log("2. Second request (SIWX auth)...");
  const response2 = await fetchWithPayment(url);
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

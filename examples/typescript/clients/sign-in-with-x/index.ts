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
  console.log("1. First request...");
  const response1 = await fetchWithPayment(url);
  const body1 = await response1.json();
  const paymentHeader1 = response1.headers.get("payment-response");
  if (paymentHeader1) {
    console.log("   ✓ Paid via payment settlement");
  } else if (body1.error) {
    console.log("   ✗ Payment failed:", body1.details || body1.error);
  } else {
    console.log("   ✓ Authenticated via SIWX (previously paid)");
  }
  console.log("   Response:", body1);

  // Second request: SIWX hook automatically proves we already paid
  console.log("2. Second request...");
  const response2 = await fetchWithPayment(url);
  const body2 = await response2.json();
  const paymentHeader2 = response2.headers.get("payment-response");
  if (paymentHeader2) {
    console.log("   ✓ Paid via payment settlement");
  } else if (body2.error) {
    console.log("   ✗ Payment failed:", body2.details || body2.error);
  } else {
    console.log("   ✓ Authenticated via SIWX (previously paid)");
  }
  console.log("   Response:", body2);
}

/**
 * Main entry point - demonstrates SIWX authentication flow.
 */
async function main(): Promise<void> {
  console.log(`Client address: ${signer.address}`);
  console.log(`Server: ${baseURL}`);

  await demonstrateResource("/weather");

  // Small delay to avoid facilitator race condition with rapid payments
  await new Promise(resolve => setTimeout(resolve, 300));

  await demonstrateResource("/joke");

  console.log("\nDone. Each resource required payment once, then SIWX auth worked.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

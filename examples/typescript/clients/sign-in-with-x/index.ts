import { config } from "dotenv";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import {
  createSIWxPayload,
  encodeSIWxHeader,
  SIGN_IN_WITH_X,
  SIWxExtensionInfo,
} from "@x402/extensions/sign-in-with-x";
config();

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const baseURL = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";

const evmSigner = privateKeyToAccount(evmPrivateKey);

const client = new x402Client();
registerExactEvmScheme(client, { signer: evmSigner });
const fetchWithPayment = wrapFetchWithPayment(fetch, client);

/**
 * Makes a request using SIWX authentication (for returning users).
 *
 * @param url - The URL to request
 * @returns The response data
 */
async function fetchWithSIWx(url: string): Promise<unknown> {
  // First request to get SIWX extension info from 402 response
  const probeResponse = await fetch(url);
  if (probeResponse.status !== 402) {
    return probeResponse.json();
  }

  const paymentRequiredHeader = probeResponse.headers.get("PAYMENT-REQUIRED");
  if (!paymentRequiredHeader) {
    throw new Error("Missing PAYMENT-REQUIRED header");
  }

  const paymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader);
  const siwxExtension = paymentRequired.extensions?.[SIGN_IN_WITH_X] as
    | { info: SIWxExtensionInfo }
    | undefined;

  if (!siwxExtension) {
    throw new Error("Server does not support SIWX");
  }

  // Create and send SIWX proof
  const payload = await createSIWxPayload(siwxExtension.info, evmSigner);
  const siwxHeader = encodeSIWxHeader(payload);

  const authResponse = await fetch(url, {
    headers: { [SIGN_IN_WITH_X]: siwxHeader },
  });

  if (!authResponse.ok) {
    throw new Error(`SIWX auth failed: ${authResponse.status}`);
  }

  return authResponse.json();
}

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
  console.log("   Response:", siwxResponse);
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
  console.log("   Response:", siwxResponse);
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

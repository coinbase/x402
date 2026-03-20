import { config } from "dotenv";
import { x402Client, x402HTTPClient, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { createTokenGateClientHook } from "@x402/extensions/token-gate";
config();

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}` | undefined;
const baseURL = process.env.RESOURCE_SERVER_URL || "http://localhost:4022";

if (!evmPrivateKey) {
  console.error("Error: EVM_PRIVATE_KEY is required");
  process.exit(1);
}

const account = privateKeyToAccount(evmPrivateKey);

// Configure client with EVM payment scheme
const client = new x402Client();
client.register("eip155:*", new ExactEvmScheme(account));

// Register token-gate hook — on 402 with token-gate extension, checks on-chain
// ownership and retries with a signed proof if the wallet holds the required token
const httpClient = new x402HTTPClient(client).onPaymentRequired(
  createTokenGateClientHook({ account }),
);

const fetchWithPayment = wrapFetchWithPayment(fetch, httpClient);

/**
 * Decodes and logs payment response from headers if present.
 *
 * @param response - The fetch response object
 * @returns true if a payment settlement header was found and logged
 */
function logPaymentResponse(response: Response): boolean {
  try {
    const paymentResponse = httpClient.getPaymentSettleResponse(name => response.headers.get(name));
    if (paymentResponse) {
      console.log("   ✓ Paid via payment settlement");
      console.log("   Payment details:", JSON.stringify(paymentResponse, null, 2));
      return true;
    }
  } catch {
    // No payment response header (expected for token-gate free access)
  }
  return false;
}

/**
 * Demonstrates the token-gate flow for a given resource path.
 *
 * If the wallet holds the required NFT the server grants free access.
 * Otherwise the client falls through to normal x402 payment.
 *
 * @param path - The resource path to request
 */
async function demonstrateResource(path: string): Promise<void> {
  const url = `${baseURL}${path}`;
  console.log(`\n--- ${path} ---`);

  console.log("1. First request...");
  const response1 = await fetchWithPayment(url);
  const body1 = await response1.json();

  const hasPaid1 = logPaymentResponse(response1);
  if (response1.ok) {
    if (!hasPaid1) {
      console.log("   ✓ Free access via token-gate (NFT holder)");
    }
    console.log("   Response:", body1);
  } else if (body1.error) {
    console.log("   ✗ Request failed:", body1.details || body1.error);
  }

  console.log("2. Second request...");
  const response2 = await fetchWithPayment(url);
  const body2 = await response2.json();

  const hasPaid2 = logPaymentResponse(response2);
  if (response2.ok) {
    if (!hasPaid2) {
      console.log("   ✓ Free access via token-gate (NFT holder)");
    }
    console.log("   Response:", body2);
  } else if (body2.error) {
    console.log("   ✗ Request failed:", body2.details || body2.error);
  }
}

/**
 * Main entry point — demonstrates token-gate access flow.
 */
async function main(): Promise<void> {
  console.log(`Client EVM address: ${account.address}`);
  console.log(`Server: ${baseURL}`);
  console.log(`\nIf this wallet holds the required NFT, all requests will be free.`);
  console.log(`Otherwise the client will pay $0.001 USDC per request.\n`);

  await demonstrateResource("/weather");
  await demonstrateResource("/joke");

  console.log("\nDone.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

import { config } from "dotenv";
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

config();

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
if (!evmPrivateKey) {
  console.error("❌ EVM_PRIVATE_KEY environment variable is required");
  process.exit(1);
}

const baseURL = process.env.RESOURCE_SERVER_URL || "https://lookups.alienprobe.ai";
const endpointPath = process.env.ENDPOINT_PATH || "/v1/lookup/who/apple.com";
// Spend cap, in the asset's atomic units (USDC has 6 decimals: "100000" == $0.10,
// double the endpoint's $0.05 price). The hook below refuses to pay anything above
// this, no matter what the server asks for.
const maxPaymentAtomic = BigInt(process.env.MAX_PAYMENT_ATOMIC || "100000");
const url = `${baseURL}${endpointPath}`;

// This is the only example in this repo that spends real money on mainnet by
// default. Everything else here targets a local server or Base Sepolia
// testnet. Require an explicit opt-in before it can run at all.
if (process.env.X402_ALLOW_MAINNET !== "1") {
  console.error("This example pays $0.05 USDC on Base MAINNET from the key in .env.");
  console.error(
    "Set X402_ALLOW_MAINNET=1 to proceed; never fund a mainnet key you would not lose.",
  );
  process.exit(1);
}

/**
 * Example demonstrating a real, live x402-protected endpoint on Base mainnet.
 *
 * This hits lookups.alienprobe.ai, a third-party "who" lookup (resolves a
 * company name, domain, or LEI to a GLEIF legal-entity record) priced at a
 * fixed $0.05 in USDC on Base mainnet. It is not affiliated with Coinbase or
 * the x402 Foundation; it exists here to give newcomers something real to pay
 * for the "free 402 -> pay -> 200" flow without standing up a local server.
 *
 * The endpoint refuses malformed/missing/ambiguous/unreadable subjects for
 * free, before the payment boundary:
 * - 400 malformed input
 * - 404 no match in the snapshot
 * - 409 ambiguous name match (names only; re-ask with a jurisdiction suffix)
 * - 503 source shard unreadable
 * Only a 402 challenge costs anything, and only once you pay it.
 *
 * Required environment variables:
 * - EVM_PRIVATE_KEY: The private key of the EVM signer, funded with a small
 *   amount of USDC on Base mainnet (eip155:8453)
 *
 * Optional environment variables:
 * - RESOURCE_SERVER_URL: Overrides the resource server (default: this example's live endpoint)
 * - ENDPOINT_PATH: Overrides the endpoint path (default: /v1/lookup/who/apple.com)
 * - MAX_PAYMENT_ATOMIC: Spend cap in atomic units of the priced asset (default: "100000", i.e. $0.10 USDC)
 * - X402_ALLOW_MAINNET: Must be set to "1" to run at all. This is the only
 *   example in the repo that spends real money by default; there is no
 *   testnet twin, so the opt-in is the safety gate instead.
 */
async function main(): Promise<void> {
  const evmSigner = privateKeyToAccount(evmPrivateKey);

  const client = new x402Client();
  client.register("eip155:*", new ExactEvmScheme(evmSigner));
  client.onBeforePaymentCreation(async context => {
    const { amount } = context.selectedRequirements;
    if (BigInt(amount) > maxPaymentAtomic) {
      return {
        abort: true,
        reason: `Refusing to pay ${amount} — exceeds spend cap of ${maxPaymentAtomic}`,
      };
    }
  });

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  console.log(`Making request to: ${url}\n`);
  const response = await fetchWithPayment(url, { method: "GET" });
  const body = await response.json();

  if (!response.ok) {
    console.log(`Refused with ${response.status}:`, body);
    return;
  }

  console.log("Response body:", body);

  const paymentResponse = new x402HTTPClient(client).getPaymentSettleResponse(name =>
    response.headers.get(name),
  );
  console.log("\nPayment response:", JSON.stringify(paymentResponse, null, 2));
}

main().catch(error => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});

import { config } from "dotenv";
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

config();

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const resourceUrl =
  process.env.RESOURCE_URL || "https://api.stelardigital.com/pricecheck?asset=BTC";

/**
 * Example demonstrating how to buy from ANY live x402 endpoint with a TypeScript client.
 *
 * Unlike most x402 examples, this one does not spin up a local server — it targets a real,
 * already-deployed endpoint on Base mainnet, so you see the full 402 -> pay -> 200 flow
 * against actual infrastructure instead of localhost. RESOURCE_URL is bring-your-own: point
 * it at any live x402-protected URL and the flow is identical. Browse Coinbase Bazaar
 * (https://docs.cdp.coinbase.com/x402/bazaar) to discover live endpoints to try. The default
 * below is just one illustrative example of a live endpoint.
 *
 * How it works:
 * 1. wrapFetchWithPayment sends the initial request.
 * 2. The server responds 402 with a PAYMENT-REQUIRED header describing price, network,
 *    and asset for this resource.
 * 3. The registered scheme (ExactEvmScheme) signs a USDC payment authorization for that
 *    requirement — no gas needed, the facilitator settles it — and retries the request
 *    with a PAYMENT-SIGNATURE header.
 * 4. The server verifies and settles the payment, then returns 200 with the real response
 *    body and a PAYMENT-RESPONSE settlement receipt.
 *
 * Required environment variables:
 * - EVM_PRIVATE_KEY: private key of the EVM wallet paying for the request (needs USDC on
 *   Base mainnet)
 *
 * Optional environment variables:
 * - RESOURCE_URL: the x402-protected URL to call (defaults to one illustrative live
 *   endpoint; point it at any live x402 endpoint, e.g. one found via Coinbase Bazaar)
 */
async function main(): Promise<void> {
  const evmSigner = privateKeyToAccount(evmPrivateKey);

  const client = new x402Client();
  client.register("eip155:*", new ExactEvmScheme(evmSigner));

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  console.log(`Requesting: ${resourceUrl}\n`);
  const response = await fetchWithPayment(resourceUrl, { method: "GET" });
  const body = await response.json();
  console.log("Response body:", body);

  const paymentResponse = new x402HTTPClient(client).getPaymentSettleResponse(name =>
    response.headers.get(name),
  );
  console.log("\nSettlement:", JSON.stringify(paymentResponse, null, 2));
}

main().catch(error => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});

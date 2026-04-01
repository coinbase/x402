import { config } from "dotenv";
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { DeferredEvmScheme } from "@x402/evm/deferred/client";
import { privateKeyToAccount } from "viem/accounts";

config();

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const baseURL = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";
const endpointPath = process.env.ENDPOINT_PATH || "/api/generate";
const url = `${baseURL}${endpointPath}`;

/**
 * Deferred scheme client: session state (cumulative amount, nonce, deposit) lives inside
 * {@link DeferredEvmScheme}. After each successful paid response, call
 * {@link DeferredEvmScheme.processPaymentResponse} so the next request can build a voucher-only payload.
 *
 * Required environment variables:
 * - EVM_PRIVATE_KEY: The private key of the EVM signer
 */
async function main(): Promise<void> {
  const evmSigner = privateKeyToAccount(evmPrivateKey);

  const deferredScheme = new DeferredEvmScheme(evmSigner, { maxDeposit: "1000000", depositMultiplier: 5 });

  const client = new x402Client();
  client.register("eip155:*", deferredScheme);

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const httpClient = new x402HTTPClient(client);

  console.log(`Base URL: ${baseURL}, endpoint: ${endpointPath}\n`);

  for (let i = 0; i < 3; i++) {
    const response = await fetchWithPayment(url, { method: "GET" });
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    console.log(`Request ${i + 1}:`, body);

    const paymentResponse = httpClient.getPaymentSettleResponse(name =>
      response.headers.get(name),
    );
    console.log(`Request ${i + 1} payment response:\n${JSON.stringify(paymentResponse, null, 2)}\n`);

    deferredScheme.processPaymentResponse(name => response.headers.get(name));

    await new Promise(resolve => setTimeout(resolve, 10_000)); // Wait 10s before the next request
  }
}

main().catch(error => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});

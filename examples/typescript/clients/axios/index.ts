import { config } from "dotenv";
import { x402Client, wrapAxiosWithPayment, x402HTTPClient } from "@x402/axios";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import axios from "axios";

config();

/**
 * Endpoints to test
 * - /protected-currency
 * - /protected-eip3009
 * - /protected-eip2612
 * - /protected-erc20
 */

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const baseURL = "http://localhost:4021";
const endpointPath = "/protected-currency";
const url = `${baseURL}${endpointPath}`;

async function main(): Promise<void> {
  const evmSigner = privateKeyToAccount(evmPrivateKey);

  const client = new x402Client();
  client.register("eip155:*", new ExactEvmScheme(evmSigner));

  const api = wrapAxiosWithPayment(axios.create(), client);

  console.log(`Making request to: ${url}\n`);
  const response = await api.get(url);
  const body = response.data;
  console.log("Response body:", body);

  const paymentResponse = new x402HTTPClient(client).getPaymentSettleResponse(
    name => response.headers[name.toLowerCase()],
  );
  console.log("\nPayment response:", paymentResponse);
}

main().catch(error => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});

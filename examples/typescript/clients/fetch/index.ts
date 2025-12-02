import { config } from "dotenv";
import { wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { createBuilderPatternClient } from "./builder-pattern";
import { createMechanismHelperClient } from "./mechanism-helper-registration";

config();

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const svmPrivateKey = process.env.SVM_PRIVATE_KEY as `0x${string}`;
const baseURL = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";
const endpointPath = process.env.ENDPOINT_PATH || "/weather";
const url = `${baseURL}${endpointPath}`;

/**
 * Main example runner for @x402/fetch package demonstrations.
 *
 * This example shows how to use the @x402/fetch package to make a request
 * to a resource server that requires a payment. Different client creation
 * patterns can be selected via CLI argument:
 *
 * - builder-pattern: Basic builder pattern with registerScheme
 * - mechanism-helper-registration: Using helper functions for registration
 *
 * To run this example, you need to set the following environment variables:
 * - EVM_PRIVATE_KEY: The private key of the EVM signer
 * - SVM_PRIVATE_KEY: The private key of the SVM signer
 *
 * Usage:
 *   npm start builder-pattern
 *   npm start mechanism-helper-registration
 */
async function main(): Promise<void> {
  const pattern = process.argv[2] || "builder-pattern";

  console.log(`\nRunning example: ${pattern}\n`);

  let client;
  switch (pattern) {
    case "builder-pattern":
      client = await createBuilderPatternClient(evmPrivateKey, svmPrivateKey);
      break;
    case "mechanism-helper-registration":
      client = await createMechanismHelperClient(evmPrivateKey, svmPrivateKey);
      break;
    default:
      console.error(`Unknown pattern: ${pattern}`);
      console.error("Available patterns: builder-pattern, mechanism-helper-registration");
      process.exit(1);
  }

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  console.log(`Making request to: ${url}\n`);
  const response = await fetchWithPayment(url, { method: "GET" });
  const body = await response.json();
  console.log("Response body:", body);

  if (response.ok) {
    const paymentResponse = new x402HTTPClient(client).getPaymentSettleResponse(name =>
      response.headers.get(name),
    );
    console.log("\nPayment response:", paymentResponse);
  } else {
    console.log(`\nNo payment settled (response status: ${response.status})`);
  }
}

main().catch(error => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});

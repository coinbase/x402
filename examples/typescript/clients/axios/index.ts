import { config } from "dotenv";
import { wrapAxiosWithPayment, x402HTTPClient } from "@x402/axios";
import { createBuilderPatternClient } from "./builder-pattern";
import { createMechanismHelperClient } from "./mechanism-helper-registration";
import { createHooksClient } from "./hooks";
import axios from "axios";

config();

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const svmPrivateKey = process.env.SVM_PRIVATE_KEY as `0x${string}`;
const baseURL = "http://localhost:4021";
const endpointPath = "/weather";
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
 * - hooks: Demonstrating payment lifecycle hooks
 *
 * To run this example, you need to set the following environment variables:
 * - EVM_PRIVATE_KEY: The private key of the EVM signer
 * - SVM_PRIVATE_KEY: The private key of the SVM signer (not needed for hooks example)
 *
 * Usage:
 *   npm start builder-pattern
 *   npm start mechanism-helper-registration
 *   npm start hooks
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
    case "hooks":
      client = await createHooksClient(evmPrivateKey);
      break;
    default:
      console.error(`Unknown pattern: ${pattern}`);
      console.error("Available patterns: builder-pattern, mechanism-helper-registration, hooks");
      process.exit(1);
  }

  const api = wrapAxiosWithPayment(axios.create(), client);

  console.log(`Making request to: ${url}\n`);
  const response = await api.get(url);
  const body = response.data;
  console.log("Response body:", body);

  const paymentResponse = new x402HTTPClient(client).getPaymentSettleResponse(
    name => response.headers[name],
  );
  console.log("\nPayment response:", paymentResponse);
}

main().catch(error => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});

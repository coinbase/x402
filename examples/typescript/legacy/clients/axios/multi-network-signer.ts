import axios from "axios";
import { config } from "dotenv";
import {
  withPaymentInterceptor,
  decodeXPaymentResponse,
  createSigner,
  type Hex,
  MultiNetworkSigner,
} from "x402-axios";

config();

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as Hex;
const svmPrivateKey = process.env.SVM_PRIVATE_KEY as string;
const baseURL = process.env.RESOURCE_SERVER_URL as string; // e.g. https://example.com
const endpointPath = process.env.ENDPOINT_PATH as string; // e.g. /weather

if (!baseURL || !evmPrivateKey || !svmPrivateKey || !endpointPath) {
  console.error("Missing required environment variables");
  process.exit(1);
}

/**
 * This example shows how to use the x402-axios package to make a request to a resource server that requires a payment.
 *
 * To run this example, you need to set the following environment variables:
 * - PRIVATE_KEY: The private key of the signer
 * - RESOURCE_SERVER_URL: The URL of the resource server
 * - ENDPOINT_PATH: The path of the endpoint to call on the resource server
 *
 */
async function main(): Promise<void> {
  const evmSigner = await createSigner("base-sepolia", evmPrivateKey);
  const svmSigner = await createSigner("solana-devnet", svmPrivateKey);
  const signer = { evm: evmSigner, svm: svmSigner } as MultiNetworkSigner;

  const api = withPaymentInterceptor(
    axios.create({
      baseURL,
    }),
    signer,
  );

  const response = await api.get(endpointPath);
  console.log(response.data);

  const paymentResponse = decodeXPaymentResponse(response.headers["x-payment-response"]);
  console.log(paymentResponse);
}

main();
